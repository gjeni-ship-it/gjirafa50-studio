# Gjirafa50 Creative Engine — MVP (Step 3)

Renders social creatives from **HTML/CSS templates** using **Playwright** (or Puppeteer).
No Canva, no Figma. Given product data, it outputs three images per product:

| Format | Size | Notes |
|---|---|---|
| Feed | 1080×1080 | square |
| Story | 1080×1920 | vertical |
| Reel Cover | 1080×1920 | vertical; bottom ~260px kept clear for Reels UI |

Every creative includes the required elements: **product image, discount badge, sale price,
regular price (strikethrough), CTA button, and the Gjirafa50 logo** (+ category, product name, URL).

---

## Folder structure
```
creative-engine/
├── templates/
│   └── creative.html        # one template, all 3 formats; exposes window.renderCreative(format, product, brand)
├── brand/
│   ├── brand.json           # logo + colours + CTA (placeholder palette — swap for official brand)
│   ├── logo.svg             # placeholder wordmark — replace with the real logo
│   └── fonts/               # (optional) brand .woff2 files
├── data/
│   ├── variables.json       # INPUT: brand config + product array (generated from the selection engine)
│   └── variables.test.json  # same data but image points to a local sample (offline render test)
├── render.js                # Playwright renderer → PNGs
├── package.json
├── output/                  # generated PNGs + render_manifest.json
└── README.md
```

## Template structure (`templates/creative.html`)
- A single fixed-size `#canvas` element; `feed` / `story` / `reel` are CSS classes that set the exact pixel
  dimensions and the per-format type scale. All sizing is in **px** so renders are deterministic.
- `window.renderCreative(format, product, brand)` builds the DOM for one creative. The renderer calls it
  via `page.evaluate(...)`; opening the file with `?demo&format=story` renders a sample for eyeballing in a browser.
- Brand theming is driven by CSS variables (`--accent`, `--bg1`, `--bg2`, `--accent-ink`) set from `brand`.
- Logo resolution order: `brand.logoSvg` (inline SVG) → `brand.logo` (path/data-URI) → built-in placeholder wordmark.
- Prices are parsed tolerantly ("2.00€", "2.00 EUR" both work); the badge shows the discount with a forced leading "−".

## Rendering workflow
```bash
cd creative-engine
npm install                 # installs Playwright (postinstall fetches Chromium)
node render.js              # reads data/variables.json → writes output/<id>_<format>.png
# options:
node render.js --data data/variables.json --out output --formats feed,story,reel
```
For each product × format the renderer: sets the viewport to the exact size → loads `creative.html`
→ injects the product via `renderCreative` → waits for fonts + images → screenshots `#canvas` (clipped to
exact size) → writes the PNG and appends to `output/render_manifest.json`.

Daily pipeline use: the selection engine (Step 1) writes the chosen products; a tiny adapter maps them into
`variables.json` (see below); `node render.js` produces the images for the AI Creative Designer step.

> **Puppeteer:** swap `require('playwright').chromium` for `require('puppeteer')` — `goto`/`evaluate`/`screenshot` are identical.
>
> **Env note:** on a normal machine `chromium.launch()` works as-is. In restricted sandboxes set
> `CHROME_PATH=/path/to/chrome` to use a full Chrome/Chromium build (the bundled headless-shell may not run there).

## `variables.json` format
```jsonc
{
  "brand": {
    "name": "Gjirafa50",
    "url": "gjirafa50.com",
    "cta_text": "Bli tani",
    "accent": "#E4002B", "accentInk": "#FFFFFF",
    "bg1": "#0E1726", "bg2": "#1B2C4A",
    "logo": "",          // path or data-URI to logo image, OR
    "logoSvg": ""        // inline <svg>…</svg> string (takes priority)
  },
  "formats": ["feed", "story", "reel"],
  "products": [
    {
      "id": 256383,
      "slot": "Product of the Day",          // drives the kicker (Oferta e Ditës / Happy Hour)
      "category": "Aksesorë",
      "product_name": "Bateri Philips AA LR6, alkaline, paketim 10 copë",
      "regular_price": "16.50€",             // shown strikethrough
      "sale_price": "2.00€",                 // shown large
      "discount_percentage": "-88%",         // badge
      "product_image": "https://gjirafa50.com/images/thumbs/<guid>.jpg",  // URL or local path
      "product_url": "https://gjirafa50.com/bateri-philips-aa-lr6-alkaline-paketim-10-cope"
    }
    // … one object per product (this MVP feeds the 5 featured: Product of the Day + 4 Happy Hour)
  ]
}
```
Required input fields per product: `product_image, product_name, regular_price, sale_price,
discount_percentage, category`. `slot`, `product_url`, `id`, and `cta_text` are optional but recommended.

