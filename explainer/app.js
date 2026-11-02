(function () {
  "use strict";
  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  };
  const urlLang = new URLSearchParams(location.search).get("lang");
  const LANG = ["ru", "en"].includes(urlLang) ? urlLang
    : storage.get("lang") || ((navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en");
  const T = window.I18N[LANG];
  const C = window.CONTENTS[LANG];
  const D = window.REPORT_DATA || null;
  const TRANSLIT = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
  const dn = (name) => {
    if (LANG === "ru" || name == null) return name;
    if (T.dataNames[name]) return T.dataNames[name];
    return String(name).replace(/[а-яё]/gi, (ch) => {
      const lat = TRANSLIT[ch.toLowerCase()];
      return ch === ch.toLowerCase() ? lat : lat.charAt(0).toUpperCase() + lat.slice(1);
    });
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- utils ----------
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function el(tag, attrs = {}, html) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    if (html !== undefined) node.innerHTML = html;
    return node;
  }
  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString(T.locale));
  const tip = $("#tooltip");
  function showTip(html, evt) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  function dataTable({ caption, cols, rows, cls = [], cells = [] }) {
    const hlCells = new Set(cells.map(([r, c]) => r + ":" + c));
    let html = `<table class="data">${caption ? `<caption>${esc(caption)}</caption>` : ""}<tr>`;
    html += cols.map((c) => `<th>${esc(c)}</th>`).join("") + "</tr>";
    rows.forEach((row, r) => {
      html += `<tr class="${cls[r] || ""}">`;
      row.forEach((v, c) => {
        const isNull = v === null || v === undefined;
        const klass = [isNull ? "null" : typeof v === "number" ? "num" : "", hlCells.has(r + ":" + c) ? "cell-hl" : ""].join(" ").trim();
        html += `<td class="${klass}">${isNull ? "NULL" : esc(typeof v === "number" ? fmt(v) : v)}</td>`;
      });
      html += "</tr>";
    });
    return `<div class="tbl-wrap">${html}</table></div>`;
  }

  // ---------- language, navigation, theme ----------
  function initLang() {
    document.documentElement.lang = LANG;
    document.title = T.html.title;
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.innerHTML = T.html[node.dataset.i18n]; });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = T.html[node.dataset.i18nPlaceholder]; });
    const btn = $("#langToggle");
    btn.textContent = T.langBtn;
    btn.title = T.langTitle;
    btn.addEventListener("click", () => {
      const next = LANG === "ru" ? "en" : "ru";
      storage.set("lang", next);
      const url = new URL(location.href);
      url.searchParams.set("lang", next);
      location.href = url.toString();
    });
  }
  function initNav() {
    const list = $("#navList");
    const sections = [...document.querySelectorAll("main .section")];
    sections.forEach((s) => {
      const a = el("a", { href: "#" + s.id }, esc($("h1", s).textContent));
      a.addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#navToggle").setAttribute("aria-expanded", "false"); });
      list.appendChild(el("li")).appendChild(a);
    });
    const links = [...list.querySelectorAll("a")];
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    sections.forEach((s) => obs.observe(s));
    $("#navToggle").addEventListener("click", () => {
      const open = $("#sidebar").classList.toggle("open");
      $("#navToggle").setAttribute("aria-expanded", String(open));
    });
  }
  function initTheme() {
    const saved = storage.get("theme");
    if (saved) document.documentElement.dataset.theme = saved;
    $("#themeToggle").addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme
        || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      storage.set("theme", next);
      renderCharts();
    });
  }

  // ---------- 1. Map ----------
  const NODE_W = 210, NODE_H = 80;
  function nodeCenter(n) { return { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 }; }
  function initMap() {
    if (D) {
      const m = D.meta;
      const items = [m.vacancies, m.snapshots, m.employers, m.skills, m.load_runs].map((v, i) => [v, T.stats[i]]);
      $("#stats").innerHTML = items.map(([v, l]) => `<div class="stat"><b>${fmt(v)}</b><span>${l}</span></div>`).join("");
      $("#asOf").textContent = LANG === "ru" ? m.as_of : m.as_of.replace("МСК", "MSK");
    }
    const s = $("#mapSvg");
    const defs = svg("defs");
    const marker = svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
    marker.appendChild(svg("path", { d: "M0,0 L10,5 L0,10 z", class: "edge-arrow" }));
    defs.appendChild(marker);
    s.appendChild(defs);
    const nodes = C.mapNodes;
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      let x1, y1, x2, y2;
      if (a.y === b.y && b.x > a.x) { x1 = a.x + NODE_W; y1 = a.y + NODE_H / 2; x2 = b.x - 4; y2 = y1; }
      else if (a.y === b.y) { x1 = a.x; y1 = a.y + NODE_H / 2; x2 = b.x + NODE_W + 4; y2 = y1; }
      else { x1 = a.x + NODE_W / 2; y1 = a.y + NODE_H; x2 = x1; y2 = b.y - 4; }
      s.appendChild(svg("line", { x1, y1, x2, y2, class: "edge", "marker-end": "url(#arrow)" }));
    }
    nodes.forEach((n) => {
      const g = svg("g", { class: "node", tabindex: "0", role: "button", "aria-label": n.title, "data-id": n.id });
      g.appendChild(svg("rect", { x: n.x, y: n.y, width: NODE_W, height: NODE_H, rx: 12 }));
      g.appendChild(svg("text", { x: n.x + NODE_W / 2, y: n.y + 35, "text-anchor": "middle" }, n.title));
      g.appendChild(svg("text", { x: n.x + NODE_W / 2, y: n.y + 56, "text-anchor": "middle", class: "sub" }, n.sub));
      const pick = () => selectNode(n.id);
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      s.appendChild(g);
    });
    function selectNode(id) {
      const n = byId[id];
      s.querySelectorAll(".node").forEach((g) => g.classList.toggle("active", g.dataset.id === id));
      $("#mapDetails").innerHTML = `<h3>${esc(n.title)}</h3>
        <dl class="qvcw"><dt>${T.does}</dt><dd>${esc(n.does)}</dd>
        <dt>${T.files}</dt><dd><code>${esc(n.file)}</code></dd>
        <dt>${T.solves}</dt><dd>${esc(n.question)}</dd></dl>`;
    }
    const packet = svg("circle", { r: 9, class: "packet", cx: nodeCenter(nodes[0]).x, cy: nodeCenter(nodes[0]).y, opacity: 0 });
    s.appendChild(packet);
    let running = false;
    $("#animBtn").addEventListener("click", async () => {
      if (running) return;
      running = true;
      $("#animBtn").disabled = true;
      packet.setAttribute("opacity", 1);
      const steps = C.mapAnimation;
      for (let i = 0; i < steps.length; i++) {
        const node = byId[steps[i].node];
        if (i > 0) await movePacket(packet, nodeCenter(byId[steps[i - 1].node]), nodeCenter(node));
        s.querySelectorAll(".node").forEach((g) => g.classList.toggle("pulse", g.dataset.id === node.id));
        $("#animCaption").innerHTML = `<b>${T.step(i + 1, steps.length)}</b> ${esc(steps[i].text)}`;
        await wait(reduceMotion ? 2200 : 2600);
      }
      s.querySelectorAll(".node").forEach((g) => g.classList.remove("pulse"));
      packet.setAttribute("opacity", 0);
      $("#animBtn").disabled = false;
      $("#animBtn").textContent = T.replay;
      running = false;
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function movePacket(p, from, to) {
    if (reduceMotion) { p.setAttribute("cx", to.x); p.setAttribute("cy", to.y); return Promise.resolve(); }
    const dur = 700;
    return new Promise((resolve) => {
      const t0 = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        p.setAttribute("cx", from.x + (to.x - from.x) * e);
        p.setAttribute("cy", from.y + (to.y - from.y) * e);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- 2–3. Thinking and requirements ----------
  function initThinking() {
    $("#thinkingSteps").innerHTML = C.thinking.map((s, i) => `
      <details class="acc" ${i === 0 ? "open" : ""}><summary>${T.stepN(i + 1)} ${esc(s.q)}</summary>
      <div class="acc-body"><dl class="qvcw">
        <dt>${T.q}</dt><dd>${esc(s.q)}</dd>
        <dt>${T.reasoning}</dt><dd>${esc(s.reason)}</dd>
        <dt>${T.decision}</dt><dd>${esc(s.decision)}</dd>
        <dt>${T.check}</dt><dd>${esc(s.check)}</dd></dl></div></details>`).join("");
    $("#mistakes").innerHTML = C.mistakes.map((m) => `<div class="card"><h3>${esc(m.title)}</h3><p>${esc(m.text)}</p></div>`).join("");
  }
  function initRequirements() {
    if ($("#stories")) $("#stories").innerHTML = C.stories.map((s) => `<div class="card"><span class="tag">${s.id}</span>
      <p><b>${T.as}</b> ${esc(s.role)}, <b>${T.iwant}</b> ${esc(s.want)}, <b>${T.sothat}</b> ${esc(s.why)}.</p>
      <p class="muted">${T.acceptance}</p><ul>${s.ac.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`).join("");
    if ($("#usecases")) $("#usecases").innerHTML = C.usecases.map((u) => `<details class="acc"><summary>${u.id}. ${esc(u.title)} <span class="muted">· ${T.actor}: ${esc(u.actor)}</span></summary>
      <div class="acc-body"><p><b>${T.mainFlow}</b></p><ol>${u.main.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <p><b>${T.altFlows}</b></p><ul>${u.alt.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></details>`).join("");
    const box = $("#reqQuiz");
    if (!box) return;
    C.reqQuiz.forEach((q, qi) => {
      const card = el("div", { class: "panel quiz" }, `<p><b>${T.situation(qi + 1)}</b> ${esc(q.situation)}</p>`);
      const opts = el("div", { class: "opts" });
      const out = el("div");
      q.options.forEach((o) => {
        const b = el("button", { class: "opt" }, esc(o.t));
        b.addEventListener("click", () => {
          opts.querySelectorAll("button").forEach((x, i) => { x.disabled = true; x.classList.add(q.options[i].ok ? "right" : "wrong"); });
          out.innerHTML = q.options.map((x) => `<p class="explain ${x.ok ? "ok" : "no"}"><b>${x.ok ? T.best : T.worse}:</b> ${esc(x.why)}</p>`).join("");
        });
        opts.appendChild(b);
      });
      card.append(opts, out);
      box.appendChild(card);
    });
  }

  // ---------- 4. ER diagram ----------
  const ER_W = 280, ER_HEAD = 26, ER_ROW = 18;
  function initER() {
    const s = $("#erSvg");
    const box = {};
    C.erTables.forEach((t) => { box[t.id] = { x: t.x, y: t.y, w: ER_W, h: ER_HEAD + t.cols.length * ER_ROW + 6 }; });
    const linkEls = [];
    const rowY = (tableId, colName) => {
      const t = C.erTables.find((x) => x.id === tableId);
      const i = t.cols.findIndex((c) => c[0] === colName);
      return box[tableId].y + (i < 0 ? ER_HEAD / 2 : ER_HEAD + 10 + i * ER_ROW);
    };
    C.erLinks.forEach(([parent, child, label]) => {
      const a = box[parent], b = box[child];
      const pkCol = C.erTables.find((x) => x.id === parent).cols[0][0];
      let p1, p2, horizontal = true;
      if (a.x + a.w < b.x) { p1 = { x: a.x + a.w, y: rowY(parent, pkCol) }; p2 = { x: b.x, y: rowY(child, label) }; }
      else if (b.x + b.w < a.x) { p1 = { x: a.x, y: rowY(parent, pkCol) }; p2 = { x: b.x + b.w, y: rowY(child, label) }; }
      else if (a.y < b.y) { horizontal = false; p1 = { x: a.x + a.w / 2, y: a.y + a.h }; p2 = { x: b.x + b.w / 2, y: b.y }; }
      else { horizontal = false; p1 = { x: a.x + a.w / 2, y: a.y }; p2 = { x: b.x + b.w / 2, y: b.y + b.h }; }
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const d = horizontal ? `M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}` : `M${p1.x},${p1.y} C${p1.x},${my} ${p2.x},${my} ${p2.x},${p2.y}`;
      const path = svg("path", { d, class: "er-link", "data-a": parent, "data-b": child });
      path.appendChild(svg("title", {}, `${parent} 1 — N ${child} (${label})`));
      s.appendChild(path);
      const lab = (p, q) => horizontal
        ? { x: p.x + (q.x > p.x ? 9 : -9), y: p.y - 4 }
        : { x: p.x + 9, y: p.y + (q.y > p.y ? 14 : -6) };
      const l1 = lab(p1, p2), l2 = lab(p2, p1);
      s.appendChild(svg("text", { x: l1.x, y: l1.y, class: "er-card", "text-anchor": "middle" }, "1"));
      s.appendChild(svg("text", { x: l2.x, y: l2.y, class: "er-card", "text-anchor": "middle" }, "N"));
      linkEls.push(path);
    });
    C.erTables.forEach((t) => {
      const b = box[t.id];
      const g = svg("g", { class: "er-table", tabindex: "0", role: "button", "aria-label": T.table + " " + t.id, "data-id": t.id });
      g.appendChild(svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 8, class: "body" }));
      g.appendChild(svg("rect", { x: b.x, y: b.y, width: b.w, height: ER_HEAD, rx: 8, class: "head" }));
      g.appendChild(svg("text", { x: b.x + 10, y: b.y + 17, class: "title" }, t.id));
      t.cols.forEach(([name, type, key], i) => {
        const y = b.y + ER_HEAD + 14 + i * ER_ROW;
        g.appendChild(svg("text", { x: b.x + 10, y, class: key ? "key" : "" }, (key ? key + " " : "") + name));
        g.appendChild(svg("text", { x: b.x + b.w - 10, y, class: "type", "text-anchor": "end" }, type));
      });
      const pick = () => selectTable(t.id);
      g.addEventListener("click", pick);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      s.appendChild(g);
    });
    function selectTable(id) {
      const t = C.erTables.find((x) => x.id === id);
      s.querySelectorAll(".er-table").forEach((g) => g.classList.toggle("active", g.dataset.id === id));
      linkEls.forEach((p) => p.classList.toggle("active", p.dataset.a === id || p.dataset.b === id));
      $("#erDetails").innerHTML = `<h3><code>${esc(t.id)}</code></h3><dl class="qvcw">
        <dt>${T.purpose}</dt><dd>${esc(t.purpose)}</dd><dt>${T.keys}</dt><dd>${esc(t.keys)}</dd>
        <dt>${T.constraints}</dt><dd><ul>${t.constraints.map((c) => `<li><code>${esc(c)}</code></li>`).join("")}</ul></dd>
        <dt>${T.whyThis}</dt><dd>${esc(t.why)}</dd></dl>`;
    }
    $("#modelExtra").innerHTML = C.modelExtra;
  }

  // ---------- 5. ETL ----------
  function initETL() {
    const root = $("#etlDemos");
    const pag = el("div", { class: "panel" }, `<h2>${T.pagination}</h2><p>${C.etlIntro.pagination}</p>
      <div class="row gap wrap"><div class="seg" id="pagSeg"><button class="on" data-found="250">found = 250</button><button data-found="2600">found = 2600</button></div>
      <button class="btn primary" id="pagRun">${T.pagRun}</button></div>
      <div class="pages" id="pages"></div><p class="muted" id="pagLog"></p>`);
    root.appendChild(pag);
    let found = 250;
    const drawPages = () => {
      const pages = Math.ceil(found / 100);
      $("#pages").innerHTML = Array.from({ length: pages }, (_, i) => `<div class="page-box" data-i="${i}">page ${i}<br><span class="muted">${i * 100}–${Math.min(found, (i + 1) * 100) - 1}</span></div>`).join("");
      $("#pagLog").textContent = T.pagInfo(found, pages);
    };
    drawPages();
    $("#pagSeg").addEventListener("click", (e) => {
      if (!e.target.dataset.found) return;
      found = Number(e.target.dataset.found);
      $("#pagSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      drawPages();
    });
    $("#pagRun").addEventListener("click", async () => {
      drawPages();
      $("#pagRun").disabled = true;
      const boxes = [...document.querySelectorAll(".page-box")];
      let got = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (i * 100 >= 2000) { boxes.slice(i).forEach((b) => b.classList.add("cut")); $("#pagLog").innerHTML = T.pagCut(got, found); break; }
        boxes[i].classList.add("cur");
        await wait(reduceMotion ? 50 : 260);
        boxes[i].classList.replace("cur", "done");
        got = Math.min(found, (i + 1) * 100);
        $("#pagLog").textContent = T.pagGot(i, got, found);
      }
      if (found <= 2000) $("#pagLog").textContent += T.pagStop;
      $("#pagRun").disabled = false;
    });

    const SCEN = { ok: [429, 503, 500, 200], fail: [503, 503, 503, 503, 503], forbidden: [403] };
    const ret = el("div", { class: "panel" }, `<h2>${T.retryTitle}</h2><p>${C.etlIntro.retry}</p>
      <div class="row gap wrap"><div class="seg" id="retSeg"><button class="on" data-s="ok">429 → 503 → 500 → 200</button><button data-s="fail">${T.fail5}</button><button data-s="forbidden">403</button></div>
      <button class="btn primary" id="retRun">${T.play}</button></div>
      <div class="timeline" id="timeline"></div><p id="retLog" class="muted">${T.retryHint}</p>`);
    root.appendChild(ret);
    let scen = "ok";
    $("#retSeg").addEventListener("click", (e) => {
      if (!e.target.dataset.s) return;
      scen = e.target.dataset.s;
      $("#retSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      $("#timeline").innerHTML = "";
    });
    $("#retRun").addEventListener("click", async () => {
      const tl = $("#timeline");
      tl.innerHTML = "";
      $("#retRun").disabled = true;
      const codes = SCEN[scen];
      let total = 0;
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        tl.appendChild(el("div", { class: "tl-item" }, `<div class="tl-req r${code}">${code}</div><span>${T.attempt(i + 1)}</span>`));
        await wait(reduceMotion ? 50 : 350);
        if (code === 200) { $("#retLog").innerHTML = T.retryOk(i + 1, total.toFixed(1)); break; }
        if (code === 403) { $("#retLog").innerHTML = T.retry403; break; }
        if (i === codes.length - 1) { $("#retLog").innerHTML = T.retryGiveUp(codes.length, total.toFixed(1)); break; }
        const base = Math.pow(2, i);
        const sec = base + Math.random() * base * 0.1;
        total += sec;
        tl.appendChild(el("div", { class: "tl-item" }, `<div class="tl-wait" style="width:${Math.round(sec * 24)}px"></div><span>${sec.toFixed(2)} ${T.sec}</span>`));
        $("#retLog").textContent = T.retryWait(code, base, sec.toFixed(2));
        await wait(reduceMotion ? 50 : sec * 250);
      }
      $("#retRun").disabled = false;
    });

    const up = el("div", { class: "panel" }, `<h2>${T.upsertTitle}</h2><p>${C.etlIntro.upsert}</p>
      <div class="seg" id="upSeg"><button class="on" data-m="first">${T.upModes[0]}</button><button data-m="repeat">${T.upModes[1]}</button><button data-m="change">${T.upModes[2]}</button><button data-m="plain">${T.upModes[3]}</button></div>
      <div id="upView"></div>`);
    root.appendChild(up);
    const incoming = (salary) => ({ caption: T.fromApi, cols: ["hh_id", "name", "salary_to", "content_hash"], rows: [["104857600", T.sa, salary, salary === 160000 ? "a1f3…" : "c7d0…"], ["104857601", T.da, 140000, "9b2e…"]] });
    const MODES = {
      first: { text: T.up.first,
        tables: [incoming(160000),
          { caption: T.after("vacancy"), cols: ["id", "hh_id", "salary_to", "first_seen_at", "last_seen_at"], rows: [[1, "104857600", 160000, "10-29", "10-29"], [2, "104857601", 140000, "10-29", "10-29"]], cls: ["new", "new"] },
          { caption: T.after("vacancy_snapshot"), cols: ["vacancy_id", "valid_from", "valid_to", "salary_to"], rows: [[1, "10-25", null, 160000], [2, "10-26", null, 140000]], cls: ["new", "new"] }],
        log: "load_run: processed 2, new 2, changed 0" },
      repeat: { text: T.up.repeat,
        tables: [incoming(160000),
          { caption: T.after("vacancy"), cols: ["id", "hh_id", "salary_to", "first_seen_at", "last_seen_at"], rows: [[1, "104857600", 160000, "10-29", "10-30"], [2, "104857601", 140000, "10-29", "10-30"]], cells: [[0, 4], [1, 4]] },
          { caption: T.after("vacancy_snapshot"), cols: ["vacancy_id", "valid_from", "valid_to", "salary_to"], rows: [[1, "10-25", null, 160000], [2, "10-26", null, 140000]] }],
        log: T.up.repeatLog },
      change: { text: T.up.change,
        tables: [incoming(180000),
          { caption: T.after("vacancy"), cols: ["id", "hh_id", "salary_to", "first_seen_at", "last_seen_at"], rows: [[1, "104857600", 180000, "10-29", "10-30"], [2, "104857601", 140000, "10-29", "10-30"]], cls: ["upd", ""], cells: [[0, 2], [0, 3]] },
          { caption: T.after("vacancy_snapshot"), cols: ["vacancy_id", "valid_from", "valid_to", "salary_to"], rows: [[1, "10-25", "10-30", 160000], [2, "10-26", null, 140000], [1, "10-30", null, 180000]], cls: ["upd", "", "new"], cells: [[0, 2]] }],
        log: "load_run: processed 2, new 0, changed 1" },
      plain: { text: T.up.plain,
        tables: [incoming(160000),
          { caption: T.noUnique, cols: ["id", "hh_id", "salary_to"], rows: [[1, "104857600", 160000], [2, "104857601", 140000], [3, "104857600", 160000], [4, "104857601", 140000]], cls: ["", "", "dim", "dim"] }],
        log: "ERROR: duplicate key value violates unique constraint \"vacancy_hh_id_key\"" },
    };
    const drawUp = (m) => {
      const v = MODES[m];
      $("#upView").innerHTML = `<p>${esc(v.text)}</p><div class="tables-row">${v.tables.map(dataTable).join("")}</div><pre><code>${esc(v.log)}</code></pre>`;
    };
    drawUp("first");
    $("#upSeg").addEventListener("click", (e) => {
      if (!e.target.dataset.m) return;
      $("#upSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      drawUp(e.target.dataset.m);
    });
  }

  // ---------- 6. SQL lessons ----------
  function initSQL() {
    const tabs = $("#sqlTabs");
    C.sqlLessons.forEach((l, i) => {
      const b = el("button", { class: "btn small" + (i === 0 ? " active" : ""), role: "tab" }, esc(l.tab));
      b.addEventListener("click", () => { tabs.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); renderLesson(l); });
      tabs.appendChild(b);
    });
    renderLesson(C.sqlLessons[0]);
  }
  function renderLesson(l) {
    let step = 0;
    const box = $("#sqlLesson");
    box.innerHTML = `<div class="panel"><h2 style="margin-top:0">${esc(l.title)}</h2>
      <p><b>${T.businessQ}</b> ${esc(l.question)} <span class="muted">· ${T.file} <code>${esc(l.file)}</code></span></p>
      <div class="lesson-grid"><div><div class="stepper"><button class="btn small" data-a="prev">${T.prev}</button>
        <button class="btn small primary" data-a="next">${T.next}</button><button class="btn small" data-a="reset">${T.reset}</button>
        <div class="step-dots"></div></div><h3 class="step-title"></h3><p class="step-text"></p><div class="step-tables"></div></div>
      <div><pre class="sql-code"><code></code></pre></div></div>
      <h3>${T.whySo}</h3><p>${l.why}</p></div>`;
    const draw = () => {
      const s = l.steps[step];
      $(".step-title", box).textContent = `${T.stepOf(step + 1, l.steps.length)} ${s.title}`;
      $(".step-text", box).textContent = s.text;
      $(".step-tables", box).innerHTML = `<div class="tables-row">${s.tables.map(dataTable).join("")}</div>`;
      let code = esc(l.sql);
      if (s.mark) {
        const m = esc(s.mark);
        const idx = code.indexOf(m);
        if (idx >= 0) code = code.slice(0, idx) + `<span class="mark">${m}</span>` + code.slice(idx + m.length);
      }
      $(".sql-code code", box).innerHTML = code;
      $(".step-dots", box).innerHTML = l.steps.map((_, i) => `<span class="${i <= step ? "on" : ""}"></span>`).join("");
      $('[data-a="prev"]', box).disabled = step === 0;
      $('[data-a="next"]', box).disabled = step === l.steps.length - 1;
    };
    box.addEventListener("click", (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === "next" && step < l.steps.length - 1) step++;
      else if (a === "prev" && step > 0) step--;
      else if (a === "reset") step = 0;
      else return;
      draw();
    });
    draw();
  }

  // ---------- 7. Glossary ----------
  const SECTION_TITLES = T.sections;
  function initGlossary() {
    const input = $("#glossarySearch");
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const hl = (s) => {
        const e = esc(s);
        if (!q) return e;
        const i = e.toLowerCase().indexOf(esc(q).toLowerCase());
        return i < 0 ? e : e.slice(0, i) + "<mark>" + e.slice(i, i + esc(q).length) + "</mark>" + e.slice(i + esc(q).length);
      };
      const items = C.glossary.filter((g) => !q || g.slice(0, 3).join(" ").toLowerCase().includes(q));
      $("#glossaryCount").textContent = T.terms(items.length, C.glossary.length);
      $("#glossaryList").innerHTML = items.map(([term, def, ex, sec]) => `<div class="card"><h3>${hl(term)}</h3><p>${hl(def)}</p>
        <p class="muted"><b>${T.inProject}</b> ${hl(ex)}</p><p><a href="${document.getElementById(sec) ? "" : "../explainer/index.html"}#${sec}">→ ${esc(SECTION_TITLES[sec] || sec)}</a></p></div>`).join("")
        || `<p class="muted">${T.notFound}</p>`;
    };
    input.addEventListener("input", draw);
    draw();
  }

  // ---------- 8. ADR ----------
  function initADR() {
    $("#adrList").innerHTML = C.adrs.map((a) => `<div class="panel"><h3><span class="tag">${a.id}</span> ${esc(a.title)}</h3>
      <dl class="qvcw"><dt>${T.adrQ}</dt><dd>${esc(a.question)}</dd><dt>${T.options}</dt><dd>${esc(a.options)}</dd>
      <dt>${T.choice}</dt><dd><b>${esc(a.decision)}</b></dd><dt>${T.why}</dt><dd>${esc(a.why)}</dd><dt>${T.cost}</dt><dd>${esc(a.cost)}</dd></dl>
      <button class="btn small" data-alt="${a.id}">${T.alt}</button>
      <div class="explain" hidden id="alt-${a.id}" style="margin-top:10px">${a.alt}</div>
      <p class="muted" style="margin-bottom:0">${T.fileLbl} <code>docs/decisions/${a.id}-*.md</code></p></div>`).join("");
    $("#adrList").addEventListener("click", (e) => {
      const id = e.target.dataset && e.target.dataset.alt;
      if (!id) return;
      const box = document.getElementById("alt-" + id);
      box.hidden = !box.hidden;
      e.target.textContent = box.hidden ? T.alt : T.hideAlt;
    });
  }

  // ---------- 9. Charts ----------
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const MONTHS = T.months;
  const monthLabel = (iso) => MONTHS[Number(iso.slice(5, 7)) - 1] + " " + iso.slice(2, 4);
  const ROLE = { system_analyst: [T.roles.system_analyst, "--s1"], data_analyst: [T.roles.data_analyst, "--s2"], backend_junior: [T.roles.backend_junior, "--s3"] };
  let chartState = { skillRole: "all", city: "Все города" };

  function chartCard(key, title, bodyId, controls = "") {
    const t = C.chartTexts[key];
    return `<div class="chart-card" id="card-${key}"><button class="btn small view-toggle" data-table="${key}">${T.table}</button>
      <h2 style="margin-top:0">${esc(title)}</h2>${controls}<div id="${bodyId}"></div><div id="${bodyId}-table" hidden></div>
      <div class="why"><div><b>${T.chartQ}</b>${esc(t.q)}</div><div><b>${T.chartType}</b>${esc(t.type)}</div><div><b>${T.chartSee}</b>${esc(t.see)}</div><div><b>${T.chartCant}</b>${esc(t.cant)}</div></div></div>`;
  }
  function initCharts() {
    if (!D) { $("#chartList").innerHTML = `<p class="muted">${T.noData}</p>`; return; }
    const cities = [...new Set(D.q2_salary_median_by_month.map((r) => r.city))];
    $("#chartList").innerHTML =
      chartCard("skills", T.cSkills, "chSkills",
        `<div class="seg" id="skillSeg" style="margin-bottom:8px"><button class="on" data-r="all">${T.allAnalysts}</button><button data-r="system_analyst">${T.systemShort}</button><button data-r="data_analyst">${T.dataShort}</button></div>`) +
      chartCard("salary", T.cSalary, "chSalary",
        `<label class="muted">${T.city} <select id="citySel">${cities.map((c) => `<option value="${esc(c)}">${esc(dn(c))}</option>`).join("")}</select></label>`) +
      chartCard("nosalary", T.cNoSal, "chNoSalary") +
      chartCard("heatmap", T.cHeat, "chHeat") +
      chartCard("islands", T.cIslands, "chIslands");
    $("#skillSeg").addEventListener("click", (e) => {
      if (!e.target.dataset.r) return;
      chartState.skillRole = e.target.dataset.r;
      $("#skillSeg").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === e.target));
      drawSkills();
    });
    $("#citySel").addEventListener("change", (e) => { chartState.city = e.target.value; drawSalary(); });
    $("#chartList").addEventListener("click", (e) => {
      const key = e.target.dataset && e.target.dataset.table;
      if (!key) return;
      const card = document.getElementById("card-" + key);
      const [chart, table] = card.querySelectorAll(":scope > div[id^='ch']");
      const showTable = table.hidden;
      table.hidden = !showTable; chart.hidden = showTable;
      e.target.textContent = showTable ? T.chartView : T.table;
    });
    renderCharts();
  }
  function renderCharts() {
    if (!D || !$("#chSkills")) return;
    drawSkills(); drawSalary(); drawNoSalary(); drawHeat(); drawIslands();
  }
  function hBars(target, rows, { valueFmt, max, color, ci, ref }) {
    const W = 760, rowH = 26, left = 200, right = 90, top = 6;
    const H = top + rows.length * rowH + 26;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    const x = (v) => left + (v / max) * (W - left - right);
    const grid = svg("g", { class: "grid" });
    for (let t = 0; t <= max; t += max > 50 ? 20 : 10) {
      grid.appendChild(svg("line", { x1: x(t), x2: x(t), y1: top, y2: H - 22 }));
      const tx = svg("text", { x: x(t), y: H - 6, "text-anchor": "middle", class: "lbl" }, t);
      grid.appendChild(tx);
    }
    s.appendChild(grid);
    if (ref !== undefined) {
      s.appendChild(svg("line", { x1: x(ref.v), x2: x(ref.v), y1: top, y2: H - 22, class: "refline" }));
      s.appendChild(svg("text", { x: x(ref.v) + 4, y: top + 10, class: "lbl" }, ref.label));
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      s.appendChild(svg("text", { x: left - 8, y: y + rowH / 2 + 4, "text-anchor": "end", class: "lbl" }, r.label));
      const w = Math.max(2, x(r.value) - left);
      const bar = svg("rect", { x: left, y: y + 4, width: w, height: rowH - 8, rx: 3, class: "bar", fill: color });
      s.appendChild(bar);
      if (ci) {
        const [lo, hi] = ci[i];
        const cy = y + rowH / 2;
        s.appendChild(svg("line", { x1: x(lo), x2: x(hi), y1: cy, y2: cy, class: "ci" }));
        s.appendChild(svg("line", { x1: x(lo), x2: x(lo), y1: cy - 5, y2: cy + 5, class: "ci" }));
        s.appendChild(svg("line", { x1: x(hi), x2: x(hi), y1: cy - 5, y2: cy + 5, class: "ci" }));
      }
      s.appendChild(svg("text", { x: x(ci ? ci[i][1] : r.value) + 6, y: y + rowH / 2 + 4, class: "lbl" }, valueFmt(r)));
      const hit = svg("rect", { x: 0, y, width: W, height: rowH, class: "hit" });
      hit.addEventListener("mousemove", (e) => { bar.classList.add("on"); showTip(r.tip, e); });
      hit.addEventListener("mouseleave", () => { bar.classList.remove("on"); hideTip(); });
      s.appendChild(hit);
    });
    target.innerHTML = "";
    target.appendChild(s);
  }
  function drawSkills() {
    const role = chartState.skillRole;
    const key = role === "all" ? "vacancies" : role;
    const rows = D.q1_top_skills.map((r) => ({ label: dn(r.skill), n: r[key] }))
      .filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 15);
    const maxN = Math.max(...rows.map((r) => r.n));
    hBars($("#chSkills"), rows.map((r) => ({ label: r.label, value: r.n, tip: `<b>${esc(r.label)}</b><br>${T.vacanciesN(fmt(r.n))}` })),
      { max: Math.ceil(maxN / 100) * 100, color: cssVar(role === "data_analyst" ? "--s2" : "--s1"), valueFmt: (r) => fmt(r.value) });
    $("#chSkills-table").innerHTML = dataTable({ cols: T.skillCols, rows: D.q1_top_skills.map((r) => [dn(r.skill), r.vacancies, r.system_analyst, r.data_analyst, r.share_pct]) });
  }
  function drawSalary() {
    const city = chartState.city;
    const data = D.q2_salary_median_by_month.filter((r) => r.city === city);
    const months = [...new Set(D.q2_salary_median_by_month.map((r) => r.month))].sort();
    const W = 760, H = 320, L = 50, R = 34, TOP = 14, B = 34;
    const maxV = Math.max(100, ...data.map((r) => (r.median_salary || 0) / 1000));
    const yMax = Math.ceil(maxV / 50) * 50;
    const x = (i) => L + (i / (months.length - 1)) * (W - L - R);
    const y = (v) => TOP + (1 - v / yMax) * (H - TOP - B);
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    const grid = svg("g", { class: "grid" });
    for (let v = 0; v <= yMax; v += 50) {
      grid.appendChild(svg("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      grid.appendChild(svg("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", class: "lbl" }, v));
    }
    months.forEach((m, i) => grid.appendChild(svg("text", { x: x(i), y: H - 10, "text-anchor": "middle", class: "lbl" }, monthLabel(m))));
    s.appendChild(grid);
    const series = Object.keys(ROLE).map((role) => ({ role, pts: months.map((m) => data.find((r) => r.role === role && r.month === m) || null) }));
    series.forEach(({ role, pts }) => {
      const color = cssVar(ROLE[role][1]);
      let d = "", pen = false;
      pts.forEach((p, i) => {
        if (p && p.median_salary) { d += `${pen ? "L" : "M"}${x(i)},${y(p.median_salary / 1000)} `; pen = true; } else pen = false;
      });
      s.appendChild(svg("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }));
      pts.forEach((p, i) => { if (p && p.median_salary) s.appendChild(svg("circle", { cx: x(i), cy: y(p.median_salary / 1000), r: 4, fill: color, stroke: cssVar("--surface"), "stroke-width": 2 })); });
    });
    const cross = svg("line", { y1: TOP, y2: H - B, stroke: cssVar("--muted"), "stroke-dasharray": "3 3", opacity: 0 });
    s.appendChild(cross);
    const hit = svg("rect", { x: L, y: TOP, width: W - L - R, height: H - TOP - B, class: "hit" });
    hit.addEventListener("mousemove", (e) => {
      const rect = s.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const i = Math.max(0, Math.min(months.length - 1, Math.round(((px - L) / (W - L - R)) * (months.length - 1))));
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1);
      const lines = series.map(({ role, pts }) => {
        const p = pts[i];
        const v = p && p.median_salary ? `${fmt(Math.round(p.median_salary / 1000))} ${T.thousand} (n=${p.n_with_salary})` : p ? T.noMedian(p.n_with_salary) : T.noDataShort;
        return `<span style="color:${cssVar(ROLE[role][1])}">●</span> ${ROLE[role][0]}: ${v}`;
      });
      showTip(`<b>${monthLabel(months[i])}, ${esc(dn(city))}</b><br>${lines.join("<br>")}`, e);
    });
    hit.addEventListener("mouseleave", () => { cross.setAttribute("opacity", 0); hideTip(); });
    s.appendChild(hit);
    const target = $("#chSalary");
    target.innerHTML = `<div class="legend">${Object.values(ROLE).map(([l, v]) => `<span><i style="background:${cssVar(v)}"></i>${l}</span>`).join("")}</div>`;
    target.appendChild(s);
    if (city !== "Все города") target.insertAdjacentHTML("beforeend", `<p class="muted">${T.gapsNote}</p>`);
    $("#chSalary-table").innerHTML = dataTable({ cols: T.salaryCols, rows: data.map((r) => [r.month, ROLE[r.role][0], r.n_with_salary, r.median_salary, r.avg_salary]) });
  }
  function drawNoSalary() {
    const all = D.q4_no_salary_by_region;
    const total = all.find((r) => r.city === "Все города");
    const rows = all.filter((r) => r.city !== "Все города").sort((a, b) => b.pct_without_salary - a.pct_without_salary);
    const ciMap = Object.fromEntries(D.q4_ci.map((r) => [r.city, [r.ci_low, r.ci_high]]));
    hBars($("#chNoSalary"), rows.map((r) => ({ label: `${dn(r.city)} (n=${r.vacancies})`, value: r.pct_without_salary,
      tip: `<b>${esc(dn(r.city))}</b><br>${T.noSalTip(r.without_salary, r.vacancies, r.pct_without_salary)}<br>${T.ci95} ${ciMap[r.city][0]}–${ciMap[r.city][1]}%` })),
      { max: 100, color: cssVar("--s1"), ci: rows.map((r) => ciMap[r.city]), ref: { v: total.pct_without_salary, label: `${T.allCities} ${total.pct_without_salary}%` }, valueFmt: (r) => r.value + "%" });
    $("#chNoSalary-table").innerHTML = dataTable({ cols: T.noSalCols, rows: all.map((r) => [dn(r.city), r.vacancies, r.without_salary, r.pct_without_salary, ciMap[r.city] ? ciMap[r.city].join("–") : "—"]) });
  }
  function rampColor(t) {
    const stops = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
    return { fill: `rgb(${c.join(",")})`, dark: p > 3 };
  }
  function drawHeat() {
    const rows = D.q1b_skills_by_city;
    const skills = [...new Set(rows.map((r) => r.skill))];
    const cities = [...new Set(rows.map((r) => r.city))];
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    skills.sort((a, b) => avg(rows.filter((r) => r.skill === b).map((r) => r.share_pct)) - avg(rows.filter((r) => r.skill === a).map((r) => r.share_pct)));
    const W = 760, L = 110, TOP = 4, cw = (W - L) / cities.length, ch = 30, H = TOP + skills.length * ch + 70;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    skills.forEach((sk, i) => {
      s.appendChild(svg("text", { x: L - 8, y: TOP + i * ch + ch / 2 + 4, "text-anchor": "end", class: "lbl" }, dn(sk)));
      cities.forEach((c, j) => {
        const r = rows.find((x) => x.skill === sk && x.city === c);
        const col = rampColor(r.share_pct / 80);
        const rect = svg("rect", { x: L + j * cw + 1, y: TOP + i * ch + 1, width: cw - 2, height: ch - 2, rx: 3, fill: col.fill });
        rect.addEventListener("mousemove", (e) => showTip(`<b>${esc(dn(sk))} · ${esc(dn(c))}</b><br>${T.heatTip(r.mentions, r.n_vacancies, r.share_pct)}`, e));
        rect.addEventListener("mouseleave", hideTip);
        s.appendChild(rect);
        const t = svg("text", { x: L + j * cw + cw / 2, y: TOP + i * ch + ch / 2 + 4, "text-anchor": "middle", "font-size": "11", fill: col.dark ? "#fff" : "#0b0b0b", "pointer-events": "none" }, Math.round(r.share_pct));
        s.appendChild(t);
      });
    });
    cities.forEach((c, j) => {
      const n = rows.find((r) => r.city === c).n_vacancies;
      s.appendChild(svg("text", { x: L + j * cw + cw / 2, y: TOP + skills.length * ch + 18, "text-anchor": "middle", class: "lbl" }, dn(c).length > 12 ? dn(c).slice(0, 11) + "…" : dn(c)));
      s.appendChild(svg("text", { x: L + j * cw + cw / 2, y: TOP + skills.length * ch + 34, "text-anchor": "middle", class: "lbl" }, `n=${n}`));
    });
    $("#chHeat").innerHTML = "";
    $("#chHeat").appendChild(s);
    $("#chHeat-table").innerHTML = dataTable({ cols: T.heatCols, rows: rows.map((r) => [dn(r.skill), dn(r.city), r.n_vacancies, r.mentions, r.share_pct]) });
  }
  function drawIslands() {
    const rows = D.q6_stable_employers;
    const months = [];
    for (let m = 3; m <= 10; m++) months.push(`2026-${String(m).padStart(2, "0")}-01`);
    const W = 760, L = 170, TOP = 24, rh = 22, H = TOP + rows.length * rh + 10;
    const cw = (W - L - 10) / months.length;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    months.forEach((m, i) => {
      s.appendChild(svg("text", { x: L + i * cw + cw / 2, y: 14, "text-anchor": "middle", class: "lbl" }, monthLabel(m)));
      s.appendChild(svg("line", { x1: L + i * cw, x2: L + i * cw, y1: TOP - 4, y2: H - 6, stroke: cssVar("--border") }));
    });
    rows.forEach((r, i) => {
      const y = TOP + i * rh;
      const a = months.indexOf(r.streak_start), b = months.indexOf(r.streak_end);
      s.appendChild(svg("text", { x: L - 8, y: y + rh / 2 + 4, "text-anchor": "end", class: "lbl" }, dn(r.employer)));
      const bar = svg("rect", { x: L + a * cw + 2, y: y + 4, width: (b - a + 1) * cw - 4, height: rh - 8, rx: 4, fill: cssVar(r.streak_months === 8 ? "--s1" : "--s3") });
      bar.addEventListener("mousemove", (e) => showTip(`<b>${esc(dn(r.employer))}</b><br>${monthLabel(r.streak_start)} – ${monthLabel(r.streak_end)}: ${T.streak(r.streak_months)}<br>${T.activeTotal} ${r.active_months_total}`, e));
      bar.addEventListener("mouseleave", hideTip);
      s.appendChild(bar);
    });
    const t = $("#chIslands");
    t.innerHTML = `<div class="legend"><span><i style="background:${cssVar("--s1")}"></i>${T.fullPeriod}</span><span><i style="background:${cssVar("--s3")}"></i>${T.streak37}</span></div>`;
    t.appendChild(s);
    $("#chIslands-table").innerHTML = dataTable({ cols: T.islandCols, rows: rows.map((r) => [dn(r.employer), r.streak_start, r.streak_end, r.streak_months, r.active_months_total]) });
  }

  // ---------- 10–12 ----------
  function initPitfalls() {
    $("#pitfallList").innerHTML = C.pitfalls.map((p) => `<div class="card"><h3>${esc(p.title)} ${p.met ? `<span class="tag met">${T.met}</span>` : ""}</h3>
      <p>${esc(p.problem)}</p><dl class="qvcw"><dt>${T.detect}</dt><dd>${esc(p.detect)}</dd><dt>${T.howCheck}</dt><dd>${esc(p.check)}</dd><dt>${T.done}</dt><dd>${esc(p.fix)}</dd></dl></div>`).join("");
  }
  function initInterview() {
    const cats = [T.all, ...new Set(C.interview.map((q) => q[0])), T.traps];
    let cur = T.all;
    const filters = $("#interviewFilters");
    cats.forEach((c) => {
      const n = c === T.all ? C.interview.length : c === T.traps ? C.interview.filter((q) => q[3]).length : C.interview.filter((q) => q[0] === c).length;
      const b = el("button", { class: "btn small" + (c === cur ? " active" : "") }, `${esc(c)} (${n})`);
      b.addEventListener("click", () => { cur = c; filters.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); draw(); });
      filters.appendChild(b);
    });
    const draw = () => {
      const items = C.interview.map((q, i) => [i + 1, ...q]).filter(([, cat, , , trap]) => cur === T.all || (cur === T.traps ? trap : cat === cur));
      $("#interviewList").innerHTML = items.map(([n, cat, q, a, trap]) => `<details class="acc"><summary>${n}. ${esc(q)} ${trap ? `<span class="tag trap">${T.trap}</span>` : ""}<span class="tag">${esc(cat)}</span></summary>
        <div class="acc-body"><p>${esc(a)}</p></div></details>`).join("");
    };
    draw();
  }
  function initQuiz() {
    let answered = 0, right = 0;
    const total = C.quiz.length;
    const score = () => { $("#quizScore").textContent = T.score(answered, total, right); };
    score();
    const list = $("#quizList");
    C.quiz.forEach(([level, q, opts, ok, why], qi) => {
      const card = el("div", { class: "panel quiz" }, `<div class="level">${esc(level)}</div><p><b>${qi + 1}.</b> ${esc(q)}</p>`);
      const box = el("div", { class: "opts" });
      const out = el("div");
      opts.forEach((o, i) => {
        const b = el("button", { class: "opt" }, esc(o));
        b.addEventListener("click", () => {
          answered++; if (i === ok) right++;
          box.querySelectorAll("button").forEach((x, j) => { x.disabled = true; if (j === ok) x.classList.add("right"); else if (j === i) x.classList.add("wrong"); });
          out.innerHTML = `<p><b>${i === ok ? T.right : T.wrong}</b></p>` + opts.map((x, j) => `<p class="explain ${j === ok ? "ok" : "no"}"><b>${esc(x)}</b> — ${esc(why[j])}</p>`).join("");
          score();
        });
        box.appendChild(b);
      });
      card.append(box, out);
      list.appendChild(card);
    });
    $("#taskList").innerHTML = C.tasks.map((t, i) => `<div class="panel"><div class="level">${esc(t.level)}</div><p><b>${T.task(i + 1)}</b> ${esc(t.task)}</p>
      <details class="acc"><summary>${T.hint}</summary><div class="acc-body">${esc(t.hint)}</div></details>
      <details class="acc"><summary>${T.solution}</summary><div class="acc-body"><pre><code>${esc(t.solution)}</code></pre>
      <ul>${t.check.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div></details></div>`).join("");
  }

  // ---------- start ----------
  function safe(name, fn) {
    if (name !== "nav" && !document.getElementById(name)) return;
    try { fn(); } catch (e) { console.error("Section " + name + " failed to render:", e); }
  }
  initLang();
  initTheme();
  safe("nav", initNav);
  safe("map", initMap);
  safe("thinking", initThinking);
  safe("requirements", initRequirements);
  safe("model", initER);
  safe("etl", initETL);
  safe("sql", initSQL);
  safe("glossary", initGlossary);
  safe("decisions", initADR);
  safe("charts", initCharts);
  safe("pitfalls", initPitfalls);
  safe("interview", initInterview);
  safe("selfcheck", initQuiz);
})();
