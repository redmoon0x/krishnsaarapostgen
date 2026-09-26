# Kannada Carousel Composer

A browser-based tool for typesetting Kannada text into Instagram carousel images.
Runs entirely client-side — no build step, no server, no tracking.

Open `index.html` and paste your text.

## Features

**Sentence-aware pagination.** Pages are filled with whole sentences first, then
whole clauses, then words. A slide never ends mid-sentence, and pages keep a
ragged bottom rather than shredding a line to fill it. A line can never exceed
the column, and body text never collides with the footer rule.

**Markdown.** Headings (h1–h6), bullet and numbered lists with nesting, task
lists, tables, blockquotes, code blocks, inline `**bold**` / `*italic*` /
`` `code` `` / `~~strike~~`, images, and rules. Use `<!-- break -->` to force a
page break; `---` draws a horizontal rule as in standard Markdown.

**Diagrams.** Fenced ` ```mermaid ` blocks are rendered as real diagrams. The
library is loaded lazily, so nothing is fetched unless you actually write one.
If it cannot load, the source falls back to a monospace block.

**13 backgrounds** — papers, patterns and gradients, each with a text colour
chosen to clear WCAG AA, plus custom colours with a live contrast check.

**15 Kannada typefaces** — Tunga, Kedage, Kadamba, Anek Kannada, Lohit Kannada
for text; Karnata GTN, Nudi 22K, Karnata Bandipur, Karnata F Kittel, Karnata
Wesleyan and Karnata German Mission for display. The Sanchaya faces are vendored
from [fonts.sanchaya.net](https://fonts.sanchaya.net/) so the tool works offline.

**Export.** PNG, JPEG or WebP at 4:5, 1:1 or 9:16, downloaded individually or as
a ZIP with zero-padded filenames so carousel order survives any file browser.

## Design notes

- Rendering is deterministic. Grain and star fields come from a seeded PRNG, so
  re-composing the same input produces byte-identical pages.
- Images are held as Blobs rather than base64, keeping memory flat for long
  carousels. Object URLs are revoked on regeneration.
- Text and settings autosave to `localStorage`, including uploaded images, and
  flush on `beforeunload`.
- Upload images by **drag-and-drop** or **paste** (click the row, then Ctrl+V) —
  neither opens a native file dialog. Colours are picked in-page for the same
  reason.

## Credits

- Kannada typefaces from the [Sanchaya](https://sanchaya.org) project via
  [fonts.sanchaya.net](https://fonts.sanchaya.net/), under the SIL Open Font
  License. Interface faces are from Google Fonts.
- [JSZip](https://stuk.github.io/jszip/) for ZIP export.
- [Mermaid](https://mermaid.js.org/) for diagrams, loaded on demand.

## Licence

Code released under the MIT licence. Bundled fonts remain under their own
licences — see [fonts.sanchaya.net](https://fonts.sanchaya.net/) for details.
