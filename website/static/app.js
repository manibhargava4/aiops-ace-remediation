/* aiops showcase — mode-aware cinematic SPA. No build step; GSAP via CDN. */
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  || new URLSearchParams(location.search).has("noanim"); // testing/screenshot escape hatch
const hasGsap = typeof gsap !== "undefined";
if (hasGsap && !reduced) document.documentElement.classList.add("gsap");
if (hasGsap && typeof ScrollTrigger !== "undefined") gsap.registerPlugin(ScrollTrigger);

/* chart state declared early — setPalette() calls drawCpu() at load, so these
   const bindings must exist before then (avoids a temporal-dead-zone crash that
   would silently kill the rest of the script). */
const cpuData = [];
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ═══════════ palette switcher ═══════════ */
const PALS = ["terminal", "aurora", "ember", "paper"];
function setPalette(p, animate = true) {
  if (!PALS.includes(p)) p = "terminal";
  document.documentElement.dataset.palette = p;
  localStorage.setItem("palette", p);
  $$(".pal").forEach((b) => b.classList.toggle("active", b.dataset.pal === p));
  if (animate && hasGsap && !reduced)
    gsap.fromTo("body", { opacity: 0.55 }, { opacity: 1, duration: 0.6, ease: "power2.out" });
  drawCpu();
}
$$(".pal").forEach((b) => (b.onclick = () => setPalette(b.dataset.pal)));
setPalette(localStorage.getItem("palette") || "terminal", false);

/* ═══════════ mode: local / cloud ═══════════ */
function applyMode(mode) {
  document.documentElement.dataset.mode = mode;
  localStorage.setItem("mode", mode);
  if (hasGsap) ScrollTrigger?.refresh?.();
  if (mode === "cloud") { loadCloudStatus(); loadRunbook(); }
}
function switchMode(mode, label) {
  const wipe = $("#wipe");
  $("#wipe-label").textContent = label || (mode === "cloud" ? "AWS CLOUD" : "LOCAL LAB");
  if (hasGsap && !reduced) {
    gsap.timeline()
      .to(wipe, { y: "0%", duration: 0.55, ease: "power3.inOut" })
      .add(() => { applyMode(mode); window.scrollTo(0, 0); })
      .to(wipe, { y: "-101%", duration: 0.6, ease: "power3.inOut", delay: 0.25 })
      .set(wipe, { y: "101%" });
  } else { applyMode(mode); window.scrollTo(0, 0); }
}
$("#modeswitch").onclick = () =>
  switchMode(document.documentElement.dataset.mode === "local" ? "cloud" : "local");

/* first-visit flow: intro → chooser → site (all skipped once a mode is stored) */
const intro = $("#intro"), chooser = $("#chooser");
if (localStorage.getItem("mode")) {
  intro.classList.add("hidden");
  chooser.classList.add("hidden");
  applyMode(localStorage.getItem("mode"));
} else {
  $("#beginbtn").onclick = () => {
    intro.classList.add("hidden");
    chooser.classList.remove("hidden");
  };
  $$(".choose").forEach((c) => (c.onclick = () => {
    chooser.classList.add("hidden");
    switchMode(c.dataset.choose);
  }));
}

/* ═══════════ custom cursor ═══════════ */
(() => {
  if (matchMedia("(pointer:coarse)").matches || reduced) return;
  const dot = $("#cursor-dot"), ring = $("#cursor-ring");
  let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, ticking = false;
  function trail() {
    // run only while the ring is catching up — a permanent rAF loop blocks
    // renderer idle detection (screenshots, battery)
    if (Math.abs(x - rx) > 0.3 || Math.abs(y - ry) > 0.3) {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      ring.style.transform = `translate(${rx - ring.offsetWidth / 2}px,${ry - ring.offsetHeight / 2}px)`;
      requestAnimationFrame(trail);
    } else { ticking = false; }
  }
  addEventListener("mousemove", (e) => {
    x = e.clientX; y = e.clientY;
    dot.style.transform = `translate(${x - 4}px,${y - 4}px)`;
    const hot = e.target.closest("a,button,[data-hover],.pal");
    document.body.classList.toggle("cursor-big", !!hot);
    if (!ticking) { ticking = true; requestAnimationFrame(trail); }
  });
})();

