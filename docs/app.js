"use strict";
/* סידור עדות המזרח — search, table of contents and reader. No framework, works offline. */

const $ = (sel, el = document) => el.querySelector(sel);
const app = { data: null, titles: [], paras: [], view: "home", homeY: 0, ci: -1, internalNav: false, wake: null };

/* ---------- storage (per device; the app works without it) ---------- */
const KEY = "siddur.v1";
const prefs = Object.assign({ fs: 24, theme: "auto", wake: true, favs: [], recent: [], last: null, hint: true }, load());
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ } }

/* ---------- Hebrew normalisation for search ---------- */
const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
// Returns the normalised string and, per normalised char, its index in the input.
function normMap(s) {
  let out = "", map = [], space = true;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    const code = c.charCodeAt(0);
    if (c === "־" || c === "׀" || c === "׃") c = " ";               // maqaf, paseq, sof pasuq
    else if (code >= 0x0591 && code <= 0x05C7) continue;                             // nikud and teamim
    else if (c === '"' || c === "'" || c === "״" || c === "׳" || c === "`") continue;
    c = FINALS[c] || c.toLowerCase();
    if (!/[א-תa-z0-9]/.test(c)) c = " ";
    if (c === " ") { if (space) continue; space = true; } else space = false;
    out += c; map.push(i);
  }
  if (out.endsWith(" ")) { out = out.slice(0, -1); map.pop(); }
  return { n: out, map };
}
const norm = (s) => normMap(s).n;
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------- data ---------- */
async function boot() {
  applyPrefs();
  try {
    const res = await fetch("siddur.json");
    if (!res.ok) throw new Error(res.status);
    app.data = await res.json();
  } catch {
    $("#status").hidden = false;
    $("#status").textContent = "לא הצלחתי לטעון את הסידור. בדוק את החיבור לאינטרנט ופתח שוב. אחרי הפתיחה הראשונה הסידור עובד גם בלי אינטרנט.";
    return;
  }
  index();
  renderHome();
  window.addEventListener("hashchange", route);
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

function index() {
  app.data.chapters.forEach((ch, ci) => {
    const single = ch.items.length === 1 && ch.items[0].t === ch.t;
    app.titles.push({ ci, ii: single ? 0 : -1, t: ch.t, crumb: ch.g, n: norm(ch.t), k: norm(ch.k || (single && ch.items[0].k) || "") });
    if (!single) ch.items.forEach((it, ii) => app.titles.push({ ci, ii, t: it.t, crumb: ch.t, n: norm(it.t), k: norm(it.k || "") }));
    ch.items.forEach((it, ii) => it.p.forEach((h, pi) => {
      const plain = h.startsWith("##") ? h.slice(2) : textOf(h);
      app.paras.push({ ci, ii, pi, plain, n: norm(plain) });
    }));
  });
}

/* ---------- shortcuts (resolved by title, so a data change fails loudly in the test) ---------- */
const SHORT = {
  shacharit: ["שחרית", "שחרית לימי החול"],
  hashachar: ["ברכות השחר", "סדר השכמת הבוקר", "ברכות השחר"],
  mincha: ["מנחה", "מנחה לימי החול"],
  arvit: ["ערבית", "ערבית לימי החול"],
  mazon: ["ברכת המזון", "ברכת המזון"],
  meein: ["מעין שלוש", "ברכת מעין שלוש"],
  nehenin: ["ברכות הנהנין", "ברכות הנהנין"],
  derech: ["תפילת הדרך", "ברכות ותפילות שונות", "תפלת הדרך"],
  shema: ["שמע על המיטה", "קריאת שמע שעל המיטה"],
  chatzot: ["תיקון חצות", "סדר תיקון חצות"],
  nerot: ["הדלקת נרות", "סדר הדלקת נרות שבת"],
  kabbalat: ["קבלת שבת", "קבלת שבת"],
  kiddush: ["קידוש ליל שבת", "סדר ליל שבת", "קידוש ליל שבת"],
  shalom: ["שלום עליכם", "סדר ליל שבת", "שלום עליכם"],
  shirim: ["שירי שבת", "סדר ליל שבת", "שירי שבת"],
  kiddushDay: ["קידוש היום", "סדר סעודה שניה", "קידוש היום"],
  shacharitShabbat: ["שחרית של שבת", "שחרית של שבת"],
  minchaShabbat: ["מנחה של שבת", "מנחה של שבת"],
  havdala: ["הבדלה", "מוצאי שבת", "סדר הבדלה"],
  levana: ["ברכת הלבנה", "ברכת הלבנה"],
  omer: ["ספירת העומר", "ספירת העומר"],
};
function target(key) {
  const [label, chT, itT] = SHORT[key];
  const ci = app.data.chapters.findIndex((c) => c.t === chT);
  const ii = itT ? app.data.chapters[ci]?.items.findIndex((i) => i.t === itT) : 0;
  if (ci < 0 || ii < 0) throw new Error("shortcut target missing: " + key);
  return { label, ci, ii: itT ? ii : 0 };
}

// What fits this hour. A shortcut by the clock, not a halachic time.
function nowPart(d = new Date()) {
  const h = d.getHours(), day = d.getDay();
  if (day === 5 && h >= 15) return { name: "ערב שבת", keys: ["nerot", "kabbalat", "kiddush", "shalom"] };
  if (day === 6 && h < 4) return { name: "ליל שבת", keys: ["kiddush", "shirim", "mazon", "shema"] };
  if (day === 6 && h < 13) return { name: "שבת בבוקר", keys: ["shacharitShabbat", "kiddushDay", "mazon"] };
  if (day === 6 && h < 18) return { name: "שבת אחר הצהריים", keys: ["minchaShabbat", "mazon", "havdala"] };
  if (day === 6) return { name: "מוצאי שבת", keys: ["havdala", "arvit", "shema"] };
  if (h >= 4 && h < 12) return { name: "בוקר", keys: ["hashachar", "shacharit"] };
  if (h >= 12 && h < 17) return { name: "צהריים", keys: ["mincha"] };
  if (h >= 17 && h < 22) return { name: "ערב", keys: ["arvit", "mincha"] };
  return { name: "לילה", keys: ["shema", "arvit", "chatzot"] };
}

/* ---------- home ---------- */
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
function row(t, sub, href, cls = "") {
  return `<a class="row ${cls}" href="${href}"><span class="row-t">${esc(t)}</span>${sub ? `<span class="row-s">${esc(sub)}</span>` : ""}</a>`;
}
const hrefOf = (ci, ii, pi) => `#/c/${ci}` + (ii > 0 || pi != null ? `/${ii}` : "") + (pi != null ? `/${pi}` : "");
function itemLabel(ci, ii) {
  const ch = app.data.chapters[ci], it = ch?.items[ii];
  if (!it) return null;
  return it.t === ch.t ? { t: ch.t, sub: ch.g } : { t: it.t, sub: ch.t };
}

function renderHome() {
  const part = nowPart();
  const nowRows = part.keys.map(target).map((x) => row(x.label, itemLabel(x.ci, x.ii).sub, hrefOf(x.ci, x.ii), "lit")).join("");
  $("#now").innerHTML = `<h2 class="now-h">עכשיו · ${part.name}</h2>${nowRows}`;

  $("#meal").innerHTML = `<h2>אחרי האוכל</h2>` +
    [["mazon", "כולל זימון"], ["meein", "על המחיה · על הגפן · על העץ"], ["nehenin", "מזונות · שהכל · בורא נפשות"]]
      .map(([k, s]) => { const x = target(k); return row(x.label, s, hrefOf(x.ci, x.ii)); }).join("");

  const more = ["shacharit", "mincha", "arvit", "derech", "shema", "kiddush", "havdala", "nerot", "kabbalat", "levana", "omer", "hashachar"]
    .filter((k) => !part.keys.includes(k)).slice(0, 10).map(target);
  $("#more").innerHTML = `<h2>עוד בלוח</h2><div class="grid">${more.map((x) => `<a href="${hrefOf(x.ci, x.ii)}">${esc(x.label)}</a>`).join("")}</div>`;

  renderMine();

  $("#toc").innerHTML = `<h2>כל הסידור</h2>` + app.data.groups.map((g) => {
    const chs = app.data.chapters.map((c, ci) => [c, ci]).filter(([c]) => c.g === g);
    return `<h3 class="toc-g">${esc(g)}</h3>` + chs.map(([c, ci]) => c.items.length === 1
      ? `<a class="toc-c" href="${hrefOf(ci, 0)}">${esc(c.t)}</a>`
      : `<details class="toc-d"><summary class="toc-c">${esc(c.t)}<span class="toc-n">${c.items.length}</span>${icon("chev")}</summary>` +
        `<div class="toc-items"><a href="${hrefOf(ci, 0)}" class="toc-all">כל ${esc(c.t)}</a>` +
        c.items.map((it, ii) => `<a href="${hrefOf(ci, ii)}">${esc(it.t)}</a>`).join("") + `</div></details>`).join("");
  }).join("") + `<p class="source">${esc(app.data.source)}</p>`;
}

function renderMine() {
  const last = prefs.last && itemLabel(prefs.last.ci, prefs.last.ii);
  $("#resume").innerHTML = last
    ? `<a class="resume" href="${hrefOf(prefs.last.ci, prefs.last.ii, prefs.last.pi)}"><span class="resume-k">המשך מאיפה שעצרת</span><span class="resume-t">${esc(last.t)}</span><span class="row-s">${esc(last.sub)}</span>${icon("back")}</a>`
    : "";
  const favs = prefs.favs.map((f) => [f, itemLabel(...f.split("/").map(Number))]).filter(([, l]) => l);
  $("#favs").innerHTML = favs.length ? `<h2>מועדפים</h2>` + favs.map(([f, l]) => { const [ci, ii] = f.split("/").map(Number); return row(l.t, l.sub, hrefOf(ci, ii)); }).join("") : "";
  const rec = prefs.recent.filter((r) => !prefs.favs.includes(r)).slice(0, 4).map((f) => [f, itemLabel(...f.split("/").map(Number))]).filter(([, l]) => l);
  $("#recent").innerHTML = rec.length ? `<h2>פתחת לאחרונה</h2>` + rec.map(([f, l]) => { const [ci, ii] = f.split("/").map(Number); return row(l.t, l.sub, hrefOf(ci, ii)); }).join("") : "";
  const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  $("#hint").hidden = standalone || !prefs.hint;
}

/* ---------- search ---------- */
function search(q) {
  const nq = norm(q);
  if (nq.replace(/ /g, "").length < 2) return null;
  const words = nq.split(" ");
  const titles = [];
  for (const t of app.titles) {
    let s = 0;
    if (t.n === nq) s = 100; else if (t.n.startsWith(nq)) s = 80; else if (t.n.includes(nq)) s = 60;
    else if (t.k && (", " + t.k).includes(" " + nq)) s = 50; else if (t.k.includes(nq)) s = 40;
    else if (words.length > 1 && words.every((w) => t.n.includes(w) || t.k.includes(w))) s = 30;
    if (s) titles.push({ ...t, s: s - (t.ii > 0 ? 1 : 0) });
  }
  titles.sort((a, b) => b.s - a.s || a.ci - b.ci || a.ii - b.ii);

  let hits = app.paras.filter((p) => p.n.includes(nq));
  let phrase = true;
  if (!hits.length && words.length > 1) { hits = app.paras.filter((p) => words.every((w) => p.n.includes(w))); phrase = false; }
  // Whole-word matches first, then siddur order.
  const starts = (p) => { const i = p.n.indexOf(phrase ? nq : words[0]); return i === 0 || p.n[i - 1] === " " ? 0 : 1; };
  hits = hits.map((p) => ({ p, w: starts(p) })).sort((a, b) => a.w - b.w).map((x) => x.p);
  return { titles: titles.slice(0, 8), hits, nq, words, phrase };
}

function snippet(plain, nq, words) {
  const { n, map } = normMap(plain);
  let i = n.indexOf(nq), len = nq.length;
  if (i < 0) { i = n.indexOf(words[0]); len = words[0].length; }
  if (i < 0) return esc(plain.slice(0, 90));
  const a = map[i], b = map[i + len - 1] + 1;
  let from = Math.max(0, a - 38), to = Math.min(plain.length, b + 70);
  if (from > 0) from = plain.indexOf(" ", from) + 1 || from;
  if (to < plain.length) to = plain.lastIndexOf(" ", to) > b ? plain.lastIndexOf(" ", to) : to;
  return (from > 0 ? "… " : "") + esc(plain.slice(from, a)) + "<mark>" + esc(plain.slice(a, b)) + "</mark>" + esc(plain.slice(b, to)) + (to < plain.length ? " …" : "");
}

let searchTimer = 0;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 120);
}
function runSearch() {
  const q = $("#q").value;
  const r = app.data && search(q);
  document.body.classList.toggle("searching", !!r);
  $("#clear").hidden = !q;
  const box = $("#results");
  if (!r) { box.innerHTML = ""; return; }
  let html = "";
  if (r.titles.length) html += `<h2>תפילות וברכות</h2>` + r.titles.map((t) => row(t.t, t.crumb, hrefOf(t.ci, Math.max(t.ii, 0)))).join("");
  if (r.hits.length) {
    const shown = r.hits.slice(0, 60);
    html += `<h2>${r.phrase ? "מופיע בתוך הטקסט" : "כל המילים מופיעות"} · ${r.hits.length}</h2>` + shown.map((p) => {
      const ch = app.data.chapters[p.ci], it = ch.items[p.ii];
      const where = it.t === ch.t ? ch.t : `${ch.t} · ${it.t}`;
      return `<a class="hit" href="${hrefOf(p.ci, p.ii, p.pi)}" data-q="${esc(q)}"><span class="hit-w">${esc(where)}</span><span class="hit-x">${snippet(p.plain, r.nq, r.words)}</span></a>`;
    }).join("") + (r.hits.length > shown.length ? `<p class="more-hits">ועוד ${r.hits.length - shown.length} מקומות. הוסף מילה כדי לצמצם.</p>` : "");
  }
  if (!html) html = `<div class="empty"><p>לא מצאתי "${esc(q.trim())}".</p><p>נסה שם אחר של התפילה, או כמה מילים מתוך הנוסח.</p></div>`;
  box.innerHTML = html;
}

