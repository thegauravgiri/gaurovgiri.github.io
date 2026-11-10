import { useCallback, useEffect, useRef, useState } from "react";
import Avatar, { type AgentState, type Speech } from "./Avatar";
import Waveform from "./Waveform";
import { VoiceSession, type CallLimit, type Transcript } from "../../lib/voice";

type Msg = { id: number; role: "user" | "assistant" | "system"; text: string; partial?: boolean };

declare global {
  interface Window { turnstile?: { render(el: HTMLElement, o: Record<string, unknown>): string } }
}

const Icon = ({ d, className = "size-[1.15em]" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const MIC = "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3";
const MIC_OFF = "M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3";
const END = "M3 15.5c5.3-4.7 12.7-4.7 18 0l-2.2 2.6-3.6-1.4.2-2.6c-2.2-.8-4.6-.8-6.8 0l.2 2.6-3.6 1.4z";
const LIST = "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01";
const CLOSE = "M6 6l12 12M18 6L6 18";
const SEND = "M5 12h14M13 6l6 6-6 6";

const KEY = "M3 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5zM12 15v2";

// The unlocked pass lives in this browser only. It is a signed token the gateway can revoke; the code
// itself is never stored.
type Pass = { pass: string; expiresAt: number };
const PASS_KEY = "avatar-pass";
const loadPass = (): Pass | null => {
  try {
    const p = JSON.parse(localStorage.getItem(PASS_KEY) || "null") as Pass | null;
    return p && p.expiresAt * 1000 > Date.now() ? p : null;
  } catch { return null; }
};
const savePass = (p: Pass | null) => { try { p ? localStorage.setItem(PASS_KEY, JSON.stringify(p)) : localStorage.removeItem(PASS_KEY); } catch {} };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

const YOU = "#7cc4ff";   // the caller
const THEM = "#f5b700";  // the avatar

const STATUS: Record<string, string> = {
  idle: "",
  connecting: "Connecting…",
  live: "Call connected",
  text: "Call connected",
  ended: "Call ended",
};

export default function Agent({ api, turnstileSiteKey }: { api: string; turnstileSiteKey: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [phase, setPhase] = useState<keyof typeof STATUS>("idle");
  const [error, setError] = useState("");
  const [state, setState] = useState<AgentState>("idle");
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState(false);
  const speech = useRef<Speech>({ level: 0, tone: 0.5 });
  const levels = useRef({ out: 0, mic: 0 });
  const session = useRef<VoiceSession | null>(null);
  const connecting = useRef<Promise<VoiceSession> | null>(null);
  const live = useRef<{ user: number | null; assistant: number | null }>({ user: null, assistant: null });
  const nextId = useRef(1);
  const logBox = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<AgentState>("idle");
  const [left, setLeft] = useState<number | null>(null);   // seconds left in this call
  const deadline = useRef(0);
  const [pass, setPass] = useState<Pass | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [code, setCode] = useState("");
  const [unlockMsg, setUnlockMsg] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [outOfTime, setOutOfTime] = useState(false);

  useEffect(() => { setPass(loadPass()); }, []);

  // Talk time left this hour, shown under the Talk button. Fetched on load and after every call; the
  // reset countdown ticks locally.
  const [quota, setQuota] = useState<{ left: number; resetAt: number; skew: number } | null>(null);
  const [, tick] = useState(0);
  const refreshQuota = useCallback(async () => {
    if (!api) return;
    try {
      const r = await fetch(`${api.replace(/\/$/, "")}/quota`, { cache: "no-store" });
      const j = (await r.json()) as { left: number; resetAt: number; now: number };
      if (r.ok) setQuota({ left: j.left, resetAt: j.resetAt, skew: j.now * 1000 - Date.now() });
    } catch {}
  }, [api]);
  useEffect(() => { void refreshQuota(); }, [refreshQuota]);
  useEffect(() => {
    if (connected || !quota?.resetAt) return;
    const t = setInterval(() => {
      if (Date.now() + quota.skew >= quota.resetAt * 1000) void refreshQuota(); else tick((n) => n + 1);
    }, 15000);
    return () => clearInterval(t);
  }, [connected, quota, refreshQuota]);
  // Hang up when the page goes away, so the unused time is refunded.
  useEffect(() => {
    const bye = () => session.current?.end();
    addEventListener("pagehide", bye);
    return () => removeEventListener("pagehide", bye);
  }, []);
  // Call countdown; hangs up at zero.
  useEffect(() => {
    if (!connected || !deadline.current) return;
    const tick = () => {
      const s = Math.ceil((deadline.current - Date.now()) / 1000);
      setLeft(Math.max(0, s));
      if (s <= 0) {
        deadline.current = 0;
        add("system", "Time's up for this call.");
        setOutOfTime(true);
        session.current?.end();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [connected]);

  useEffect(() => { const el = logBox.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, drawer]);
  useEffect(() => () => session.current?.end(), []);
  useEffect(() => {
    if (!drawer) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [drawer]);

  const add = (role: Msg["role"], text: string, partial = false) => {
    const id = nextId.current++;
    setMsgs((m) => [...m, { id, role, text, partial }]);
    return id;
  };

  const onTranscript = useCallback(({ role, text, final }: Transcript) => {
    const cur = live.current[role];
    if (cur != null) setMsgs((m) => m.map((x) => (x.id === cur ? { ...x, text, partial: !final } : x)));
    else live.current[role] = add(role, text, !final);
    if (final) live.current[role] = null;
  }, []);

  const challenge = useCallback((): Promise<string | null> => {
    if (!turnstileSiteKey || !window.turnstile || !slot.current) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const el = slot.current!;
      el.innerHTML = "";
      window.turnstile!.render(el, {
        sitekey: turnstileSiteKey,
        callback: (t: string) => { el.innerHTML = ""; resolve(t); },
        "error-callback": () => reject(new Error("The human check failed. Reload the page and try again.")),
      });
    });
  }, [turnstileSiteKey]);

  const ensure = useCallback(async (mic: boolean): Promise<VoiceSession> => {
    if (session.current?.open) return session.current;
    if (connecting.current) return connecting.current;
    if (!api) { const e = "The voice service isn't set up on this site yet."; setError(e); throw new Error(e); }
    setError(""); setOutOfTime(false);
    connecting.current = (async () => {
      setPhase("connecting");
      const s = new VoiceSession(api.replace(/\/$/, ""), challenge, {
        onTranscript,
        onLevels: ({ out, mic: m, tone }) => {
          if (out !== undefined) levels.current.out = out;
          if (m !== undefined) levels.current.mic = m;
          speech.current.level = levels.current.out;
          if (tone !== undefined) speech.current.tone = tone;
          const next: AgentState = levels.current.out > 0.02 ? "speaking" : levels.current.mic > 0.03 ? "listening" : "idle";
          if (next !== stateRef.current) { stateRef.current = next; setState(next); }
        },
        onLimit: ({ seconds, unlimited }: CallLimit) => {
          deadline.current = Date.now() + seconds * 1000;
          if (!unlimited && loadPass()) { savePass(null); setPass(null); } // expired or revoked pass
        },
        // The service ends the call itself when the caller says goodbye; note it in the transcript.
        onEndRequested: () => add("system", "Gaurav (AI) ended the call."),
        onClose: () => {
          session.current = null; live.current = { user: null, assistant: null };
          deadline.current = 0; setLeft(null);
          setConnected(false); setMicOn(false); setMuted(false); speech.current.level = 0; stateRef.current = "idle"; setState("idle");
          setPhase("ended");
          setTimeout(() => void refreshQuota(), 800); // after /end has refunded the unused time
        },
      }, loadPass()?.pass ?? null);
      try { await s.connect(mic); } catch (err) { s.end(); throw err; }
      session.current = s;
      setConnected(true); setMicOn(mic);
      setPhase(mic ? "live" : "text");
      return s;
    })();
    try { return await connecting.current; }
    catch (err) {
      setPhase("idle");
      const status = (err as { status?: number }).status;
      if (status === 429 && /minutes/.test((err as Error).message)) setOutOfTime(true);
      void refreshQuota();
      setError(err instanceof Error && err.message && !/^(Forbidden|Bad Gateway|An unknown)/.test(err.message)
        ? err.message : "Couldn't connect. Check your connection and try again.");
      throw err;
    }
    finally { connecting.current = null; }
  }, [api, challenge, onTranscript, refreshQuota]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (unlocking || !code.trim() || !api) return;
    setUnlocking(true); setUnlockMsg("");
    try {
      const turnstile = await challenge();
      const r = await fetch(`${api.replace(/\/$/, "")}/unlock`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, turnstile }),
      });
      const j = (await r.json().catch(() => ({}))) as { pass?: string; expiresAt?: number; info?: string };
      if (r.ok && j.pass && j.expiresAt) {
        const p = { pass: j.pass, expiresAt: j.expiresAt };
        savePass(p); setPass(p); setCode(""); setUnlockOpen(false); setOutOfTime(false); setError("");
      } else setUnlockMsg(j.info || "That code didn't work.");
    } catch { setUnlockMsg("Couldn't check the code. Try again."); }
    finally { setUnlocking(false); }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim(); if (!text) return;
    setDraft("");
    try { const s = await ensure(false); add("user", text); await s.sendText(text); } catch { setDraft(text); }
  };

  const waveSource = useCallback(() => session.current?.analysers(), []);
  const lastBot = [...msgs].reverse().find((m) => m.role === "assistant");
  const lastYou = [...msgs].reverse().find((m) => m.role === "user");
  const youIsNewer = !!lastYou && (!lastBot || lastYou.id > lastBot.id);
  const turns = msgs.filter((m) => m.role !== "system").length;

  const askFields = (
    <>
      <label htmlFor="ask" className="sr-only">Type a question</label>
      <input id="ask" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder={connected ? "Type a question" : "Type instead"}
        className="h-12 min-w-0 flex-1 bg-transparent px-3 text-white placeholder:text-white/55 focus:outline-none" />
      <button className="icon-btn icon-btn-send" type="submit" disabled={!draft.trim()} aria-label="Send question" title="Send"><Icon d={SEND} /></button>
    </>
  );

  return (
    <>
      {turnstileSiteKey && <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer />}

      <section ref={stage} aria-label="Talk to Gaurav's avatar" className="stage relative isolate overflow-hidden bg-[#0b1116] text-white">
        {/* Backdrop: the real, out-of-focus scene from the photo, so the avatar sits in its own world. */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-75 blur-2xl" style={{ backgroundImage: "url(/avatar/plate.webp)" }} />
        <div aria-hidden="true" className="feed-frame feed-plate absolute -z-10 bg-cover bg-center" style={{ backgroundImage: "url(/avatar/plate.webp)" }} />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_38%,transparent_30%,rgba(6,10,13,.78)_100%)]" />

        <Avatar speechRef={speech} meterRef={stage} className="feed-frame feed-mask" />

        {/* Captions and controls */}
        <div className="stage-ui relative z-10 mx-auto max-w-3xl px-5 pb-10 text-center">
          <div className={`flex flex-col justify-end ${connected ? "min-h-16" : ""}`} aria-live="polite">
            {lastBot ? (
              <p className={`caption mx-auto max-w-[46ch] text-[clamp(1rem,1.5vw,1.2rem)] leading-relaxed ${lastBot.partial ? "opacity-90" : ""}`}>{lastBot.text}</p>
            ) : (
              <h1 className="caption display text-[clamp(2.6rem,6vw,4.4rem)]">
                Gaurav Giri
                <span lang="ne" className="mt-1 block text-[0.5em] font-medium text-white/75">गौरव गिरी</span>
              </h1>
            )}
            {youIsNewer && <p className="caption mx-auto mt-1.5 max-w-[46ch] text-[clamp(.95rem,1.4vw,1.1rem)] text-white/75">You: {lastYou!.text}</p>}
          </div>

          {connected ? (
            <div className="mx-auto mt-4 flex max-w-xl flex-col gap-2.5">
              {/* Call bar: secondary actions left, live waveform in the middle, End at the far edge. */}
              <div className="bar">
                <span className="sr-only" role="status">{STATUS[phase]}</span>
                <button className="icon-btn" onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="transcript"
                  aria-label={`Open transcript${turns ? `, ${turns} messages` : ""}`} title="Transcript">
                  <Icon d={LIST} />
                  {turns > 0 && <span className="badge" aria-hidden="true">{turns}</span>}
                </button>
                {micOn && (
                  <button className="icon-btn" aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute" : "Mute"}
                    onClick={() => { const m = !muted; setMuted(m); session.current?.setMuted(m); }}>
                    <Icon d={muted ? MIC_OFF : MIC} />
                  </button>
                )}
                {/* Your voice enters from the left, the avatar's from the right; colour says who is speaking. */}
                <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                  <span className="wave-key"><span style={{ background: YOU }} />You</span>
                  <Waveform source={waveSource} you={YOU} them={THEM} className="h-8 min-w-0 flex-1" />
                  <span className="wave-key">Gaurav<span style={{ background: THEM }} /></span>
                </div>
                {left != null && (
                  <span className={`shrink-0 tabular-nums text-sm ${left <= 30 ? "text-[#ffb4ab]" : "text-white/75"}`}
                    role="timer" aria-label={`${clock(left)} left in this call`} title="Time left in this call">{clock(left)}</span>
                )}
                <button className="icon-btn icon-btn-end" onClick={() => session.current?.end()} aria-label="End call" title="End call"><Icon d={END} /></button>
              </div>
              <form onSubmit={send} className="bar">{askFields}</form>
            </div>
          ) : (
            /* Before a call: one bar. Speak with the main button, or type and send. */
            <form onSubmit={send} className="bar mx-auto mt-6 max-w-xl">
              <button type="button" className="btn btn-onair h-12 shrink-0 !py-0" onClick={() => ensure(true).catch(() => {})} disabled={phase === "connecting"} aria-busy={phase === "connecting"}>
                {phase === "connecting" ? <span className="spinner" aria-hidden="true" /> : <Icon d={MIC} />}
                {phase === "connecting" ? "Connecting" : phase === "ended" ? "Talk again" : "Talk to me"}
              </button>
              {askFields}
            </form>
          )}

          {!connected && STATUS[phase] && phase !== "connecting" && <p className="mt-3 text-white/75">{STATUS[phase]}</p>}
          {!connected && !pass && quota && (() => {
            const resetIn = Math.max(0, Math.ceil((quota.resetAt * 1000 - Date.now() - quota.skew) / 60000));
            return (
              <p className="mt-3 text-sm text-white/70" role="status">
                {quota.left >= 20
                  ? <><span className="tabular-nums font-semibold text-white">{clock(quota.left)}</span> of talk time left{quota.resetAt ? ` · resets in ${resetIn} min` : " this hour"}</>
                  : <>No talk time left · resets in <span className="tabular-nums">{resetIn}</span> min</>}
              </p>
            );
          })()}
          {error && <p className="mt-3 text-[#ffb4ab]" role="alert">{error}</p>}

          {/* Access code: lifts the hourly limit. Checked only by the gateway, which rate-limits and locks out guessing. */}
          {!connected && (pass ? (
            <p className="mt-3 text-sm text-white/60">
              Access code active until {new Date(pass.expiresAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.{" "}
              <button className="underline hover:text-white" onClick={() => { savePass(null); setPass(null); }}>Forget it</button>
            </p>
          ) : unlockOpen ? (
            <form onSubmit={unlock} className="bar mx-auto mt-3 max-w-sm" autoComplete="off">
              <label htmlFor="code" className="sr-only">Access code</label>
              <input id="code" type="password" value={code} onChange={(e) => setCode(e.target.value)} maxLength={128}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Access code"
                className="h-11 min-w-0 flex-1 bg-transparent px-3 text-white placeholder:text-white/55 focus:outline-none" />
              <button className="btn btn-primary h-11 shrink-0 !py-0" type="submit" disabled={unlocking || !code.trim()} aria-busy={unlocking}>
                {unlocking ? "Checking" : "Unlock"}
              </button>
            </form>
          ) : (
            <button className={`mt-3 inline-flex items-center gap-1.5 text-sm hover:text-white ${outOfTime ? "text-white" : "text-white/50"}`}
              onClick={() => { setUnlockOpen(true); setUnlockMsg(""); }}>
              <Icon d={KEY} className="size-4" /> Have an access code?
            </button>
          ))}
          {unlockOpen && !pass && unlockMsg && <p className="mt-2 text-sm text-[#ffb4ab]" role="alert">{unlockMsg}</p>}
          <div ref={slot} className="mt-3 flex justify-center empty:hidden" />
        </div>
      </section>

      {/* Transcript drawer */}
      <div className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${drawer ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside id="transcript" aria-label="Transcript" inert={!drawer}
        className={`fixed inset-y-0 right-0 z-50 flex w-[min(26rem,100vw)] flex-col bg-mist p-6 text-ink shadow-2xl transition-transform duration-300 ${drawer ? "translate-x-0" : "translate-x-full"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="title text-xl">Transcript</h2>
          <button ref={closeBtn} className="grid size-9 place-items-center rounded-full hover:bg-haze" onClick={() => setDrawer(false)} aria-label="Close transcript"><Icon d={CLOSE} /></button>
        </div>
        <div ref={logBox} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2" role="log" aria-label="Conversation transcript">
          {msgs.length === 0 && <p className="text-slate">Nothing yet. Start talking or type a question, and the full conversation shows up here.</p>}
          {msgs.map((m) =>
            m.role === "system" ? <p key={m.id} className="text-sm text-slate">{m.text}</p> : (
              <div key={m.id} className={m.partial ? "opacity-60" : undefined}>
                <p className={`text-sm font-semibold ${m.role === "assistant" ? "text-ink" : "text-slate"}`}>{m.role === "assistant" ? "Gaurav (AI)" : "You"}</p>
                <p className="mt-0.5 leading-snug">{m.text}</p>
              </div>
            ),
          )}
        </div>
        <form onSubmit={send} className="mt-4 flex gap-2">
          <label htmlFor="ask2" className="sr-only">Type a question</label>
          <input id="ask2" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Type a question"
            className="min-w-0 flex-1 rounded-full bg-well px-4 py-2.5 placeholder:text-slate focus:outline-none focus-visible:outline-2 focus-visible:outline-marigold" />
          <button className="btn btn-primary" type="submit">Send</button>
        </form>
      </aside>
    </>
  );
}
