// Realtime voice session over WebRTC using the Pipecat client. It talks only to our gateway
// (/start and /sessions/*), never to the orchestrator directly, and never chooses the system prompt.
import type { PipecatClient } from "@pipecat-ai/client-js";

// OmniVoice non-verbal tags ([laughter], [surprise-oh], ...) are spoken as sounds, not shown as text.
// A trailing unclosed "[..." is hidden too, so a tag streaming in token by token never flashes on screen.
const spoken = (t: string) => t.replace(/\[[a-z-]+\]\s*/gi, "").replace(/\[[a-z-]*$/i, "").trim();

export type Transcript = { role: "user" | "assistant"; text: string; final: boolean };

export interface VoiceEvents {
  onTranscript(t: Transcript): void;
  onLevels(l: { out?: number; mic?: number; tone?: number }): void;
  onClose(): void;
  /** The service decided the conversation is over (e.g. the caller said goodbye). */
  onEndRequested?(reason: string): void;
  /** Talk time granted for this call (the gateway enforces an hourly allowance). */
  onLimit?(l: CallLimit): void;
}

export type CallLimit = { seconds: number; unlimited: boolean; resetAt: number };
type StartResponse = { limit?: CallLimit; endToken?: string | null };

/** Server message the orchestrator sends after its end-of-call tool runs and the goodbye has been spoken. */
type ServerEvent = { type?: string; name?: string; args?: { reason?: string } };
const isEndConversation = (d: unknown): d is ServerEvent =>
  !!d && typeof d === "object" && (d as ServerEvent).type === "event" && (d as ServerEvent).name === "end_conversation";

// How long to let the goodbye finish playing locally before hanging up (playback lags the server slightly).
const END_GRACE_MS = 1200;

export class VoiceSession {
  private client?: PipecatClient;
  private audio?: HTMLAudioElement;
  private actx?: AudioContext;
  private analyser?: AnalyserNode;
  private micAnalyser?: AnalyserNode;
  private micTrackId = "";
  private raf = 0;
  private botText = "";
  private ready = false;
  private closed = false;
  private ending = false;
  private endToken: string | null = null;

  constructor(private api: string, private getChallenge: () => Promise<string | null>, private ev: VoiceEvents,
    private pass: string | null = null) {}

  get open() { return this.ready; }

  async connect(mic: boolean) {
    // Loaded lazily: these packages touch `window`, and this component is also server-rendered.
    const [{ PipecatClient }, { SmallWebRTCTransport }] = await Promise.all([
      import("@pipecat-ai/client-js"),
      import("@pipecat-ai/small-webrtc-transport"),
    ]);
    const turnstile = await this.getChallenge();

    this.audio = new Audio();
    this.audio.autoplay = true;
    this.actx = new AudioContext(); // one context for both meters; created right after the user's click
    void this.actx.resume();

    this.client = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: mic,
      enableCam: false,
      callbacks: {
        onTrackStarted: (track, participant) => {
          if (track.kind !== "audio") return;
          if (participant?.local) { this.tapMic(track); return; }
          if (!this.audio) return;
          const stream = new MediaStream([track]);
          this.audio.srcObject = stream;
          void this.audio.play().catch(() => {});
          this.meter(stream);
        },
        // The WebRTC transport emits no audio-level callbacks (only the Daily one does), so the bot's
        // level is measured from its track (see meter()) and "listening" comes from VAD events.
        onUserStartedSpeaking: () => this.ev.onLevels({ mic: 0.1 }),
        onUserStoppedSpeaking: () => this.ev.onLevels({ mic: 0 }),
        onUserTranscript: (d) => this.ev.onTranscript({ role: "user", text: d.text, final: d.final }),
        onBotLlmStarted: () => { this.botText = ""; },
        onBotLlmText: (d) => {
          this.botText += d.text;
          this.ev.onTranscript({ role: "assistant", text: spoken(this.botText), final: false });
        },
        onBotLlmStopped: () => {
          if (spoken(this.botText)) this.ev.onTranscript({ role: "assistant", text: spoken(this.botText), final: true });
          this.botText = "";
        },
        onServerMessage: (d) => {
          if (!isEndConversation(d) || this.ending) return;
          this.ending = true;
          this.ev.onEndRequested?.(d.args?.reason ?? "");
          setTimeout(() => this.end(), END_GRACE_MS);
        },
        onDisconnected: () => this.close(),
      },
    });

    // Only the Turnstile token (and an access pass, if any) is sent. System prompt, voice and flags are
    // injected by the gateway, which also decides how long this call may last.
    const started = (await this.client.startBot({
      endpoint: `${this.api}/start`,
      requestData: { transport: "webrtc", turnstile, ...(this.pass ? { pass: this.pass } : {}) },
    })) as StartResponse;
    this.endToken = started.endToken ?? null;
    await this.client.connect(started as never);
    if (started.limit) this.ev.onLimit?.(started.limit);
    const micTrack = this.client.tracks().local.audio;
    if (micTrack) this.tapMic(micTrack);
    this.ready = true;
  }

  async sendText(text: string) {
    await this.client?.sendText(text, { run_immediately: true, audio_response: true });
  }

  setMuted(m: boolean) { this.client?.enableMic(!m); }

  /** Live analysers for the waveform: the caller's microphone and the avatar's voice. */
  analysers(): { mic?: AnalyserNode; bot?: AnalyserNode } {
    return { mic: this.micAnalyser, bot: this.analyser };
  }

  /** Taps the caller's microphone track (not routed to the speakers). Muting disables the track, so it reads silence. */
  private tapMic(track: MediaStreamTrack) {
    if (!this.actx || track.id === this.micTrackId) return;
    this.micTrackId = track.id;
    const an = this.actx.createAnalyser();
    an.fftSize = 1024;
    this.actx.createMediaStreamSource(new MediaStream([track])).connect(an);
    this.micAnalyser = an;
  }

  /** Reads the bot's audio level every frame to drive the avatar's mouth. */
  private meter(stream: MediaStream) {
    cancelAnimationFrame(this.raf);
    this.actx ??= new AudioContext();
    const actx = this.actx;
    void actx.resume();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    actx.createMediaStreamSource(stream).connect(analyser); // not routed to speakers; <audio> plays it
    this.analyser = analyser;
    const time = new Uint8Array(analyser.fftSize);
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const hz = actx.sampleRate / analyser.fftSize; // width of one frequency bin
    const lo = Math.floor(200 / hz), hi = Math.floor(3500 / hz);
    const loop = () => {
      analyser.getByteTimeDomainData(time);
      let sum = 0;
      for (const v of time) { const x = (v - 128) / 128; sum += x * x; }
      const level = Math.min(1, Math.sqrt(sum / time.length) * 2.5);

      // Spectral centroid of the speech band (200 Hz to 3.5 kHz), 0 = low/dark ("oo"), 1 = high/bright ("ee").
      // It's a cheap stand-in for formants that lets the mouth change shape, not just open and close.
      analyser.getByteFrequencyData(freq);
      let wsum = 0, tot = 0;
      for (let i = lo; i <= hi; i++) { wsum += freq[i] * (i - lo); tot += freq[i]; }
      const tone = tot > 0 ? wsum / tot / (hi - lo) : 0.5;

      this.ev.onLevels({ out: level, tone });
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  private close() {
    cancelAnimationFrame(this.raf);
    // Tell the gateway the call is over so unused talk time is refunded. text/plain avoids a CORS
    // preflight, and keepalive lets it finish even if the page is closing.
    if (this.endToken) {
      void fetch(`${this.api}/end`, { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ endToken: this.endToken }) }).catch(() => {});
      this.endToken = null;
    }
    this.actx?.close().catch(() => {});
    this.actx = undefined; this.analyser = undefined; this.micAnalyser = undefined; this.micTrackId = "";
    this.ready = false;
    if (this.audio) { this.audio.srcObject = null; this.audio = undefined; }
    if (!this.closed) { this.closed = true; this.ev.onClose(); }
  }

  end() {
    void this.client?.disconnect().catch(() => {});
    this.close();
  }
}
