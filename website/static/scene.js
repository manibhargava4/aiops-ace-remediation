/* Three.js WebGL backdrop — shared "environment" for the game-select and worlds.
   Particle field + cursor parallax + hover-lean + cinematic enter dolly + bloom.
   Degrades to nothing (CSS gradients carry) on no-WebGL / reduced-motion.
   Built with the webgpu-threejs-tsl skill's Three.js guidance (WebGL variant). */
import * as THREE from "three";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
let renderer, scene, camera, points, composer, bloom, raf;
let poleA = new THREE.Color("#3B4EFF"), poleB = new THREE.Color("#FF4D2E");
const tgtA = poleA.clone(), tgtB = poleB.clone();
const N = 4200;
let t01 = null; // per-particle mix factor
let lean = 0, leanTarget = 0, mx = 0, my = 0, camZ = 22, camZTarget = 22, dolly = false;
const clock = { last: performance.now() };

const THEMES = {
  local: { a: "#3B4EFF", b: "#FF4D2E", size: 0.05, opacity: 0.9, bloom: 0.35, fog: "#EEF1F6" },
  cloud: { a: "#FF9900", b: "#4DD0E1", size: 0.055, opacity: 0.95, bloom: 0.9, fog: "#141C29" },
};

export function initScene(canvas) {
  if (reduced || !canvas) return false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 0, camZ);

  // particle slab
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  t01 = new Float32Array(N);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    pos[i*3]   = (Math.random() - 0.5) * 44;
    pos[i*3+1] = (Math.random() - 0.5) * 26;
    pos[i*3+2] = (Math.random() - 0.5) * 14;
    const t = Math.random(); t01[i] = t;
    c.copy(poleA).lerp(poleB, t);
    col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.userData.base = pos.slice();
  const mat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.9,
    sizeAttenuation: true, depthWrite: false });
  points = new THREE.Points(geo, mat);
  scene.add(points);

  // optional cinematic bloom (guarded)
  Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
  ]).then(([{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }]) => {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.7, 0.2);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(innerWidth, innerHeight);
  }).catch(() => { composer = null; });

  addEventListener("resize", onResize);
  addEventListener("pointermove", (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
  loop();
  return true;
}

function onResize() {
  if (!renderer) return;
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer && composer.setSize(innerWidth, innerHeight);
}

function loop() {
  raf = requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min((now - clock.last) / 1000, 0.05); clock.last = now;
  const time = now * 0.001;

  // ease pole colors toward theme target, refresh vertex colors occasionally
  poleA.lerp(tgtA, 0.05); poleB.lerp(tgtB, 0.05);
  const col = points.geometry.getAttribute("color"); const c = new THREE.Color();
  for (let i = 0; i < N; i += 3) { // stride for perf
    c.copy(poleA).lerp(poleB, t01[i]); col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;

  // procedural drift wave on positions
  const p = points.geometry.getAttribute("position"), base = points.geometry.userData.base;
  for (let i = 0; i < N; i++) {
    const bx = base[i*3], by = base[i*3+1], bz = base[i*3+2];
    p.setXYZ(i, bx + Math.sin(time * 0.5 + by * 0.15) * 0.5, by + Math.cos(time * 0.4 + bx * 0.1) * 0.35, bz);
  }
  p.needsUpdate = true;
  points.rotation.z = Math.sin(time * 0.05) * 0.04;

  // hover lean + cursor parallax
  lean += (leanTarget - lean) * 0.06;
  camZ += (camZTarget - camZ) * (dolly ? 0.12 : 0.05);
  camera.position.x += ((mx * 4 + lean * 6) - camera.position.x) * 0.05;
  camera.position.y += (-my * 3 - camera.position.y) * 0.05;
  camera.position.z = camZ;
  camera.lookAt(0, 0, 0);

  composer ? composer.render() : renderer.render(scene, camera);
}

export function sceneSetTheme(mode) {
  const th = THEMES[mode] || THEMES.local;
  tgtA.set(th.a); tgtB.set(th.b);
  if (points) { points.material.size = th.size; points.material.opacity = th.opacity; }
  if (scene) scene.fog = new THREE.Fog(new THREE.Color(th.fog), 30, 90);
  if (bloom) bloom.strength = th.bloom;
}

export function sceneLean(side) { leanTarget = side === "local" ? -1 : side === "cloud" ? 1 : 0; }

export function sceneEnter(cb) {
  dolly = true; camZTarget = 3;
  setTimeout(() => { cb && cb(); dolly = false; camZTarget = 22; }, 620);
}
