// Downloads the full Siddur Edot HaMizrach (Torat Emet 357, public domain) from Sefaria.
// Run once: node scripts/fetch.mjs  →  raw/edot-hamizrach.json
import { writeFileSync, mkdirSync } from "node:fs";

const VERSION = "Siddur Edot HaMizrach - he - Torat Emet 357";
const url = "https://www.sefaria.org/download/version/" + encodeURIComponent(VERSION) + ".json";

const res = await fetch(url);
if (!res.ok) throw new Error(`Sefaria answered ${res.status}`);
const text = await res.text();
JSON.parse(text); // fail loudly on a broken download
mkdirSync(new URL("../raw/", import.meta.url), { recursive: true });
writeFileSync(new URL("../raw/edot-hamizrach.json", import.meta.url), text);
console.log(`saved raw/edot-hamizrach.json (${(text.length / 1e6).toFixed(2)} MB)`);
