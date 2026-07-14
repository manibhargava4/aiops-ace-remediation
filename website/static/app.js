/* aiops showcase — immersive dual-world orchestration (ES module).
   loader → game-select → Local (light) | AWS Cloud (dark) worlds.
   Three.js backdrop lazy-loaded via scene.js only when motion is on. */

// scene stubs — replaced by the real module when motion is enabled
let initScene = () => false, sceneSetTheme = () => {}, sceneLean = () => {}, sceneEnter = (cb) => cb && cb(), sceneScroll = () => {};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const _p = new URLSearchParams(location.search);
const reduced = _p.has("noanim") || (matchMedia("(prefers-reduced-motion: reduce)").matches && !_p.has("motion"));
const hasGsap = typeof gsap !== "undefined";
if (hasGsap && typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);
const root = document.documentElement;
root.classList.toggle("motion", !reduced);   // CSS keys motion styles off this, so ?motion works

/* chart state early (drawCpu references these before its section) */
const cpuData = [];
const cssVar = (n) => getComputedStyle(root).getPropertyValue(n).trim();

/* ═══════════ custom cursor ═══════════ */
(() => {
  if (matchMedia("(pointer:coarse)").matches || reduced) return;
  const dot = $("#cursor-dot"), ring = $("#cursor-ring");
  let x = innerWidth/2, y = innerHeight/2, rx = x, ry = y, ticking = false;
  function trail() {
    if (Math.abs(x-rx) > 0.3 || Math.abs(y-ry) > 0.3) {
      rx += (x-rx)*0.18; ry += (y-ry)*0.18;
      ring.style.transform = `translate(${rx-ring.offsetWidth/2}px,${ry-ring.offsetHeight/2}px)`;
      requestAnimationFrame(trail);
    } else ticking = false;
  }
  addEventListener("mousemove", (e) => {
    x = e.clientX; y = e.clientY;
    dot.style.transform = `translate(${x-3}px,${y-3}px)`;
    const view = e.target.closest("[data-view]");
    const hot = e.target.closest("a,button,[data-hover],[data-view]");
    document.body.classList.toggle("cursor-view", !!view);
    document.body.classList.toggle("cursor-big", !!hot && !view);
    if (!ticking) { ticking = true; requestAnimationFrame(trail); }
  });
})();