/* ---------- reader ---------- */
function paraHTML(h, ii, pi) {
  return h.startsWith("##") ? `<h3 id="p-${ii}-${pi}">${esc(h.slice(2))}</h3>` : `<p id="p-${ii}-${pi}">${h}</p>`;
}
function renderChapter(ci) {
  const ch = app.data.chapters[ci];
  const single = ch.items.length === 1;
  $("#r-chapter").textContent = ch.t;
  $("#text").innerHTML = `<h1 class="ch-t">${esc(ch.t)}</h1>` + ch.items.map((it, ii) =>
    `<section class="item" id="i-${ii}" data-ii="${ii}">${single && it.t === ch.t ? "" : `<h2 class="it-t">${esc(it.t)}</h2>`}${it.p.map((h, pi) => paraHTML(h, ii, pi)).join("")}</section>`).join("");
  const prev = app.data.chapters[ci - 1], next = app.data.chapters[ci + 1];
  $("#pager").innerHTML =
    (next ? `<a href="${hrefOf(ci + 1, 0)}" class="pg-next"><span>הפרק הבא</span>${esc(next.t)}</a>` : "") +
    (prev ? `<a href="${hrefOf(ci - 1, 0)}" class="pg-prev"><span>הפרק הקודם</span>${esc(prev.t)}</a>` : "");
  $("#jump-list").innerHTML = ch.items.map((it, ii) => `<a href="${hrefOf(ci, ii)}" data-ii="${ii}">${esc(it.t)}</a>`).join("");
  $("#jump").hidden = single;
  app.ci = ci;
  observeItems();
}

