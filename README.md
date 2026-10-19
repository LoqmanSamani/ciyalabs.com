# Ciya Labs — website

Static site (HTML/CSS/vanilla JS, no build step) built on the **Machina** template by TemplateMo,
heavily modified. Everything is self-hosted: fonts, images and scripts. The page makes no
third-party requests (no Google Fonts, analytics or cookies).

## Preview locally

```bash
cd site && python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

Use a server: opening `index.html` as a `file://` URL works, but browsers block the self-hosted fonts there.

## Structure

| Path | What it is |
|------|------------|
| `index.html` | One page, six split-screen sections: Home, Research, Products, Ventures, About, Contact |
| `imprint.html`, `privacy.html` | Legal pages, linked from every screen |
| `assets/css/ciya.css` | All styles: palette tokens at the top, mobile below 900 px, legal pages at the end |
| `assets/js/ciya.js` | Scroll engine, nav, deep links, carousel, tabs, console, lab clock |
| `assets/js/scope.js` | The three live research visuals (canvas) |
| `assets/img/` | `hero` (from `agri/v2_up.jpeg`), `summit`/`helix` detail crops, `og.jpg` share image |
| `assets/fonts/` | Inter + JetBrains Mono (variable woff2, Latin and German subset) + licences (SIL OFL) |
| `assets/logo/` | Copied from `../logo/svg` and `../logo/png`; regenerate there, then copy |

## How it behaves

- **Desktop (> 900 px):** Machina's virtual scroll. The left and right tracks move in opposite
  directions; you move with the wheel, arrow keys, PageUp/PageDown, Home/End, the HUD arrows or the nav.
  - Every section has a deep link: `#research`, `#products`, `#ventures`, `#about`, `#contact`.
  - Tabbing into another section brings it into view.
  - A panel whose content is taller than the screen scrolls internally first.
- **Mobile (≤ 900 px):** normal scrolling, a sticky top bar with a section strip, and each section
  shown text first, then its visual.
- **Reduced motion:** the scroll engine jumps instead of easing. Animations stop, and the research
  visuals render one still frame.
- **The research scope** (section 02): one canvas whose visual follows the open accordion item.
  - BioDreamer: rollouts planned in imagination over an energy landscape
  - HydraTrade: cross-sectional ranking
  - Generative models: reverse diffusion from noise into the Ciya mark
  - It only animates while visible.

## Editing content

- **Text and links:** in `index.html`.
- **Venture tab copy:** the `tabData` object in `assets/js/ciya.js`.
- **Console lines:** `CONSOLE_LINES` in the same file. They are labelled "illustrative feed" on the page.
- **Products:** one `<article class="c3d-card">` each, plus its matching `mod-btn`. The carousel
  radius adapts to the card count. Add `data-href` to a card to show an "Open" link when it faces front.
- **Research lines:** one `.acc-item` each, matched by position to the visuals in `MODES` in
  `scope.js`. A fourth line needs a fourth visual there, or reuse an existing one.

## Live

Published at https://ciyalabs.com via GitHub Pages (repo `LoqmanSamani/ciyalabs.com`, branch `main`,
root). `site/` is pushed there as a git subtree:

    git subtree push --prefix site website main

After changing CSS or JS, bump the `?v=` tag on `ciya.css`, `scope.js` and `ciya.js` in all three
HTML files, otherwise browsers keep the cached old files.

Done before launch (16.10.2026): hosting (GitHub Pages) in `privacy.html`, email `info@ciyalabs.com`,
absolute `og:image`, `CNAME` = `ciyalabs.com`, imprint name "Ciya Labs" (Gewerbe-Ummeldung of
16.10.2026), hero source photo is the owner's own.

Note (16.10.2026): the first Pages deployment got stuck as "in progress" and blocked every later
deploy ("due to in progress deployment"). Fixed by deleting the `github-pages` environment in
Settings → Environments; Pages recreates it on the next deploy.