/* ═══════════ micro-interactions ═══════════ */
if (!reduced) {
  $$(".magnetic").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX-r.left-r.width/2)*0.25}px,${(e.clientY-r.top-r.height/2)*0.25}px)`;
    });
    el.addEventListener("mouseleave", () => (el.style.transform = ""));
  });
}

/* ═══════════ Lenis smooth scroll ═══════════ */
let lenis = null;
if (!reduced && typeof Lenis !== "undefined") {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
  if (hasGsap && typeof ScrollTrigger !== "undefined") {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t*1000)); gsap.ticker.lagSmoothing(0);
  } else { const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const t = document.querySelector(a.getAttribute("href")); if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: -10 }); }
  }));
}

/* ═══════════ 3D backdrop — lazy-loaded only when motion is on ═══════════ */
let has3D = false;
if (!reduced && navigator.gpu !== null) {
  import("./scene.js").then((m) => {
    ({ initScene, sceneSetTheme, sceneLean, sceneEnter, sceneScroll } = m);
    has3D = initScene($("#bg-canvas"));
    sceneSetTheme(root.dataset.mode || "local");
  }).catch(() => {});
}

/* ═══════════ LOADER → SELECT ═══════════
   Timer-driven (not rAF) so it always completes even where rAF is throttled. */
(function loader() {
  const fill = $("#loader-fill"), pct = $("#loader-pct"), el = $("#loader");
  const dur = reduced ? 400 : 1600, step = 40; let t = 0;
  const iv = setInterval(() => {
    t += step; const p = Math.min(1, t / dur);
    if (fill) fill.style.width = (p*100) + "%";
    if (pct) pct.textContent = `initializing · ${Math.round(p*100)}%`;
    if (p >= 1) { clearInterval(iv); setTimeout(showGateway, 220); }
  }, step);
  function showGateway() {
    el.classList.add("gone");
    root.dataset.stage = "intro";
    $("#gateway").classList.remove("hidden");
    initGatewayScroll();
    if (hasGsap && !reduced) gsap.from(".intro-inner > *", { y: 34, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.09, delay: 0.12 });
  }
})();

/* ═══════════ WORLD ENTER / BACK ═══════════ */
function flash() {
  const f = document.createElement("div");
  f.style.cssText = `position:fixed;inset:0;z-index:9600;background:var(--brand);pointer-events:none;opacity:0`;
  document.body.appendChild(f);
  if (hasGsap && !reduced) gsap.timeline({ onComplete: () => f.remove() })
    .to(f, { opacity: 0.9, duration: 0.28, ease: "power2.in" }).to(f, { opacity: 0, duration: 0.5, ease: "power2.out" });
  else setTimeout(() => f.remove(), 50);
}
function enterWorld(mode) {
  const go = () => {
    setMode(mode);
    $("#gateway").classList.add("hidden");
    $("#topnav").classList.remove("hidden");
    $("main").classList.remove("hidden");
    root.dataset.stage = "world";
    killGatewayScroll(); sceneLean(null);
    if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
    initWorldScroll();
    _heroRevealed = ""; heroReveal();
    if (hasGsap && !reduced) gsap.from("#hero .wrap", { opacity: 0, y: 30, duration: 0.9, ease: "power3.out", delay: 0.1 });
  };
  flash();
  if (has3D && !reduced) sceneEnter(go); else go();
}
$$(".world").forEach((w) => {
  w.addEventListener("mouseenter", () => sceneLean(w.dataset.choose));
  w.addEventListener("mouseleave", () => sceneLean(null));
  w.addEventListener("click", () => enterWorld(w.dataset.choose));
});
$("#homebtn").onclick = () => {
  root.dataset.stage = "intro";
  $("main").classList.add("hidden"); $("#topnav").classList.add("hidden");
  $("#gateway").classList.remove("hidden");
  initGatewayScroll();
  const sel = $("#select");
  if (lenis) lenis.scrollTo(sel, { immediate: true }); else sel.scrollIntoView();
};

/* ═══════════ MODE (theme) ═══════════ */
function setMode(mode) {
  root.dataset.mode = mode;
  sceneSetTheme(mode);
  if (hasGsap) ScrollTrigger?.refresh?.();
  if (mode === "cloud") { loadCloudStatus(); loadRunbook(); }
}
$("#modeswitch").onclick = () => {
  const next = root.dataset.mode === "local" ? "cloud" : "local";
  flash(); setTimeout(() => { setMode(next); _heroRevealed = ""; heroReveal(); if (lenis) lenis.scrollTo(0,{immediate:true}); else window.scrollTo(0,0); if (hasGsap) ScrollTrigger?.refresh?.(); }, 200);
};

/* ═══════════ hero mask reveal ═══════════ */
let _heroRevealed = "";
function heroReveal() {
  if (!hasGsap || reduced) return;
  const m = root.dataset.mode === "cloud" ? "only-cloud" : "only-local";
  if (_heroRevealed === m) return; _heroRevealed = m;
  const lines = $$(`.hero-type .${m} .line > span`);
  if (lines.length) gsap.from(lines, { yPercent: 118, duration: 1.05, ease: "expo.out", stagger: 0.1, delay: 0.12 });
}

/* ═══════════ scroll effects (gateway + world) ═══════════ */
let gwTriggers = [], worldInit = false, sceneBound = false;
function bindSceneScroll() {
  if (sceneBound) return; sceneBound = true;
  if (lenis) lenis.on("scroll", ({ scroll, limit }) => sceneScroll(limit > 0 ? scroll/limit : 0));
  else addEventListener("scroll", () => { const h = document.documentElement.scrollHeight - innerHeight; sceneScroll(h > 0 ? scrollY/h : 0); }, { passive: true });
}
function initGatewayScroll() {
  bindSceneScroll();
  if (!hasGsap || reduced || typeof ScrollTrigger === "undefined") return;
  const local = $("#select .world.local"), cloud = $("#select .world.cloud");
  const st = (v, x) => gsap.fromTo(v, { xPercent: x, opacity: 0 }, { xPercent: 0, opacity: 1, ease: "none",
    scrollTrigger: { trigger: "#select", start: "top bottom", end: "top top", scrub: 0.6 } }).scrollTrigger;
  gwTriggers.push(st(local, -55), st(cloud, 55));
  gwTriggers.push(gsap.to(".scroll-badge svg", { rotation: 200, ease: "none",
    scrollTrigger: { trigger: "#intro", start: "top top", end: "bottom top", scrub: 1 } }).scrollTrigger);
  ScrollTrigger.refresh();
}
function killGatewayScroll() { gwTriggers.forEach((t) => t && t.kill()); gwTriggers = []; }

/* horizontal pipeline: native sticky + scroll-driven translate. Section is made
   tall enough that scrolling through it moves the track sideways; it always
   releases (never traps), and degrades to native overflow-x under reduced motion. */
let hpipeBound = false;
function setupHPipe() {
  const sec = $("#pipeline"), track = $(".hscroll-track");
  if (!sec || !track || reduced) return;
  const extra = () => Math.max(0, track.scrollWidth - innerWidth + 40);
  const sizeSection = () => { sec.style.height = (innerHeight + extra()) + "px"; };
  const onScroll = () => {
    const total = sec.offsetHeight - innerHeight;
    const prog = total > 0 ? Math.min(1, Math.max(0, -sec.getBoundingClientRect().top / total)) : 0;
    track.style.transform = `translate3d(${-prog * extra()}px,0,0)`;
  };
  sizeSection();
  if (!hpipeBound) {
    hpipeBound = true;
    addEventListener("scroll", onScroll, { passive: true }); // Lenis scrolls the real window, so this catches both
    if (lenis) lenis.on("scroll", onScroll);
    addEventListener("resize", () => { sizeSection(); onScroll(); if (hasGsap) ScrollTrigger?.refresh?.(); });
  }
  onScroll();
}

function initWorldScroll() {
  if (!hasGsap || reduced || typeof ScrollTrigger === "undefined") return;
  if (worldInit) { ScrollTrigger.refresh(); return; }
  worldInit = true;
  // text-reveal headings (clip wipe)
  $$("main [data-reveal]").forEach((el) => gsap.from(el, { clipPath: "inset(0 0 100% 0)", yPercent: 6, duration: 1, ease: "expo.out",
    immediateRender: false, scrollTrigger: { trigger: el, start: "top 86%", once: true } }));
  // surface reveals
  $$("main .reveal").forEach((el) => gsap.from(el, { opacity: 0, y: 40, duration: 0.9, ease: "power3.out",
    immediateRender: false, scrollTrigger: { trigger: el, start: "top 88%", once: true } }));
  // horizontal-scroll pipeline (native sticky — robust, never traps scroll)
  setTimeout(setupHPipe, 60); // setTimeout (not rAF) so it fires even in a backgrounded tab
  gsap.from(".stage", { opacity: 0, y: 44, stagger: 0.07, duration: 0.6, ease: "power2.out",
    scrollTrigger: { trigger: "#pipeline", start: "top 70%", once: true } });
  // parallax + zoom
  gsap.to(".hero-side", { yPercent: -40, ease: "none", scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1 } });
  $$("[data-zoom]").forEach((el) => gsap.from(el, { scale: 0.82, ease: "none", transformOrigin: "center",
    scrollTrigger: { trigger: el, start: "top bottom", end: "top center", scrub: 1 } }));
  setTimeout(() => $$("main [data-reveal], main .reveal").forEach((el) => { if (getComputedStyle(el).opacity < 0.99) gsap.set(el, { clearProps: "all" }); }), 2800);
  ScrollTrigger.refresh();
}

/* ═══════════ code browser ═══════════ */
/* ═══════════ architecture flow — cursor parallax (3D tilt) ═══════════ */
(function initArch() {
  const stage = $("#arch-stage"); if (!stage || reduced) return;
  stage.addEventListener("mousemove", (e) => {
    const r = stage.getBoundingClientRect();
    const px = (e.clientX - r.left)/r.width - 0.5, py = (e.clientY - r.top)/r.height - 0.5;
    $$("#arch-stage .arch").forEach((s) => { s.style.transform = `rotateX(${7 - py*9}deg) rotateY(${px*11}deg)`; });
  });
  stage.addEventListener("mouseleave", () => $$("#arch-stage .arch").forEach((s) => (s.style.transform = "rotateX(7deg)")));
})();

/* ═══════════ CPU chart ═══════════ */
function drawCpu() {
  const c = $("#cpuchart"); if (!c) return; const ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
  const max = Math.max(1.05, ...cpuData), pad = 10, W = c.width-2*pad, H = c.height-2*pad;
  const yOf = (v) => pad + H - (v/max)*H;
  ctx.strokeStyle = cssVar("--line"); ctx.lineWidth = 1;
  [0.25,0.5,0.75].forEach((f) => { ctx.beginPath(); ctx.moveTo(pad, pad+H*f); ctx.lineTo(pad+W, pad+H*f); ctx.stroke(); });
  const thr = (v,color,label) => { const y = yOf(v); ctx.strokeStyle = color; ctx.setLineDash([5,5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(pad+W,y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar("--ink-dim"); ctx.font = "11px 'IBM Plex Mono',monospace"; ctx.fillText(label, pad+W-ctx.measureText(label).width-4, y-5); };
  thr(0.8, cssVar("--danger"), "alert 0.8"); thr(0.3, cssVar("--good"), "gate 0.3");
  if (cpuData.length < 2) return;
  ctx.strokeStyle = cssVar("--brand"); ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.beginPath();
  cpuData.forEach((v,i) => { const x = pad + (i/(cpuData.length-1))*W; i?ctx.lineTo(x,yOf(v)):ctx.moveTo(x,yOf(v)); });
  ctx.stroke();
}
drawCpu();
(() => { const c = $("#cpuchart"), tip = $("#charttip"); if (!c) return;
  c.addEventListener("mousemove", (e) => { if (cpuData.length < 2) return; const r = c.getBoundingClientRect();
    const i = Math.round(((e.clientX-r.left)/r.width)*(cpuData.length-1)); const v = cpuData[Math.max(0,Math.min(i,cpuData.length-1))];
    tip.style.display = "block"; tip.style.left = e.clientX-r.left+12+"px"; tip.style.top = e.clientY-r.top-30+"px"; tip.textContent = v.toFixed(3)+" cores"; });
  c.addEventListener("mouseleave", () => (tip.style.display = "none"));
})();

/* ═══════════ live demo (SSE) ═══════════ */
let es = null;
const setStep = (scope,id,status,narration) => { const li = $(`#${scope}-${id}`); if (!li) return; if (status) li.className = status; if (narration) li.querySelector(".narr").textContent = narration; };
const log = (pane,t) => { const p = $(pane); if (!p) return; p.textContent += t+"\n"; p.scrollTop = p.scrollHeight; };
function connectDemo() {
  if (es) es.close();
  es = new EventSource("/api/demo/events");
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === "step") { setStep("st", e.id, e.status, e.narration); if (e.title && e.status==="running") log("#logpane","── "+e.title+" ──"); }
    else if (e.type === "log") log("#logpane", e.text);
    else if (e.type === "cpu") { cpuData.push(e.value); if (cpuData.length>220) cpuData.shift(); drawCpu(); const now = $("#cpunow"); if (now) now.textContent = e.value.toFixed(3); }
    else if (e.type === "rca") { $("#rcaempty").style.display = "none"; const pane = $("#rcapane"); pane.style.display = "block";
      pane.innerHTML = window.marked ? marked.parse(e.markdown) : "<pre>"+e.markdown+"</pre>"; pane.querySelectorAll("pre code").forEach((c) => window.hljs && hljs.highlightElement(c)); }
    else if (e.type === "validation") { const v = $("#verdict"), r = e.result; v.style.display = "block"; v.className = r.hard_gate==="PASS"?"":"fail";
      v.innerHTML = `<b>${r.hard_gate==="PASS"?"✅ VALIDATION PASSED":"❌ VALIDATION FAILED"}</b><br>post-deploy cpu <code>${(+r.cpu).toFixed(3)}</code> / threshold ${r.threshold}<br><span style="color:var(--ink-dim)">llm (advisory): ${(r.llm_verdict||"").split("\n")[0]}</span>`; }
    else if (e.type === "error") { log("#logpane","ERROR: "+e.message); $("#demostatus").textContent = "failed: "+e.message; }
    else if (e.type === "finished") { $("#startbtn").disabled = false; es.close(); es = null; }
  };
}
const sb = $("#startbtn"); if (sb) sb.onclick = async () => {
  cpuData.length = 0; drawCpu(); $("#logpane").textContent = ""; $("#rcapane").style.display = "none";
  $("#rcaempty").style.display = "block"; $("#verdict").style.display = "none";
  ["preflight","deploy","incident","triage","fix","validate"].forEach((s) => { const li = $("#st-"+s); li.className = ""; li.querySelector(".narr").textContent = ""; });
  const r = await (await fetch("/api/demo/start", { method: "POST" })).json();
  if (r.started) { $("#startbtn").disabled = true; $("#demostatus").textContent = "running — watch the timeline and chart."; connectDemo(); }
};
const stopb = $("#stopbtn"); if (stopb) stopb.onclick = async () => { await fetch("/api/demo/stop", { method: "POST" }); connectDemo(); };
fetch("/api/demo/state").then((r) => r.json()).then((s) => { if (s.running || s.events.length) connectDemo(); }).catch(() => {});