/* ═══════════ micro-interactions ═══════════ */
if (!reduced) {
  // magnetic buttons
  $$(".magnetic").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${dx * 0.22}px,${dy * 0.22}px)`;
    });
    el.addEventListener("mouseleave", () => (el.style.transform = ""));
  });
  // 3D tilt
  $$(".tilt").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${px * 6}deg) rotateX(${-py * 6}deg) translateY(-2px)`;
    });
    el.addEventListener("mouseleave", () => (el.style.transform = ""));
  });
}

/* ═══════════ scroll choreography ═══════════
   gsap.from with immediateRender:false — content is visible in base CSS and only
   briefly hidden right before its tween plays. If GSAP or a trigger fails, nothing
   is ever left invisible. */
if (hasGsap && !reduced && typeof ScrollTrigger !== "undefined") {
  $$(".reveal").forEach((el) => {
    gsap.from(el, {
      opacity: 0, y: 46, duration: 0.9, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });
  gsap.utils.toArray(".stage").forEach((el, i) => {
    gsap.from(el, {
      opacity: 0, y: 80, rotate: i % 2 ? 2 : -2, duration: 0.85, ease: "power3.out", immediateRender: false,
      scrollTrigger: { trigger: el, start: "top 90%", once: true },
    });
  });
  gsap.to(".b1", { yPercent: 30, scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1 } });
  gsap.to(".b2", { yPercent: -24, scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1 } });
  gsap.to(".orbits", { rotate: 20, scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 1.2 } });
  // hard failsafe: whatever happens, nothing stays hidden after 2.5s
  setTimeout(() => $$(".reveal,.stage").forEach((el) => {
    if (getComputedStyle(el).opacity < 0.99) gsap.set(el, { clearProps: "opacity,transform" });
  }), 2500);
}

/* ═══════════ code browser ═══════════ */
const langMap = { py: "python", yml: "yaml", yaml: "yaml", tf: "hcl", json: "json", md: "markdown", esql: "sql", html: "html", css: "css", js: "javascript", txt: "plaintext" };
async function loadTree() {
  const tree = await (await fetch("/api/tree")).json();
  const el = $("#filetree"); el.innerHTML = "";
  const render = (nodes, parent, depth) => {
    for (const n of nodes) {
      const d = document.createElement("div");
      d.style.paddingLeft = depth * 14 + "px";
      if (n.type === "dir") {
        d.textContent = (depth < 1 ? "▾ " : "▸ ") + n.name; d.className = "dir";
        const kids = document.createElement("div");
        kids.style.display = depth < 1 ? "block" : "none";
        d.onclick = () => {
          kids.style.display = kids.style.display === "none" ? "block" : "none";
          d.textContent = (kids.style.display === "none" ? "▸ " : "▾ ") + n.name;
        };
        parent.append(d, kids); render(n.children, kids, depth + 1);
      } else {
        d.textContent = n.name;
        d.onclick = async () => {
          $$("#filetree .sel").forEach((x) => x.classList.remove("sel")); d.classList.add("sel");
          const txt = await (await fetch("/api/file?path=" + encodeURIComponent(n.path))).text();
          $("#codehead").textContent = n.path;
          const code = $("#codepane code");
          code.textContent = txt;
          const ext = n.name.split(".").pop().toLowerCase();
          code.className = langMap[ext] ? "language-" + langMap[ext] : (/dockerfile|jenkinsfile/i.test(n.name) ? "language-dockerfile" : "");
          window.hljs && hljs.highlightElement(code);
        };
        parent.append(d);
      }
    }
  };
  render(tree, el, 0);
}
loadTree();

