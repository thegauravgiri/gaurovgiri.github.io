import * as THREE from "three";
import type { Face, Rig } from "./types";

/**
 * Photo-fitted 3D head.
 *
 * - `face.json` holds MediaPipe's 468-point 3D face mesh fitted to the photo (run once, offline).
 * - The skin is that mesh textured with the real photo, so the likeness is exact. A flat cut-out of
 *   the whole photo sits just behind it (hair, ears, neck, jacket) for real parallax when the head turns.
 * - The jaw is a hinge: lower-face vertices rotate about an ear-level pivot, the lips reshape for
 *   "oo"/"ee", and the mouth interior (teeth, tongue) is a separate mesh filling the opening.
 */

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

const CAM_DIST = 5.1;                         // camera distance used to cancel perspective at rest
const MAX_JAW = 0.17;                          // radians at open = 1
const INNER_UPPER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
const INNER_LOWER = [308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78];
const OUTER_LOWER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LOOP = [...INNER_UPPER.slice(0, -1), ...INNER_LOWER.slice(0, -1)]; // 20 points around the mouth opening

interface FaceData { w: number; h: number; lm: number[][]; tris: number[] }

function interiorTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const g = c.getContext("2d")!;
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0.0, "#1a0708");   // shadow under the upper lip
  v.addColorStop(0.07, "#8f8378");  // upper teeth, in shadow at the gum line
  v.addColorStop(0.14, "#c9bdad");
  v.addColorStop(0.22, "#a99b8a");
  v.addColorStop(0.3, "#2a0c0f");   // dark mouth cavity
  v.addColorStop(0.7, "#36110f");
  v.addColorStop(0.86, "#4e1d20");  // faint tongue
  v.addColorStop(1.0, "#1c0709");
  g.fillStyle = v; g.fillRect(0, 0, 128, 128);
  const h = g.createLinearGradient(0, 0, 128, 0);  // darker toward the mouth corners
  h.addColorStop(0, "rgba(10,2,3,.9)"); h.addColorStop(0.22, "rgba(10,2,3,0)");
  h.addColorStop(0.78, "rgba(10,2,3,0)"); h.addColorStop(1, "rgba(10,2,3,.9)");
  g.fillStyle = h; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function buildPhotoFace(dataUrl: string, textureUrl: string): Promise<Rig> {
  const [data, tex] = await Promise.all([
    fetch(dataUrl).then((r) => r.json() as Promise<FaceData>),
    new THREE.TextureLoader().loadAsync(textureUrl),
  ]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const N = data.lm.length;
  const zref = OVAL.reduce((s, i) => s + data.lm[i][2], 0) / OVAL.length;

  // World positions. Perspective is cancelled so the mesh projects exactly onto the photo at rest.
  const base = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = data.lm[i];
    const Z = (zref - z) * 2 * 1.15; // MediaPipe depth is in image-width units
    const k = (CAM_DIST - Z) / CAM_DIST;
    base[i * 3] = (x - 0.5) * 2 * k;
    base[i * 3 + 1] = -(y - 0.5) * 2 * k;
    base[i * 3 + 2] = Z;
  }
  const px = (i: number) => base[i * 3], py = (i: number) => base[i * 3 + 1], pz = (i: number) => base[i * 3 + 2];

  const u = Math.hypot(px(454) - px(234), py(454) - py(234));      // face width: our unit of length
  const xc = (px(234) + px(454)) / 2;
  const seamY = (py(13) + py(14)) / 2;
  const mouthC = new THREE.Vector3(xc, seamY, pz(13));
  const pivot = new THREE.Vector3(0, (py(234) + py(454)) / 2, (pz(234) + pz(454)) / 2 - 0.3 * u);

  // Which triangles are the mouth opening (they become the interior mesh instead of skin).
  const loopSet = new Set(LOOP);
  const skinTris: number[] = [], mouthTris: number[] = [];
  for (let i = 0; i < data.tris.length; i += 3) {
    const t = [data.tris[i], data.tris[i + 1], data.tris[i + 2]];
    (t.every((v) => loopSet.has(v)) ? mouthTris : skinTris).push(...t);
  }

  // Jaw weight per landmark; lip influence for shaping.
  const jawW = new Float32Array(N), lipW = new Float32Array(N);
  const upper = new Set(INNER_UPPER), lower = new Set(INNER_LOWER), outerLower = new Set(OUTER_LOWER);
  for (let i = 0; i < N; i++) {
    const dx = Math.abs(px(i) - xc) / u, t = (seamY - py(i)) / u; // t > 0 below the lip seam
    let w = ss(0.02, 0.09, t) * (1 - ss(0.34, 0.56, dx));
    if (upper.has(i)) w = 0;
    if (lower.has(i) || outerLower.has(i)) w = 1;
    if (i === 78 || i === 308 || i === 61 || i === 291) w = 0.3;
    jawW[i] = w;
    const d = Math.hypot(px(i) - mouthC.x, py(i) - mouthC.y) / u;
    lipW[i] = Math.exp(-Math.pow(d / 0.26, 2));
  }

  // ---------- skin mesh ----------
  const skinGeo = new THREE.BufferGeometry();
  const skinPos = new Float32Array(base);
  const uv = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { uv[i * 2] = data.lm[i][0]; uv[i * 2 + 1] = 1 - data.lm[i][1]; }
  skinGeo.setAttribute("position", new THREE.BufferAttribute(skinPos, 3));
  skinGeo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  skinGeo.setIndex(skinTris);
  const skin = new THREE.Mesh(skinGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  skin.renderOrder = 1;

  // ---------- mouth interior ----------
  const loopPos = new Float32Array(LOOP.length * 3);
  const loopUV = new Float32Array(LOOP.length * 2);
  const xs = LOOP.map((i) => px(i)), minX = Math.min(...xs), maxX = Math.max(...xs);
  LOOP.forEach((idx, k) => {
    const isUpper = upper.has(idx) && !lower.has(idx);
    const isLower = lower.has(idx) && !upper.has(idx);
    loopUV[k * 2] = (px(idx) - minX) / (maxX - minX);
    loopUV[k * 2 + 1] = isUpper ? 1 : isLower ? 0 : 0.5; // canvas textures are flipped in V: 1 = top of the image
  });
  const slot = new Map(LOOP.map((idx, k) => [idx, k]));
  const mouthGeo = new THREE.BufferGeometry();
  mouthGeo.setAttribute("position", new THREE.BufferAttribute(loopPos, 3));
  mouthGeo.setAttribute("uv", new THREE.BufferAttribute(loopUV, 2));
  mouthGeo.setIndex(mouthTris.map((v) => slot.get(v)!));
  // Bounded exactly by the inner-lip contour, so it is drawn over the skin without depth testing.
  const mouthMat = new THREE.MeshBasicMaterial({ map: interiorTexture(), side: THREE.DoubleSide, depthTest: false });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.renderOrder = 2;

  // ---------- cut-out of the whole photo behind the face ----------
  const PLANE_Z = -0.07, k = (CAM_DIST - PLANE_Z) / CAM_DIST;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * k, 2 * k), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  plane.position.z = PLANE_Z;
  plane.renderOrder = 0;

  // The head turns about the neck: a pivot group at the base of the neck, content offset back.
  const neck = new THREE.Vector3(0, seamY - 1.1 * u, -0.25);
  const head = new THREE.Group();
  const content = new THREE.Group();
  content.position.copy(neck).multiplyScalar(-1);
  content.add(plane, skin, mouth);
  head.add(content);
  head.position.copy(neck);
  const root = new THREE.Group();
  root.add(head);

  const v = new THREE.Vector3();
  const lipIdx = new Set<number>([...INNER_UPPER, ...INNER_LOWER, ...OUTER_LOWER, 0, 37, 39, 40, 185, 267, 269, 270, 409, 61, 291]);

  function deform(f: Face, out: Float32Array, i: number) {
    let x = px(i), y = py(i), z = pz(i);
    const lw = lipW[i];
    // lip shaping about the mouth centre: "oo" narrows and pushes forward, "ee" spreads
    const sx = 1 + (0.22 * f.wide + 0.05 * f.open) * lw - 0.5 * f.round * lw;
    x = mouthC.x + (x - mouthC.x) * sx;
    z += 0.07 * u * f.round * lw * (lipIdx.has(i) ? 1 : 0.4);
    // jaw hinge
    const a = MAX_JAW * f.open * jawW[i];
    if (a > 1e-4) {
      const dy = y - pivot.y, dz = z - pivot.z, c = Math.cos(a), s = Math.sin(a);
      y = pivot.y + dy * c - dz * s;
      z = pivot.z + dy * s + dz * c;
    }
    out[0] = x; out[1] = y; out[2] = z;
  }

  const tmp = new Float32Array(3);
  function update(f: Face, t: number) {
    for (let i = 0; i < N; i++) {
      deform(f, tmp, i);
      skinPos[i * 3] = tmp[0]; skinPos[i * 3 + 1] = tmp[1]; skinPos[i * 3 + 2] = tmp[2];
    }
    (skinGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    LOOP.forEach((idx, kk) => {
      loopPos[kk * 3] = skinPos[idx * 3]; loopPos[kk * 3 + 1] = skinPos[idx * 3 + 1]; loopPos[kk * 3 + 2] = skinPos[idx * 3 + 2] - 0.004;
    });
    (mouthGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // idle + speech-linked head motion
    head.rotation.y = Math.sin(t * 0.55) * 0.05 + Math.sin(t * 1.7) * 0.008;
    head.rotation.x = Math.sin(t * 0.41) * 0.018 + f.open * 0.025;
    head.rotation.z = Math.sin(t * 0.33) * 0.01;
    head.position.y = neck.y + Math.sin(t * 1.1) * 0.004;
  }
  void v;

  return {
    kind: "photo",
    root,
    update,
    frame: { position: [0, 0, CAM_DIST], target: [0, 0, 0], fov: 2 * Math.atan(1 / CAM_DIST) * (180 / Math.PI), crop: { zoom: 1.0, cx: 0.5, cy: 0.5 } },
    dispose() { skinGeo.dispose(); mouthGeo.dispose(); mouthMat.map?.dispose(); tex.dispose(); plane.geometry.dispose(); },
  };
}
