import { useEffect, useRef, type RefObject } from "react";
import type { Rig } from "./rig/types";

export type AgentState = "idle" | "listening" | "speaking";
/** level: loudness 0..1. tone: spectral brightness 0..1 (low = "oo", high = "ee"). */
export type Speech = { level: number; tone: number };

/**
 * Real-time 3D avatar (three.js), rendered on a transparent canvas that fills its parent, so the
 * page can put it in front of its own backdrop. Uses /avatar.glb when present, otherwise the
 * photo-fitted head. `speechRef` is read every frame, so audio metering never re-renders React.
 * `meterRef` (optional) receives a `--lvl` CSS variable (0..1) with the smoothed voice level.
 */
export default function Avatar({ speechRef, meterRef, className = "" }: {
  speechRef: { current: Speech };
  meterRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false, raf = 0, cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { buildPhotoFace } = await import("./rig/photoFace");
      if (disposed || !host.current) return;
      const el = host.current;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
      renderer.domElement.setAttribute("role", "img");
      renderer.domElement.setAttribute("aria-label", "Gaurav's 3D avatar");
      el.appendChild(renderer.domElement);

      let rig: Rig | undefined;
      try {
        if ((await fetch("/avatar.glb", { method: "HEAD" })).ok) {
          const { buildFromGlb } = await import("./rig/glb");
          rig = await buildFromGlb("/avatar.glb", renderer);
        }
      } catch (err) { console.warn("avatar.glb could not be used, falling back to the photo avatar:", err); }
      rig ??= await buildPhotoFace("/avatar/face.json", "/avatar/texture.webp");
      if (disposed) { rig.dispose(); renderer.dispose(); return; }

      const scene = new THREE.Scene();
      scene.add(rig.root);
      rig.prepare?.(renderer, scene);
      // Let the page adapt its backdrop to the kind of avatar (e.g. hide the photo's blurred silhouette for a 3D model).
      if (meterRef?.current) meterRef.current.dataset.rig = rig.kind;
      const cam = new THREE.PerspectiveCamera(rig.frame.fov, 1, 0.05, 100);
      cam.position.set(...rig.frame.position);
      cam.lookAt(...rig.frame.target);

      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        const c = rig!.frame.crop;
        if (c) cam.setViewOffset(w * c.zoom, h * c.zoom, w * c.zoom * c.cx - w / 2, h * c.zoom * c.cy - h / 2, w, h);
        cam.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize); ro.observe(el);

      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const face = { open: 0, wide: 0, round: 0 };
      const white = new THREE.Color("#ffffff");
      const clock = new THREE.Clock();
      let visible = true, meter = 0;
      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);

      const approach = (cur: number, target: number) => cur + (target - cur) * (target > cur ? 0.55 : 0.3); // fast attack, slower release
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!visible || document.hidden) return;
        const { level, tone } = speechRef.current;
        const speaking = level > 0.03;
        const open = Math.min(1, Math.max(0, level - 0.03) * 3.2);
        // Map brightness to a vowel-ish shape: dark -> rounded "oo", bright -> spread "ee", middle -> open "aa".
        const round = speaking ? Math.min(1, Math.max(0, (0.34 - tone) / 0.18)) : 0;
        const wide = speaking ? Math.min(1, Math.max(0, (tone - 0.5) / 0.22)) : 0;
        face.open = approach(face.open, open);
        face.round = approach(face.round, round * Math.min(1, open * 1.5));
        face.wide = approach(face.wide, wide * Math.min(1, open * 1.5));
        meter += (level - meter) * 0.3;
        meterRef?.current?.style.setProperty("--lvl", Math.min(1, meter * 3).toFixed(3));
        rig.update(face, reduced ? 0 : clock.getElapsedTime(), white);
        renderer.render(scene, cam);
      };
      loop();

      cleanup = () => {
        ro.disconnect(); io.disconnect();
        rig.dispose(); renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => { disposed = true; cancelAnimationFrame(raf); cleanup(); };
  }, [speechRef, meterRef]);

  return <div ref={host} className={className} />;
}
