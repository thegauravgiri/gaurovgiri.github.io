import type * as THREE from "three";

/** Mouth shape, all 0..1. `open` = jaw, `wide` = "ee"-like spread, `round` = "oo"-like pucker. */
export interface Face { open: number; wide: number; round: number }

export interface Rig {
  /** "photo" = mesh fitted to a photo (unlit); "glb" = a rigged, lit 3D model. */
  kind: "photo" | "glb";
  root: THREE.Object3D;
  update(face: Face, t: number, rim: THREE.Color): void;
  /** Camera framing for this rig. */
  frame: {
    position: [number, number, number]; target: [number, number, number]; fov: number;
    /** Optional off-axis crop (zoom about a point given in 0..1 frame coords). Keeps layers aligned. */
    crop?: { zoom: number; cx: number; cy: number };
  };
  /** Optional one-time setup that needs the renderer (e.g. environment lighting, tone mapping). */
  prepare?(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void;
  dispose(): void;
}