## Where this sits in the pipeline
```
Database → AI Analyst → AI Product Selector → AI Copywriter → [AI Creative Designer ← this engine]
        → Human Approval → Meta Publisher → Performance Report → AI Learning Loop
```
Input = the AI Product Selector output (Step 1, `selection_today.json`). Output = PNGs handed to Human Approval,
then the Meta Publisher. The engine does **not** publish.

## Before production — replace the placeholders
1. Drop the real **Gjirafa50 logo** into `brand/logo.svg` (or set `brand.logoSvg`).
2. Set the official **brand colours** in `brand.json` (`accent`, `bg1`, `bg2`).
3. (Optional) add the brand **font** to `brand/fonts/` and `@font-face` it in `creative.html` for exact typography.
4. Confirm the **product image URL** pattern (the live CDN base) so photos load in production.

## Verified
`output/` contains 15 sample PNGs (5 products × 3 formats), rendered at exact 1080×1080 / 1080×1920 using a
local placeholder product image. Real runs use the live product photo from `product_image`.

---

# Daily pipeline — one command (`run_daily.js`)

Runs the whole day in one go and writes a dated folder. **Nothing is published.**

```
Database → [candidates.json] → selection engine → captions → variables.json
        → render Feed/Story/Reel → approval_summary.html   (Human Approval step)
```

## Run
```bash
cd creative-engine
npm install                      # once (fetches Playwright Chromium)
node run_daily.js                # uses today's date + data/candidates.json
# options:
node run_daily.js --date 2026-06-08 --candidates data/candidates.json --outroot ..
```
On a normal machine `chromium.launch()` works as-is. In restricted sandboxes set
`CHROME_PATH=/path/to/chrome`.

## Step 1 — the database pull
A standalone script has no DB credentials, so the **Gjirafa50 MCP database tool** runs
`engine/candidate_query.sql` and saves the rows to `data/candidates.json`. In Cowork the
scheduled agent does this right before calling `run_daily.js`. (To run fully unattended off
Cowork, add a small fetch step using a SQL Server driver + connection string and write the
same JSON shape; everything downstream is unchanged.)

## Output — `outputs/YYYY-MM-DD/`
```
outputs/2026-06-08/
├── selection_today.json      # 8 picks (1 PoD + 4 Happy Hour + 3 backup) from the engine
├── selection_today.csv/.md   # same, human-readable
├── captions_today.json       # Albanian copy for the 5 featured (FB/IG/Story/Headline/CTA/Carousel/A-B)
├── variables.json            # render input for the 5 featured
├── <id>_feed.png             # 1080×1080  (×5)
├── <id>_story.png            # 1080×1920  (×5)
├── <id>_reel.png             # 1080×1920  (×5)
├── render_manifest.json      # per-image image_status: ok | fallback | none | error
└── approval_summary.html     # Human Approval view (thumbnails + copy + flags)
```
The persistent 7-day no-repeat memory lives in `state/selection_history.json` (outside the day
folder) so each day avoids the previous days' featured products. Re-running the same day cleans
that day's PNGs first (idempotent).

## Error handling & image fallback
- **Each render is isolated** in a try/catch — one bad product/format does not abort the batch;
  it's recorded as `image_status: "error"` in `render_manifest.json`.
- **Product image fails / missing:** the template first swaps to the **brand fallback image**
  (`brand/fallback.svg`, embedded as a data-URI so it loads in any environment); if that also
  fails it shows a clean "foto e produktit" placeholder. Missing `product_image` uses the
  fallback pre-emptively. Every image's outcome (`ok`/`fallback`/`none`/`error`) is written to
  the manifest and **flagged in `approval_summary.html`** so a human notices before approving.
- **Any pipeline step failing** prints `FAILED at step: <n>` and exits non-zero (safe for cron/schedulers).

## Pipeline position
`… AI Copywriter → [AI Creative Designer = this] → Human Approval (approval_summary.html) → Meta Publisher`.
The Meta Publisher is intentionally **not** wired up yet.
