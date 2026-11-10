// Builds the site into docs/ (GitHub Pages serves that folder).
//   node scripts/build.mjs
// Input: raw/edot-hamizrach.json (from scripts/fetch.mjs), src/*, fonts from node_modules.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url).pathname;
const out = root + "docs/";
const raw = JSON.parse(readFileSync(root + "raw/edot-hamizrach.json", "utf8"));

// ---------- text cleanup ----------
const KEEP = new Set(["b", "small", "big", "br"]);
const ENT = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decode = (s) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);

// Keeps only <b>, <small>, <big>, <br>; flattens nesting of the same tag; always balanced.
function clean(html) {
  const depth = { b: 0, small: 0, big: 0 };
  let res = "";
  for (const part of html.split(/(<[^>]*>)/)) {
    const m = part.match(/^<\s*(\/?)\s*([a-z0-9]+)/i);
    if (!m) { res += esc(decode(part)); continue; }
    const [, close, nameRaw] = m;
    const name = nameRaw.toLowerCase();
    if (!KEEP.has(name)) continue;
    if (name === "br") { res += "<br>"; continue; }
    if (close) { if (depth[name] > 0 && --depth[name] === 0) res += `</${name}>`; }
    else if (depth[name]++ === 0) res += `<${name}>`;
  }
  for (const n of ["b", "small", "big"]) if (depth[n] > 0) res += `</${n}>`;
  // <small> marks two things in the source: instructions (no nikud) and text said quietly or optionally (with nikud).
  res = res.replace(/<small>([\s\S]*?)<\/small>/g, (m, inner) => {
    const t = inner.replace(/<[^>]+>/g, "");
    const letters = (t.match(/[א-ת]/g) || []).length;
    const marks = (t.match(/[ְ-ׇּׁׂ]/g) || []).length;
    return letters && marks / letters > 0.35 ? `<span class="sm">${inner}</span>` : m;
  });
  // A whole paragraph printed small gets its own line spacing.
  const whole = res.match(/^<span class="sm">([\s\S]*)<\/span>$/);
  if (whole && !whole[1].includes("<span")) res = `<span class="sm sm-p">${whole[1]}</span>`;
  return res
    .replace(/<(b|small|big)>(\s*)<\/\1>/g, "$2")     // empty tags
    .replace(/\s+/g, " ")
    .replace(/ +([,:.;])/g, "$1")                      // "יְהֹוָה ," → "יְהֹוָה,"
    .replace(/(<br>\s*)+$/g, "")
    .trim();
}
const plain = (h) => decode(h.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const bare = (s) => s.replace(/[֑-ׇ"'״׳\s]/g, "");
const isHeading = (h) => /^<big>[\s\S]*<\/big>$/.test(h) && !/<\/big>[\s\S]*<big>/.test(h);

// ---------- groups and search aliases ----------
const GROUPS = [
  ["יום חול", ["סדר השכמת הבוקר", "שחרית לימי החול", "תוספות לשחרית", "מנחה לימי החול", "ערבית לימי החול", "קריאת שמע שעל המיטה", "סדר תיקון חצות"]],
  ["ברכות", ["ברכת המזון", "ברכת מעין שלוש", "ברכות הנהנין", "ברכות ותפילות שונות", "ברכת הלבנה"]],
  ["שבת", ["סדר הדלקת נרות שבת", "שיר השירים", "קבלת שבת", "ערבית של שבת", "סדר ליל שבת", "שחרית של שבת", "מוסף של שבת", "סדר סעודה שניה", "מנחה של שבת", "סעודה שלישית", "מוצאי שבת", "משניות לשבת"]],
  ["מועדים וזמנים", ["ספירת העומר", "סדר ראש חודש", "תפילה לשלש רגלים", "חנוכה", "פורים", "חודש ניסן", "תעניות ואבילות"]],
];

// Extra words people type when looking for a prayer (title → aliases).
const ALIASES = {
  "ברכת המזון": "ברכת מזון, בהמ\"ז, זימון, ברכה אחרונה, נטילת מים אחרונים",
  "ברכת מעין שלוש": "מעין שלש, על המחיה, על הגפן, על העץ, ברכה אחרונה, ברכה מעין שלוש",
  "ברכות הנהנין": "ברכה ראשונה, ברכות האוכל, מזונות, הגפן, העץ, האדמה, שהכל, בורא נפשות, ריח, בשמים, שהחיינו",
  "ברכות השחר": "נטילת ידיים, אשר יצר, אלהי נשמה, ברכות הבוקר",
  "ברכות התורה": "ברכת התורה",
  "עמידה": "שמונה עשרה, תפילת העמידה, תפילת לחש",
  "תפילת שבע": "עמידה של שבת, שמונה עשרה",
  "ק\"ש וברכותיה": "קריאת שמע, שמע ישראל, יוצר אור",
  "קריאת שמע שעל המיטה": "שמע על המיטה, לפני השינה, המפיל",
  "סדר הדלקת נרות שבת": "נרות שבת, הדלקת נרות",
  "תפלת הדרך": "תפילת הדרך, נסיעה, טיסה, יציאה לדרך",
  "ברכת הלבנה": "קידוש לבנה, ברכת הירח",
  "סדר הבדלה": "הבדלה, בשמים",
  "קידוש ליל שבת": "קידוש, ויכולו",
  "קידוש היום": "קידוש, קידושא רבא, קידוש של בוקר",
  "ספירת העומר": "עומר, ספירה",
  "ברכת המזוזה": "מזוזה, קביעת מזוזה",
  "סדר הנחת תפילין": "תפילין",
  "סדר עטיפת ציצית": "ציצית, טלית",
  "ברכת הגומל": "הגומל, גומל",
  "ברכת ברקים ורעמים": "ברקים, רעמים, ברק, רעם",
  "ברכת הקשת": "קשת, קשת בענן",
  "סדר ההדלקה": "נרות חנוכה, הדלקת נרות חנוכה, הנרות הללו",
  "קריאת המגילה": "מגילה, מגילת אסתר",
  "סדר ברכת האילנות": "ברכת האילנות, אילנות",
  "הלל לראש חודש ולמועדים": "הלל",
  "וידוי": "אשמנו, תחנון, נפילת אפיים",
  "עלינו": "עלינו לשבח",
  "תפלת הנוטל תרופה": "תרופה, רפואה",
  "פרקי אבות": "אבות",
  "סדר הפרשת חלה": "חלה, הפרשת חלה",
  "ברכת טבילת כלים": "טבילת כלים, טבילה",
  "הכרזת ראש חדש": "ברכת החודש, מברכים",
  "ברכות ההפטרה": "הפטרה",
  "סדר ברית מילה": "ברית, מילה",
  "סדר ארוסין ונשואין": "חתונה, חופה, קידושין",
  "סדר שבע ברכות": "שבע ברכות, חתונה",
  "סדר הפרשת תרומות ומעשרות": "תרומות, מעשרות, הפרשת מעשרות",
  "סדר פדיון הבן": "פדיון הבן",
  "אבלות": "בית אבל, השכבה",
  "פטום הקטורת": "קטורת, פיטום הקטורת",
  "פסוקי דזמרה": "פסוקי דזימרה, ברוך שאמר, ישתבח",
  "שיר של יום": "שיר היום",
  "מודה אני": "השכמה, קימה בבוקר",
};

// ---------- build the data ----------
const chapters = [];
const groupOf = new Map(GROUPS.flatMap(([g, list]) => list.map((t) => [t, g])));
const seenTitles = new Set();
const aliasHits = new Set();

function makeItem(title, paras) {
  title = title.trim();
  let p = paras.map(clean).filter((h) => plain(h));
  p = p.map((h) => (isHeading(h) ? "##" + plain(h) : h));
  if (p[0]?.startsWith("##") && bare(p[0].slice(2)) === bare(title)) p.shift(); // heading repeats the title
  const item = { t: title, p };
  if (ALIASES[title]) { item.k = ALIASES[title]; aliasHits.add(title); }
  return item;
}

for (const top of raw.schema.nodes) {
  const data = raw.text[top.enTitle];
  if (!data) throw new Error("no text for " + top.enTitle);
  const items = top.nodes
    ? top.nodes.map((n) => { const d = data[n.enTitle]; if (!Array.isArray(d)) throw new Error("no text for " + n.enTitle); return makeItem(n.heTitle, d); })
    : [makeItem(top.heTitle, data)];
  const g = groupOf.get(top.heTitle);
  if (!g) throw new Error("chapter without a group: " + top.heTitle);
  seenTitles.add(top.heTitle);
  const ch = { t: top.heTitle, g, items };
  if (ALIASES[top.heTitle] && !top.nodes) ch.k = ALIASES[top.heTitle];
  chapters.push(ch);
}
for (const t of groupOf.keys()) if (!seenTitles.has(t)) throw new Error("group lists a missing chapter: " + t);
for (const t of Object.keys(ALIASES)) if (!aliasHits.has(t)) throw new Error("alias for a missing prayer: " + t);

const siddur = {
  nusach: "עדות המזרח",
  source: "סידור עדות המזרח, מהדורת תורת אמת (נחלת הכלל), דרך ספריא",
  groups: GROUPS.map(([g]) => g),
  chapters,
};

// ---------- write docs/ ----------
rmSync(out, { recursive: true, force: true });
mkdirSync(out + "fonts", { recursive: true });
mkdirSync(out + "icons", { recursive: true });

const dataJson = JSON.stringify(siddur);
writeFileSync(out + "siddur.json", dataJson);

const FONTS = [
  ["@fontsource/frank-ruhl-libre/files", ["hebrew-400-normal", "hebrew-700-normal", "latin-400-normal", "latin-700-normal"], "frank-ruhl-libre"],
  ["@fontsource/rubik/files", ["hebrew-400-normal", "hebrew-500-normal", "hebrew-600-normal", "latin-400-normal", "latin-500-normal", "latin-600-normal"], "rubik"],
];
for (const [dir, names, fam] of FONTS) {
  for (const n of names) copyFileSync(`${root}node_modules/${dir}/${fam}-${n}.woff2`, `${out}fonts/${fam}-${n}.woff2`);
  copyFileSync(`${root}node_modules/${dir.replace("/files", "")}/LICENSE`, `${out}fonts/${fam}-LICENSE.txt`); // SIL OFL 1.1
}

for (const f of readdirSync(root + "src")) if (f !== "sw.js") copyFileSync(root + "src/" + f, out + f);
if (existsSync(root + "icons")) for (const f of readdirSync(root + "icons")) copyFileSync(root + "icons/" + f, out + "icons/" + f);

// The service worker gets the file list and a version hash, so every change reaches the phone.
const files = [];
(function list(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) list(dir + e.name + "/", rel + e.name + "/");
    else files.push(rel + e.name);
  }
})(out, "");
const hash = createHash("sha256");
for (const f of files.sort()) hash.update(f).update(readFileSync(out + f));
const version = hash.digest("hex").slice(0, 10);
const sw = readFileSync(root + "src/sw.js", "utf8")
  .replace("__VERSION__", version)
  .replace("__FILES__", JSON.stringify(["./", ...files.filter((f) => f !== "index.html")]));
writeFileSync(out + "sw.js", sw);
writeFileSync(out + ".nojekyll", "");

const nItems = chapters.reduce((a, c) => a + c.items.length, 0);
const nParas = chapters.reduce((a, c) => a + c.items.reduce((b, i) => b + i.p.length, 0), 0);
console.log(`docs/ built: ${chapters.length} chapters, ${nItems} prayers, ${nParas} paragraphs, data ${(dataJson.length / 1e6).toFixed(2)} MB, version ${version}`);