let io = null;
function observeItems() {
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) setCurrent(+e.target.dataset.ii);
  }, { rootMargin: "-30% 0px -65% 0px" });
  document.querySelectorAll("#text .item").forEach((s) => io.observe(s));
}
function setCurrent(ii) {
  const ch = app.data.chapters[app.ci];
  if (!ch) return;
  app.ii = ii;
  $("#r-item").textContent = ch.items.length > 1 ? ch.items[ii].t : "";
  document.querySelectorAll("#jump-list a").forEach((a) => a.toggleAttribute("aria-current", +a.dataset.ii === ii));
  const fav = prefs.favs.includes(`${app.ci}/${ii}`);
  $("#fav").setAttribute("aria-pressed", fav);
  $("#fav").setAttribute("aria-label", fav ? "הסר ממועדפים" : "הוסף למועדפים");
}

// Marks the searched words inside a paragraph (ignores nikud, like the search).
function highlight(el, q) {
  const nq = norm(q);
  if (!nq) return;
  const nodes = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let text = "";
  while (walker.nextNode()) { nodes.push([walker.currentNode, text.length]); text += walker.currentNode.data; }
  const { n, map } = normMap(text);
  const words = n.includes(nq) ? [nq] : nq.split(" ");
  const ranges = [];
  for (const w of words) { const i = n.indexOf(w); if (i >= 0) ranges.push([map[i], map[i + w.length - 1] + 1]); }
  for (const [a, b] of ranges.reverse()) {
    const r = document.createRange();
    const at = (pos) => { for (let k = nodes.length - 1; k >= 0; k--) if (nodes[k][1] <= pos) return [nodes[k][0], pos - nodes[k][1]]; };
    try {
      r.setStart(...at(a)); r.setEnd(...at(b - 1)); r.setEnd(r.endContainer, r.endOffset + 1);
      const m = document.createElement("mark");
      m.appendChild(r.extractContents()); r.insertNode(m);
    } catch { /* match crosses tags in an unusual way: the paragraph flash is enough */ }
  }
}