/* ═══════════ CPU chart (single series + 2 labeled thresholds) ═══════════ */
function drawCpu() {
  const c = $("#cpuchart"); if (!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const max = Math.max(1.05, ...cpuData), pad = 10, W = c.width - 2 * pad, H = c.height - 2 * pad;
  const yOf = (v) => pad + H - (v / max) * H;
  // recessive grid
  ctx.strokeStyle = cssVar("--line"); ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((f) => { ctx.beginPath(); ctx.moveTo(pad, pad + H * f); ctx.lineTo(pad + W, pad + H * f); ctx.stroke(); });
  // labeled status thresholds (dashed = shape encoding, not color-alone)
  const thr = (v, color, label) => {
    const y = yOf(v);
    ctx.strokeStyle = color; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + W, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cssVar("--muted"); ctx.font = "11px ui-monospace,monospace";
    ctx.fillText(label, pad + W - ctx.measureText(label).width - 4, y - 5);
  };
  thr(0.8, cssVar("--bad"), "alert 0.8");
  thr(0.3, cssVar("--good"), "gate 0.3");
  if (cpuData.length < 2) return;
  ctx.strokeStyle = cssVar("--accent"); ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.beginPath();
  cpuData.forEach((v, i) => { const x = pad + (i / (cpuData.length - 1)) * W; i ? ctx.lineTo(x, yOf(v)) : ctx.moveTo(x, yOf(v)); });
  ctx.stroke();
}
drawCpu();
// hover tooltip
(() => {
  const c = $("#cpuchart"), tip = $("#charttip"); if (!c) return;
  c.addEventListener("mousemove", (e) => {
    if (cpuData.length < 2) return;
    const r = c.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (cpuData.length - 1));
    const v = cpuData[Math.max(0, Math.min(i, cpuData.length - 1))];
    tip.style.display = "block";
    tip.style.left = e.clientX - r.left + 12 + "px";
    tip.style.top = e.clientY - r.top - 30 + "px";
    tip.textContent = v.toFixed(3) + " cores";
  });
  c.addEventListener("mouseleave", () => (tip.style.display = "none"));
})();

/* ═══════════ live demo (SSE) ═══════════ */
let es = null;
const setStep = (scope, id, status, narration) => {
  const li = $(`#${scope}-${id}`); if (!li) return;
  if (status) li.className = status;
  if (narration) li.querySelector(".narr").textContent = narration;
};
const log = (pane, t) => { const p = $(pane); if (!p) return; p.textContent += t + "\n"; p.scrollTop = p.scrollHeight; };

function connectDemo() {
  if (es) es.close();
  es = new EventSource("/api/demo/events");
  es.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === "step") { setStep("st", e.id, e.status, e.narration); if (e.title && e.status === "running") log("#logpane", "── " + e.title + " ──"); }
    else if (e.type === "log") log("#logpane", e.text);
    else if (e.type === "cpu") {
      cpuData.push(e.value); if (cpuData.length > 220) cpuData.shift(); drawCpu();
      const now = $("#cpunow"); if (now) now.textContent = e.value.toFixed(3);
    }
    else if (e.type === "rca") {
      $("#rcaempty").style.display = "none";
      const pane = $("#rcapane"); pane.style.display = "block";
      pane.innerHTML = window.marked ? marked.parse(e.markdown) : "<pre>" + e.markdown + "</pre>";
      pane.querySelectorAll("pre code").forEach((c) => window.hljs && hljs.highlightElement(c));
    }
    else if (e.type === "validation") {
      const v = $("#verdict"), r = e.result;
      v.style.display = "block"; v.className = r.hard_gate === "PASS" ? "" : "fail";
      v.innerHTML = `<b>${r.hard_gate === "PASS" ? "✅ VALIDATION PASSED" : "❌ VALIDATION FAILED"}</b><br>
        post-deploy cpu <code>${(+r.cpu).toFixed(3)}</code> / threshold ${r.threshold}<br>
        <span class="mutednote">llm (advisory): ${(r.llm_verdict || "").split("\n")[0]}</span>`;
    }
    else if (e.type === "error") { log("#logpane", "ERROR: " + e.message); $("#demostatus").textContent = "failed: " + e.message; }
    else if (e.type === "finished") { $("#startbtn").disabled = false; es.close(); es = null; }
  };
}
$("#startbtn").onclick = async () => {
  cpuData.length = 0; drawCpu();
  $("#logpane").textContent = ""; $("#rcapane").style.display = "none";
  $("#rcaempty").style.display = "block"; $("#verdict").style.display = "none";
  ["preflight", "deploy", "incident", "triage", "fix", "validate"].forEach((s) => { const li = $("#st-" + s); li.className = ""; li.querySelector(".narr").textContent = ""; });
  const r = await (await fetch("/api/demo/start", { method: "POST" })).json();
  if (r.started) { $("#startbtn").disabled = true; $("#demostatus").textContent = "running — watch the timeline and the chart."; connectDemo(); }
};
$("#stopbtn").onclick = async () => { await fetch("/api/demo/stop", { method: "POST" }); connectDemo(); };
// connect only when a run is live — a permanently-open SSE keeps the network busy for nothing
fetch("/api/demo/state").then((r) => r.json()).then((s) => { if (s.running || s.events.length) connectDemo(); }).catch(() => {});

