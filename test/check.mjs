// Serves docs/ locally, opens it in headless Chromium at iPhone size and checks search, the reader and the settings.
//   node test/check.mjs        (screenshots go to test/shots/)
import puppeteer from "puppeteer-core";
import http from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { extname } from "node:path";

const docs = new URL("../docs/", import.meta.url).pathname;
const shots = new URL("./shots/", import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = docs + p.slice(1);
  if (!existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(m.type() + ": " + m.text()); });
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (process.env.DARK) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);

  const home = await page.evaluate(() => ({
    now: document.querySelectorAll("#now .row").length, meal: document.querySelectorAll("#meal .row").length,
    toc: document.querySelectorAll("#toc .toc-c").length, overflow: document.documentElement.scrollWidth - innerWidth,
    font: document.fonts.check('500 20px "Rubik"', "סידור"),
  }));
  ok(home.now >= 1 && home.meal === 3, `home board rows (now ${home.now}, after eating ${home.meal})`);
  ok(home.toc === 31, `table of contents lists all chapters (${home.toc})`);
  ok(home.overflow <= 0, "no sideways scrolling on the home screen");
  ok(home.font, "fonts load");
  await page.screenshot({ path: shots + "1-home.png" });

  const searchFor = async (q) => {
    await page.$eval("#q", (el) => { el.value = ""; });
    await page.type("#q", q);
    await sleep(400);
    return page.evaluate(() => ({
      titles: [...document.querySelectorAll("#results .row .row-t")].map((e) => e.textContent),
      hits: document.querySelectorAll("#results .hit").length,
      head: [...document.querySelectorAll("#results h2")].map((e) => e.textContent).join(" | "),
      empty: !!document.querySelector("#results .empty"),
    }));
  };
  let r = await searchFor("על המחיה");
  ok(r.titles[0] === "ברכת מעין שלוש", `"על המחיה" → ${r.titles[0]}`);
  r = await searchFor("שמונה עשרה");
  ok(r.titles[0] === "עמידה", `"שמונה עשרה" → ${r.titles.slice(0, 3).join(", ")}`);
  r = await searchFor("ברכת המזון");
  ok(r.titles[0] === "ברכת המזון", `"ברכת המזון" → ${r.titles[0]}`);
  r = await searchFor("תפילת הדרך");
  ok(r.titles[0] === "תפלת הדרך", `"תפילת הדרך" → ${r.titles[0]}`);
  r = await searchFor("בורא נפשות");
  ok(r.titles.includes("ברכות הנהנין"), `"בורא נפשות" → ${r.titles.join(", ")}`);
  r = await searchFor("אשר יצר את האדם");
  ok(r.hits >= 1, `text search "אשר יצר את האדם" finds ${r.hits} places`);
  await page.screenshot({ path: shots + "2-search.png" });
  r = await searchFor("קשקשת זזזז");
  ok(r.empty, "an unknown word shows the empty message");

  // Open a text hit: lands on the paragraph with the words marked.
  await searchFor("רצה והחליצנו");
  await page.click("#results .hit");
  await sleep(700);
  const reader = await page.evaluate(() => ({
    view: document.body.dataset.view, title: document.getElementById("r-chapter").textContent,
    marked: document.querySelectorAll("#text mark").length,
    flashTop: document.querySelector("#text .flash")?.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth - innerWidth,
  }));
  ok(reader.view === "reader", `opened the reader at ${reader.title}`);
  ok(reader.marked >= 1, "the searched words are marked in the text");
  ok(reader.flashTop > 0 && reader.flashTop < 844, "the found paragraph is on screen");
  ok(reader.overflow <= 0, "no sideways scrolling in the reader");
  await page.evaluate(() => document.fonts.ready);
  ok(await page.evaluate(() => document.fonts.check('20px "Frank Ruhl Libre"', "בָּרוּךְ")), "prayer font loads");
  await page.screenshot({ path: shots + "3-reader-hit.png" });

  // Back keeps the search.
  await page.click("#back");
  await sleep(400);
  ok(await page.evaluate(() => document.body.dataset.view === "home" && document.getElementById("q").value === "רצה והחליצנו"), "back returns to the search results");

  // Shortcut to a chapter, font size and theme.
  await page.$eval("#q", (el) => { el.value = ""; el.dispatchEvent(new Event("input")); });
  await sleep(300);
  await page.click("#meal .row");
  await sleep(500);
  const fs0 = await page.evaluate(() => getComputedStyle(document.getElementById("text")).fontSize);
  await page.screenshot({ path: shots + "4-mazon.png" });
  await page.evaluate(() => document.querySelector('[popovertarget="settings"]:not(#home *)').click());
  await sleep(300);
  await page.screenshot({ path: shots + "5-settings.png" });
  await page.click("#fs-up"); await page.click("#fs-up");
  await page.click('[data-set-theme="light"]');
  await sleep(300);
  const after = await page.evaluate(() => ({ fs: getComputedStyle(document.getElementById("text")).fontSize, bg: getComputedStyle(document.getElementById("reader")).backgroundColor }));
  ok(parseFloat(after.fs) > parseFloat(fs0), `font size grows (${fs0} → ${after.fs})`);
  ok(after.bg === "rgb(244, 241, 234)", "light reading page");
  await page.keyboard.press("Escape");
  await sleep(200);
  await page.screenshot({ path: shots + "6-mazon-light.png" });

  // Favourite and resume show up on the board.
  await page.click("#fav");
  await page.click("#back");
  await sleep(400);
  const mine = await page.evaluate(() => ({ fav: document.querySelectorAll("#favs .row").length, resume: !!document.querySelector("#resume .resume") }));
  ok(mine.fav === 1 && mine.resume, "favourite and 'continue where you stopped' appear on the board");
  await page.screenshot({ path: shots + "7-home-after.png", fullPage: true });

  // Every chapter opens without errors.
  const all = await page.evaluate(async () => {
    const bad = [];
    for (let i = 0; i < 31; i++) {
      location.hash = `#/c/${i}`;
      await new Promise((r) => setTimeout(r, 30));
      if (!document.querySelector("#text p")) bad.push(i);
    }
    location.hash = "#/";
    return bad;
  });
  ok(all.length === 0, "all 31 chapters open with text" + (all.length ? ` (empty: ${all})` : ""));

  ok(logs.length === 0, "console is clean" + (logs.length ? ":\n    " + logs.join("\n    ") : ""));
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? `\n${fails} check(s) failed` : "\nall checks passed");
process.exit(fails ? 1 : 0);
