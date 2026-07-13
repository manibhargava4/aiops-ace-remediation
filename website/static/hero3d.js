/* WebGPU / Three.js TSL hero — GPU-compute particle field.
   A "metric stream": particles advect through a flow field, calm-green in
   steady state, turbulent-red when an incident is live. Driven by the real demo
   via window.__setIncident(0..1). Degrades to the CSS field on no-WebGPU /
   reduced-motion (built with the webgpu-threejs-tsl skill). */
import * as THREE from "three/webgpu";
import {
  Fn, If, uniform, float, vec3, color, instancedArray, instanceIndex, hash, time,
} from "three/tsl";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  || new URLSearchParams(location.search).has("noanim"); // screenshot/test escape hatch
const canvas = document.getElementById("hero-canvas");

async function main() {
  if (!canvas || reduced || !navigator.gpu) return; // CSS fallback stays

  const COUNT = 13000;
  const BOUND_X = 22, BOUND_Y = 11, BOUND_Z = 4;

  const positions = instancedArray(COUNT, "vec3");
  const velocities = instancedArray(COUNT, "vec3");
  const dt = uniform(0);
  const incident = uniform(0); // 0 calm → 1 incident
  const good = color(new THREE.Color(getVar("--good", "#3DDC97")));
  const danger = color(new THREE.Color(getVar("--danger", "#FF5C5C")));

  const seed = (i) => hash(instanceIndex.add(i));

  const computeInit = Fn(() => {
    const p = positions.element(instanceIndex);
    p.x.assign(seed(1).sub(0.5).mul(BOUND_X * 2));
    p.y.assign(seed(2).sub(0.5).mul(BOUND_Y * 2));
    p.z.assign(seed(3).sub(0.5).mul(BOUND_Z * 2));
    velocities.element(instanceIndex).assign(vec3(0));
  })().compute(COUNT);

  const computeUpdate = Fn(() => {
    const p = positions.element(instanceIndex);
    const v = velocities.element(instanceIndex);

    // laminar downstream flow + gentle wave (calm state)
    const wave = p.x.mul(0.22).add(time.mul(0.7)).sin();
    const drift = p.y.mul(0.3).add(time.mul(0.9)).cos();
    // incident injects vertical turbulence + a per-particle jitter
    const turb = incident.mul(3.2);
    const jitter = seed(4).sub(0.5).mul(turb);

    v.x.assign(float(3.2).add(incident.mul(2.0)));          // stream speeds up under load
    v.y.assign(wave.mul(0.5).mul(turb.add(0.35)).add(jitter));
    v.z.assign(drift.mul(0.25));

    p.addAssign(v.mul(dt));

    // seamless wrap on x (stream), reflect on y/z bounds
    If(p.x.greaterThan(BOUND_X), () => { p.x.assign(float(-BOUND_X)); });
    If(p.y.abs().greaterThan(BOUND_Y), () => { p.y.assign(p.y.sign().mul(BOUND_Y)); });
    If(p.z.abs().greaterThan(BOUND_Z), () => { p.z.assign(p.z.sign().mul(BOUND_Z)); });
  })().compute(COUNT);

  // mesh
  const geo = new THREE.SphereGeometry(0.03, 6, 6);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.positionNode = positions.element(instanceIndex);
  mat.colorNode = Fn(() => {
    const v = velocities.element(instanceIndex);
    const energy = v.y.abs().mul(0.32).add(incident).clamp(0, 1);   // heat = turbulence + incident
    const base = good.mix(danger, energy);
    // fade particles near the volume edges so the field dissolves into the canvas
    const p = positions.element(instanceIndex);
    const edge = float(1.0).sub(p.x.abs().div(BOUND_X)).clamp(0, 1).mul(0.9).add(0.1);
    return base.mul(edge).mul(0.55);
  })();

  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 15);

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  await renderer.init();
  renderer.compute(computeInit);

  // gentle mouse parallax
  let mx = 0, my = 0;
  addEventListener("mousemove", (e) => { mx = (e.clientX / innerWidth - 0.5); my = (e.clientY / innerHeight - 0.5); });
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // incident smoothing + public hook
  let target = 0, cur = 0;
  window.__setIncident = (v) => { target = Math.max(0, Math.min(1, +v || 0)); };

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    dt.value = Math.min(clock.getDelta(), 0.05);
    cur += (target - cur) * 0.04; incident.value = cur;
    camera.position.x += (mx * 3 - camera.position.x) * 0.03;
    camera.position.y += (-my * 2 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
    renderer.compute(computeUpdate);
    renderer.render(scene, camera);
  });

  canvas.style.opacity = "1";
}

function getVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

main().catch((e) => { console.warn("WebGPU hero disabled:", e); /* CSS field remains */ });