/* ═══════════ pipeline runner ═══════════ */
let runner = null, pes = null;
$$(".runner").forEach((card) => (card.onclick = () => {
  $$(".runner").forEach((c) => c.classList.remove("selected")); card.classList.add("selected"); runner = card.dataset.runner;
  const btn = $("#runpipeline"); btn.disabled = false; btn.textContent = runner==="jenkins"?"▶ run jenkins pipeline (push)":"▶ run gitops pipeline (pull)";
}));
function connectPipeline() {
  if (pes) pes.close(); pes = new EventSource("/api/pipeline/events");
  pes.onmessage = (m) => { const e = JSON.parse(m.data);
    if (e.type === "step") { let li = $("#pl-"+e.id); if (!li) { $("#pipesteps .placeholder")?.remove(); li = document.createElement("li"); li.id = "pl-"+e.id; li.innerHTML = `<i class="dot"></i>${e.title||e.id}<div class="narr"></div>`; $("#pipesteps").appendChild(li); } setStep("pl", e.id, e.status, e.narration); }
    else if (e.type === "log") log("#pipelog", e.text);
    else if (e.type === "result") log("#pipelog", `\n★ ${e.result} — ${e.detail}\n`);
    else if (e.type === "error") { log("#pipelog","ERROR: "+e.message); $("#pipelinestatus").textContent = "failed: "+e.message; }
    else if (e.type === "finished") { $("#runpipeline").disabled = !runner; pes.close(); pes = null; }
  };
}
const rp = $("#runpipeline"); if (rp) rp.onclick = async () => {
  if (!runner) return; $("#pipesteps").innerHTML = ""; $("#pipelog").textContent = "";
  const r = await (await fetch("/api/pipeline/start?runner="+runner, { method: "POST" })).json();
  if (r.started) { $("#runpipeline").disabled = true; $("#pipelinestatus").textContent = "running "+runner+"…"; connectPipeline(); }
};
fetch("/api/pipeline/state").then((r) => r.json()).then((s) => { if (s.running || s.events.length) connectPipeline(); }).catch(() => {});

/* ═══════════ cloud mode data ═══════════ */
async function loadCloudStatus() {
  const ul = $("#cloudchecks"); if (!ul) return;
  try { const s = await (await fetch("/api/cloud/status")).json();
    ul.innerHTML = s.checks.map((c) => `<li class="${c.ok?"ok":"no"}"><b>${c.ok?"●":"○"}</b> ${c.check}<span class="detail">${c.detail}</span></li>`).join("");
    const btn = $("#clouddemo"); btn.disabled = !s.ready; btn.textContent = s.ready ? "▶ run cloud incident demo" : "cloud demo — infra not detected";
  } catch { ul.innerHTML = "<li class='no'><b>○</b> probe failed</li>"; }
}
let runbookLoaded = false;
async function loadRunbook() {
  if (runbookLoaded) return; runbookLoaded = true; const pane = $("#runbookpane"); if (!pane) return;
  const md = await (await fetch("/api/file?path=" + encodeURIComponent("docs/aws-deployment.md"))).text();
  pane.innerHTML = window.marked ? marked.parse(md) : "<pre>"+md+"</pre>";
  pane.querySelectorAll("pre code").forEach((c) => window.hljs && hljs.highlightElement(c));
}