/* ═══════════ ci/cd pipeline runner ═══════════ */
let runner = null, pes = null;
$$(".runner").forEach((card) => (card.onclick = () => {
  $$(".runner").forEach((c) => c.classList.remove("selected"));
  card.classList.add("selected");
  runner = card.dataset.runner;
  const btn = $("#runpipeline");
  btn.disabled = false;
  btn.textContent = runner === "jenkins" ? "▶ run jenkins pipeline (push)" : "▶ run gitops pipeline (pull)";
}));
function connectPipeline() {
  if (pes) pes.close();
  pes = new EventSource("/api/pipeline/events");
  pes.onmessage = (m) => {
    const e = JSON.parse(m.data);
    if (e.type === "step") {
      let li = $("#pl-" + e.id);
      if (!li) {
        $("#pipesteps .placeholder")?.remove();
        li = document.createElement("li"); li.id = "pl-" + e.id;
        li.innerHTML = `<i class="dot"></i>${e.title || e.id}<div class="narr"></div>`;
        $("#pipesteps").appendChild(li);
      }
      setStep("pl", e.id, e.status, e.narration);
    }
    else if (e.type === "log") log("#pipelog", e.text);
    else if (e.type === "result") log("#pipelog", `\n★ ${e.result} — ${e.detail}\n`);
    else if (e.type === "error") { log("#pipelog", "ERROR: " + e.message); $("#pipelinestatus").textContent = "failed: " + e.message; }
    else if (e.type === "finished") { $("#runpipeline").disabled = !runner; pes.close(); pes = null; }
  };
}
$("#runpipeline").onclick = async () => {
  if (!runner) return;
  $("#pipesteps").innerHTML = ""; $("#pipelog").textContent = "";
  const r = await (await fetch("/api/pipeline/start?runner=" + runner, { method: "POST" })).json();
  if (r.started) { $("#runpipeline").disabled = true; $("#pipelinestatus").textContent = "running " + runner + "…"; connectPipeline(); }
};
fetch("/api/pipeline/state").then((r) => r.json()).then((s) => { if (s.running || s.events.length) connectPipeline(); }).catch(() => {});

/* ═══════════ cloud mode data ═══════════ */
async function loadCloudStatus() {
  const ul = $("#cloudchecks"); if (!ul) return;
  try {
    const s = await (await fetch("/api/cloud/status")).json();
    ul.innerHTML = s.checks.map((c) =>
      `<li class="${c.ok ? "ok" : "no"}"><b>${c.ok ? "●" : "○"}</b> ${c.check}<span class="detail">${c.detail}</span></li>`).join("");
    const btn = $("#clouddemo");
    btn.disabled = !s.ready;
    btn.textContent = s.ready ? "▶ run cloud incident demo" : "cloud demo — infra not detected";
  } catch { ul.innerHTML = "<li class='no'><b>○</b> probe failed</li>"; }
}
let runbookLoaded = false;
async function loadRunbook() {
  if (runbookLoaded) return; runbookLoaded = true;
  const pane = $("#runbookpane"); if (!pane) return;
  const md = await (await fetch("/api/file?path=" + encodeURIComponent("docs/aws-deployment.md"))).text();
  pane.innerHTML = window.marked ? marked.parse(md) : "<pre>" + md + "</pre>";
  pane.querySelectorAll("pre code").forEach((c) => window.hljs && hljs.highlightElement(c));
}