/* ---------- routing ---------- */
function route() {
  document.querySelectorAll(".pop").forEach((p) => { try { p.hidePopover(); } catch { /* not open */ } });
  const m = location.hash.match(/^#\/c\/(\d+)(?:\/(\d+))?(?:\/(\d+))?/);
  if (m && app.data.chapters[+m[1]]) return showReader(+m[1], +(m[2] || 0), m[3] != null ? +m[3] : null);
  showHome();
}

function showHome() {
  if (app.view === "reader") saveSpot();
  app.view = "home";
  document.body.dataset.view = "home";
  releaseWake();
  renderMine();
  document.title = "סידור";
  requestAnimationFrame(() => window.scrollTo(0, app.homeY));
}

function showReader(ci, ii, pi) {
  if (app.view === "home") app.homeY = window.scrollY;
  app.view = "reader";
  document.body.dataset.view = "reader";
  if (app.ci !== ci) renderChapter(ci);
  document.title = app.data.chapters[ci].t;
  const it = app.data.chapters[ci].items[ii] ? ii : 0;
  const el = (pi != null && document.getElementById(`p-${it}-${pi}`)) || (it > 0 ? document.getElementById(`i-${it}`) : null);
  requestAnimationFrame(() => {
    if (el) {
      el.scrollIntoView({ block: pi != null ? "center" : "start" });
      if (pi != null) {
        const q = app.lastQuery;
        if (q) highlight(el, q);
        el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
      }
    } else window.scrollTo(0, 0);
    setCurrent(it);
  });
  const key = `${ci}/${it}`;
  prefs.recent = [key, ...prefs.recent.filter((r) => r !== key)].slice(0, 8);
  prefs.last = { ci, ii: it, pi: pi ?? undefined };
  save();
  holdWake();
}

function saveSpot() {
  if (app.ci < 0) return;
  // The first paragraph whose top is on screen.
  const ps = document.querySelectorAll(`#i-${app.ii ?? 0} > p`);
  let pi;
  for (const p of ps) if (p.getBoundingClientRect().top > 60) { pi = +p.id.split("-")[2]; break; }
  prefs.last = { ci: app.ci, ii: app.ii ?? 0, pi };
  save();
}

/* ---------- screen stays on while reading ---------- */
async function holdWake() {
  if (!prefs.wake || !("wakeLock" in navigator) || app.wake) return;
  try { app.wake = await navigator.wakeLock.request("screen"); app.wake.addEventListener("release", () => { app.wake = null; }); } catch { app.wake = null; }
}
function releaseWake() { app.wake?.release().catch(() => {}); app.wake = null; }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && app.view === "reader") holdWake();
  if (document.visibilityState === "hidden" && app.view === "reader") saveSpot();
});

