import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Face, Rig } from "./types";

/**
 * Rigged 3D head (GLB) with ARKit-style face blendshapes, e.g. from KeenFace, Copresence, Avaturn or
 * Character Creator. Drives jaw, lip shapes, a resting smile and blinks from the same Face values as
 * the photo rig, frames the head automatically, and lights it with a soft studio environment.
 */

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Normalise a morph target name so different exporters match: "blendShape1.jawOpen", "jawOpen",
 * "JawOpen", "browDown_L" and "browDownLeft" all become comparable keys ("jawopen", "browdownleft").
 */
function key(name: string) {
  let n = name.split(/[.:|]/).pop() ?? name;
  n = n.replace(/[_\s-]?L$/, "Left").replace(/[_\s-]?R$/, "Right");
  return n.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type Target = { mesh: THREE.Mesh; index: number };

export async function buildFromGlb(url: string, renderer?: THREE.WebGLRenderer): Promise<Rig> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (renderer) loader.setKTX2Loader(new KTX2Loader().setTranscoderPath("/vendor/basis/").detectSupport(renderer));
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  // Index every blendshape on every mesh (face, teeth, tongue and eyes often each carry their own).
  const targets = new Map<string, Target[]>();
  let face: THREE.Mesh | undefined;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // morphing can move vertices outside the static bounds
    // Scans and photo-fitted heads often export as metallic; skin should be dielectric.
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      const s = mat as THREE.MeshStandardMaterial;
      if ("metalness" in s) { s.metalness = 0; s.roughness = Math.max(s.roughness ?? 0.6, 0.45); s.needsUpdate = true; }
      // Hair cards (cut-out strands): keep environment reflections low so they don't turn grey at grazing angles.
      if (mat.alphaTest > 0 || /hair/i.test(m.name)) s.envMapIntensity = 0.25;
    }
    if (!m.morphTargetDictionary) return;
    if (!face || Object.keys(m.morphTargetDictionary).length > Object.keys(face.morphTargetDictionary!).length) face = m;
    for (const [name, index] of Object.entries(m.morphTargetDictionary)) {
      const k = key(name);
      targets.set(k, [...(targets.get(k) ?? []), { mesh: m, index }]);
    }
  });
  if (!face || !targets.has("jawopen") && !targets.has("visemeaa") && !targets.has("mouthopen")) {
    throw new Error("This GLB has no face blendshapes (expected ARKit names like jawOpen).");
  }

  const set = (name: string, v: number) => {
    for (const t of targets.get(key(name)) ?? []) t.mesh.morphTargetInfluences![t.index] = clamp(v);
  };

  // Put the model in a group we control, centred on the face, so framing and head motion are predictable.
  const root = new THREE.Group();
  const pivot = new THREE.Group();     // head motion pivots around the neck
  root.add(pivot);
  pivot.add(model);
  model.updateMatrixWorld(true);
  const headBox = new THREE.Box3().setFromObject(face);
  const size = headBox.getSize(new THREE.Vector3());
  const centre = headBox.getCenter(new THREE.Vector3());
  // Neck pivot: below the centre of the face, slightly behind it.
  const neck = new THREE.Vector3(centre.x, headBox.min.y + size.y * 0.1, centre.z - size.z * 0.2);
  pivot.position.copy(neck);
  model.position.sub(neck);

  // Frame the face so it fills about two-thirds of the frame height, sitting a little above centre (captions go below).
  const fov = 24;
  const dist = (size.y / 0.68) / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const lookY = centre.y - size.y * 0.06;

  // A head bone, if the rig has one, gets the motion instead of the whole model.
  let headBone: THREE.Object3D | undefined;
  model.traverse((o) => { if (!headBone && (o as THREE.Bone).isBone && /head/i.test(o.name)) headBone = o; });
  const motion = headBone ?? pivot;
  const baseRot = motion.rotation.clone();

  // The skin texture is baked from photos, so it already carries real light and shadow: light it gently, or it
  // washes out pale and flat.
  const key1 = new THREE.DirectionalLight("#fff1e4", 0.9); key1.position.set(-1.5, 2, 3);
  const rim = new THREE.DirectionalLight("#9db8ff", 0.8); rim.position.set(2, 1.5, -2.5);
  root.add(key1, rim);
  [key1, rim].forEach((l) => l.position.multiplyScalar(size.y * 3).add(centre));

  // Blinks: a 140 ms close-open every 2.5 to 6 seconds, occasionally a double blink.
  let nextBlink = 1.5, blinkStart = -1;
  const blink = (t: number) => {
    if (blinkStart < 0 && t > nextBlink) blinkStart = t;
    let v = 0;
    if (blinkStart >= 0) {
      const p = (t - blinkStart) / 0.14;
      v = p < 0.5 ? p * 2 : 2 - p * 2;
      if (p >= 1) { blinkStart = -1; nextBlink = t + (Math.random() < 0.15 ? 0.25 : 2.5 + Math.random() * 3.5); v = 0; }
    }
    set("eyeBlinkLeft", v); set("eyeBlinkRight", v);
  };

  let envTex: THREE.Texture | undefined;

  return {
    kind: "glb",
    root,
    frame: { position: [centre.x, lookY, centre.z + dist], target: [centre.x, lookY, centre.z], fov },
    prepare(r, scene) {
      r.toneMapping = THREE.NeutralToneMapping; // keeps skin tones true (ACES desaturates and lifts them)
      r.toneMappingExposure = 1.0;
      const pmrem = new THREE.PMREMGenerator(r);
      envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();
    },
    update(f: Face, t: number, rimColor: THREE.Color) {
      void rimColor;
      // Jaw and lips
      set("jawOpen", f.open * 0.55);
      set("mouthOpen", f.open * 0.4);
      set("mouthLowerDownLeft", f.open * 0.3); set("mouthLowerDownRight", f.open * 0.3);
      set("mouthUpperUpLeft", f.open * 0.12); set("mouthUpperUpRight", f.open * 0.12);
      set("mouthFunnel", f.round * 0.5);
      set("mouthPucker", f.round * 0.45);
      set("mouthStretchLeft", f.wide * 0.35); set("mouthStretchRight", f.wide * 0.35);
      // A slight resting smile, a bit wider on "ee" sounds
      const smile = 0.12 + f.wide * 0.18;
      set("mouthSmileLeft", smile); set("mouthSmileRight", smile);
      // Oculus visemes, for rigs that only have those
      set("viseme_aa", f.open * (1 - f.round) * (1 - f.wide));
      set("viseme_O", f.round * f.open);
      set("viseme_E", f.wide * f.open);
      set("viseme_sil", 1 - f.open);
      // Brows lift a touch while speaking
      set("browInnerUp", 0.08 + f.open * 0.15);
      // Eyes a touch more open than the fitted neutral (the generic lids sit low)
      set("eyeWideLeft", 0.3); set("eyeWideRight", 0.3);
      blink(t);
      // Idle head motion, plus small nods with speech
      motion.rotation.set(
        baseRot.x + Math.sin(t * 0.43) * 0.02 + f.open * 0.03,
        baseRot.y + Math.sin(t * 0.55) * 0.06,
        baseRot.z + Math.sin(t * 0.33) * 0.012,
      );
    },
    dispose() {
      envTex?.dispose();
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of ([] as THREE.Material[]).concat(m.material)) {
          for (const v of Object.values(mat)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
          mat.dispose();
        }
      });
    },
  };
}
