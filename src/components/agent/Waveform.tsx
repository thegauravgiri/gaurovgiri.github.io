import { useEffect, useRef } from "react";

type Source = () => { mic?: AnalyserNode; bot?: AnalyserNode } | undefined;

const BAR = 3, GAP = 2;          // px
const STEP_MS = 50;              // a new column every 50 ms, so the trace moves smoothly

function rms(an: AnalyserNode, buf: Uint8Array<ArrayBuffer>) {
  an.getByteTimeDomainData(buf);
  let s = 0;
  for (const v of buf) { const x = (v - 128) / 128; s += x * x; }
  return Math.sqrt(s / buf.length);
}

/**
 * Call waveform for both sides of the conversation, each in its own colour: the caller's voice flows in
 * from the left, the avatar's from the right. Reads the analysers directly every frame (no React renders).
 */
export default function Waveform({ source, you, them, className = "" }: { source: Source; you: string; them: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const buf = new Uint8Array(1024);
    let mic: number[] = [], bot: number[] = [], raf = 0, last = 0, peakMic = 0, peakBot = 0;

    const fit = () => {
      const dpr = Math.min(devicePixelRatio, 2);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(cv);

    const bar = (x: number, v: number, color: string, alpha: number, mid: number, maxH: number) => {
      const bh = Math.max(1, v * maxH);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x, mid - bh, BAR, bh * 2, BAR / 2); ctx.fill();
    };

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const w = cv.clientWidth, h = cv.clientHeight, pitch = BAR + GAP, cols = Math.floor(w / pitch);
      const a = source();
      // Hold the loudest value seen in each 50 ms step, so short syllables still register.
      if (a?.mic) peakMic = Math.max(peakMic, rms(a.mic, buf));
      if (a?.bot) peakBot = Math.max(peakBot, rms(a.bot, buf));
      if (t - last < STEP_MS) return;
      last = t;
      mic.push(Math.min(1, peakMic * 3.2)); bot.push(Math.min(1, peakBot * 3.2));
      peakMic = peakBot = 0;
      if (mic.length > cols) { mic = mic.slice(-cols); bot = bot.slice(-cols); }

      ctx.clearRect(0, 0, w, h);
      const mid = h / 2, maxH = h / 2 - 1;
      // Fixed baseline dots, so the line itself never moves.
      for (let x = 0; x + BAR <= w; x += pitch) bar(x, 0.02, "#ffffff", 0.22, mid, maxH);
      // The caller enters at the left edge and travels right; the avatar enters at the right and travels left.
      // Each fades as it crosses, so the two streams don't pile up in the middle.
      const n = mic.length;
      for (let age = 0; age < n; age++) {
        const fade = 1 - 0.8 * (age / cols);
        const m = mic[n - 1 - age], o = bot[n - 1 - age];
        if (m > 0.02) bar(age * pitch, m, you, fade, mid, maxH);
        if (o > 0.02) bar(w - BAR - age * pitch, o, them, fade, mid, maxH);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [source, you, them]);

  return <canvas ref={canvas} className={className} aria-hidden="true" />;
}