/* ---------- display settings ---------- */
const FS_MIN = 18, FS_MAX = 40;
function applyPrefs() {
  document.documentElement.style.setProperty("--fs", prefs.fs + "px");
  if (prefs.theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = prefs.theme;
  const dark = prefs.theme === "dark" || (prefs.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue(dark ? "--chrome-dark" : "--chrome-light").trim() || "#17171b";
  document.querySelectorAll("[data-set-theme]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.setTheme === prefs.theme));
  const w = $("#wake-toggle"); if (w) w.checked = prefs.wake;
  const s = $("#fs-val"); if (s) s.textContent = Math.round((prefs.fs / 24) * 100) + "%";
}
function setFs(delta) {
  // Keep the paragraph at the top of the screen in place while the text grows.
  const anchor = app.view === "reader" ? [...document.querySelectorAll("#text p, #text h2, #text h3")].find((p) => p.getBoundingClientRect().bottom > 70) : null;
  const before = anchor?.getBoundingClientRect().top;
  prefs.fs = Math.min(FS_MAX, Math.max(FS_MIN, prefs.fs + delta));
  save(); applyPrefs();
  if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyPrefs);

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='#']");
  if (a) {
    app.internalNav = true;
    if (a.classList.contains("hit")) app.lastQuery = a.dataset.q; else if (!a.closest("#jump-list")) app.lastQuery = null;
    if (a.closest("#jump-list")) $("#jump-pop").hidePopover?.();
    if (a.getAttribute("href") === location.hash) { e.preventDefault(); route(); }
    return;
  }
  const t = e.target.closest("button");
  if (!t) return;
  if (t.id === "back") { if (app.internalNav && history.length > 1) history.back(); else location.hash = "#/"; }
  else if (t.id === "clear") { $("#q").value = ""; runSearch(); $("#q").focus(); }
  else if (t.id === "fs-down") setFs(-2);
  else if (t.id === "fs-up") setFs(2);
  else if (t.dataset.setTheme) { prefs.theme = t.dataset.setTheme; save(); applyPrefs(); }
  else if (t.id === "fav") {
    const key = `${app.ci}/${app.ii ?? 0}`;
    prefs.favs = prefs.favs.includes(key) ? prefs.favs.filter((f) => f !== key) : [...prefs.favs, key];
    save(); setCurrent(app.ii ?? 0);
  } else if (t.id === "hint-close") { prefs.hint = false; save(); $("#hint").hidden = true; }
  else if (t.id === "top") window.scrollTo({ top: 0, behavior: "smooth" });
});
document.addEventListener("change", (e) => {
  if (e.target.id === "wake-toggle") { prefs.wake = e.target.checked; save(); if (prefs.wake && app.view === "reader") holdWake(); else releaseWake(); }
});
$("#q").addEventListener("input", onSearch);
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#q").blur(); const first = $("#results a"); if (first) first.click(); }
  if (e.key === "Escape") { $("#q").value = ""; runSearch(); }
});

boot();
