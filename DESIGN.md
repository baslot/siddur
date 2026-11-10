# Design: the shul letter board

The siddur's home screen is the changeable-letter board at the synagogue entrance: white letters pressed into ribbed black felt, with the prayers of this hour lit red. The reading page is calm, large nikud text.

## Color
| token | value | job |
|---|---|---|
| `--felt` | #17171b | board ground: home, reader top bar, menus, status bar |
| `--felt-up` | #202026 | raised board parts (resume, menus) |
| `--groove` | #2b2b32 | row separators, borders |
| `--grooves` | 1px white 3.5% every 7px | felt ribs, only on board surfaces, never behind prayer text |
| `--letter` / `-2` / `-3` | #f4f1ea / #aaa498 / #8f897f | board lettering, secondary, labels |
| `--red` / `--red-lit` | #d6453d / #ff6a5e | only "now" rows, search results, actions, focus |
| reader light | bg #f4f1ea, ink #1b1a1d, instr #6c665c | reading page (theme: phone / light / dark) |
| reader dark | bg #17171b, ink #ece8df, instr #9a948a | |

## Type
- Rubik 400/500/600 (self-hosted): all board lettering and UI. Rows 25px/500, labels 13px/600 tracked .14em.
- Frank Ruhl Libre 400/700: prayer text, `--fs` (default 24px, 18–40), line-height 1.9.
- Instructions (`<small>`, no nikud): Rubik at .64em in the instruction color. Text printed small but said aloud (`.sm`): serif at .82em, secondary ink.

## Components
- Board row: title + right-aligned note, 62px minimum, groove underline, no cards.
- Lit row: red lettering. The section head has a red dot with a soft ring.
- Search strip: a 60px white-letter strip with felt-colored text and a red caret and focus ring.
- Searching: the board dims to 16% and loses its color; the results appear lit.
- Reader bar: felt with grooves, back, chapter/prayer titles (tracks scroll), prayer list, favorite, text settings.
- Menus: native popovers on raised felt, segmented control, switch.

## Motion
One exponential ease-out (`cubic-bezier(.16,1,.3,1)`), 0.22–0.32s: board dimming, results lighting, menu drop, found-paragraph flash. All motion is off under reduced-motion.

## Assets
The icons are drawn by `scripts/make-icons.py` from Rubik (the word סידור and the red dot). No outside images.
