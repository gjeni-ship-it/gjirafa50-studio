# Gjirafa50 Social Studio — Product Browser (Platform Step 1)

A standalone web app: browse **live** Gjirafa50 KS products, pick one manually, and click
**Gjenero Kreativ** to preview creatives + Albanian copy. **No automatic selection, no publishing.**

> Built as a real web app (not a Cowork artifact) on purpose: artifacts sandbox the page and block
> external images, so they cannot show real product photos. A normal browser loads them fine.

## Run
```bash
cd platform
npm install
npm start          # http://localhost:3000
```
- **Snapshot mode (default):** runs immediately off `data/snapshot.json` (200 live products pulled from
  the DB) so you can use the UI right away. Full search/filter/sort/paging works in-memory.
- **Live mode:** copy `.env.example` → `.env`, set `DB_CONN` (read-only SQL Server) and run `npm i mssql`.
  The header pill flips to **LIVE DB** and every query hits the database directly.

## What it shows (per product, from the database)
product image · name · **current live price** · regular price · discount % · stock · category · product URL.
Search box, category filter, "on sale only" / "in stock only", sort (discount / newest / price / name), paging.

## Real images only — missing-image guard
Images load from the real CDN via `IMAGE_PATTERN` (`{guid}` / `{ext}` placeholders). If a product image
fails to load (or has no picture), the card shows **“⚠ Imazhi mungon”** and the **Gjenero Kreativ button is
disabled** — generation is blocked. No fallback graphic is ever used as final output.

### ⚠ Confirm the image URL pattern
The exact CDN pattern needs confirming (the live site is client-rendered, so it couldn't be auto-detected).
Set it in `.env` (`IMAGE_PATTERN=`) or live in the UI via the **⚙ Imazhi** button (saved in the browser).
Paste one working product-image URL and I can lock the pattern. Current default:
`https://50cdn.gjirafamall.tech/images/{id}/{id}.jpeg`.

## Generate (preview only, this step)
Clicking **Gjenero Kreativ** opens a panel with:
- a live in-browser preview of the **Feed / Story / Reel** creative (brand template, real product image), and
- editable **Headline, CTA, Facebook caption, Instagram caption, Meta description** (Albanian).

**Approve** and **Publish** are intentionally disabled here — those are the next platform steps.

## API
`GET /api/config` · `GET /api/categories` · `GET /api/products?search=&category=&sort=&onSale=&inStock=&offset=&limit=`
→ `{ mode, total, items:[{product_id, product_name, price, oldprice, discount, stock, category, picture_guid, mime, slug}] }`

## Files
```
platform/
├── server.js          # Express API + static host
├── db.js              # data layer: live mssql (DB_CONN) OR snapshot fallback
├── sql/products.sql   # the live browser query (reference)
├── data/snapshot.json # 200 live products (seed so the app runs before DB creds)
├── public/            # index.html, styles.css, app.js (the dashboard)
├── .env.example
└── README.md
```

## Architecture roadmap (this platform)
1. **Product Browser** ✅ (this step) → 2. Manual selection ✅ → 3. Generate image + copy (preview ✅; PNG export reuses `../creative-engine`)
→ 4. Preview/edit ✅ → 5. Approval (next) → 6. Meta publish (next) → Publishing history (next).

---

# Hybrid creative (Gemini background + CSS overlay)

The "Gjenero Kreativ" panel can generate the **background** with Gemini 2.5 Flash Image
("Nano Banana") while the **product photo, price, discount, name, CTA and logo** stay as the
deterministic HTML/CSS overlay. This is intentional:

- AI image models render **text/prices unreliably** (garbled letters, wrong numbers) — so we never
  let AI draw the price/text.
- The **real product photo** must stay accurate (it's a real SKU) — so AI never redraws the product.
- AI is great at **backgrounds/scenes** — so that's all it does here.

## Setup
1. Get a Google AI Studio API key.
2. In `.env`: `GEMINI_API_KEY=...` (optional `GEMINI_MODEL=gemini-2.5-flash-image`).
3. Restart `npm start`. The header config shows `geminiEnabled:true`; the **✨ Sfond AI** button activates.

## How it works
- Frontend → `POST /api/generate-bg { format, prompt }`.
- `gemini.js` calls `…/models/gemini-2.5-flash-image:generateContent` with
  `responseModalities:["IMAGE"]` and `imageConfig.aspectRatio` (`1:1` feed, `9:16` story/reel),
  using a built-in "clean light studio background, no text/logo/product" prompt (overridable via the
  prompt box). Results are cached on disk (`data/bg-cache/`) to save cost.
- The creative template renders the returned image full-bleed behind the product, with a soft light
  scrim so the dark overlay text stays legible. Without a key, it falls back to the designed gradient.

Nothing is generated for the product/price by AI, and **nothing is published**.

> Next-level option (later): background **removal/cutout** of the product so it sits cleanly on richer
> (darker) AI scenes — also doable via Gemini image editing; kept out of v1 for product-fidelity safety.

---

# Product cutout (Gemini) — hybrid compositing

The creative is composited in three layers:
1. **AI background** (Gemini, optional) — `/api/generate-bg`.
2. **Product cutout** (Gemini) — `/api/cutout`: the REAL product photo with its background
   removed, on transparency. Gemini is instructed to **not alter, recolor, or invent** any product
   detail — only remove the background.
3. **CSS text/pricing layer** — product name, old price, sale price, discount %, CTA, logo, URL.
   These are NEVER produced by AI, so they're always exact.

## Flow (manual, no publishing)
select product → image loads from the real DB/CDN image → "Gjenero Kreativ" → checks image exists →
**✂️ Pastro sfondin (AI)** creates the cutout → optional **✨ Sfond AI** background → preview composites
all three layers for Feed / Story / Reel → edit text → (approval/publish are later steps).

## Safeguards (as required)
- **Cutout cache:** server caches by product image URL in `data/cutout-cache/` → no repeated API cost.
- **Failure warning:** if the cutout call fails, a red status shows and a dialog asks before doing anything.
- **Opt-in original fallback:** on failure the original photo is used **only if you confirm** — never silently.
- **Before/After toggle:** "Pas (cutout)" vs "Para" (original) in the preview.
- **Disable setting:** "Përdor cutout AI" checkbox under ⚙ Imazhi (stored locally); when off, the cutout
  button is disabled and the original photo is used.

> Note on transparency: `gemini-2.5-flash-image` is asked for a transparent PNG cutout. If a given
> result comes back without alpha, the product still composites acceptably on the light background, and
> you can toggle back to the original. Requires `GEMINI_API_KEY`.

---

# Approval workflow

After the creative + copy are generated and edited, the user approves the **final post package**.

## What happens on Approve
`POST /api/approve` → the platform renders the final **Feed / Story / Reel** PNGs server-side with the
existing `creative-engine` (AI background + cutout + CSS text baked in), saves them to
`data/approved/<id>/`, and appends the record to **`data/approved-posts.json`**. Nothing is published.

## Approved record (`data/approved-posts.json`)
`id, status:"approved", product_id, product_name, product_url, product_image_url, current_price,
old_price, discount, category, selected_format, feed_image_path, story_image_path, reel_cover_path,
facebook_caption, instagram_caption, meta_description, headline, cta, ai_background_used,
ai_cutout_used, approved_by, approved_at`.

## History page ("Historiku")
- Lists every approved package with the rendered thumbnail, price/discount, product id, approver, time, status.
- **Rihap** opens the record (the 3 final creatives + all fields). You can edit the captions and
  **Ruaj ndryshimet** (updates the record's text, keeps the images), or **Kthe në draft** / **Ri-aprovo**
  (status toggle), or **Dry-run Meta**.
- The real **Publiko** button stays **disabled** everywhere.

## Dry-run Meta publisher
`POST /api/approved/:id/dryrun` returns the exact requests that WOULD be sent — **no network call**:
- Facebook Page photo: `POST graph.facebook.com/v21.0/{FB_PAGE_ID}/photos` (caption + image url).
- Instagram: `POST /{IG_USER_ID}/media` (container) then `POST /{IG_USER_ID}/media_publish`.
Tokens are read from env (`META_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`) and **masked**; image URLs need a
public base (`PUBLIC_BASE`) since the files are local. This is review-only — publishing is a later step.

## Endpoints
`POST /api/approve` · `GET /api/approved` · `GET /api/approved/:id` ·
`POST /api/approved/:id/status {status}` · `POST /api/approved/:id/dryrun`.

---

# Meta Publisher (PROTECTED, real)

Publishes an approved post to a Facebook Page (photo) and/or an Instagram Business account.
Built guarded; nothing publishes without explicit confirmation and valid credentials.

## Required `.env`
```
META_ACCESS_TOKEN=        # scopes: pages_manage_posts, pages_read_engagement, instagram_content_publish (+ instagram_basic)
FACEBOOK_PAGE_ID=
INSTAGRAM_BUSINESS_ID=
PUBLIC_BASE_URL=          # public https base where Meta can fetch /approved/<id>/..png
```
If any of the four is missing, `metaReady=false`, the **Publiko** button is **disabled**, and
`/api/publish/:id` returns 400.

## Preflight — the 4 checks (before publishing)
`GET /api/meta/preflight` → reports: **(1)** Facebook Page ID present, **(2)** the Page's linked
Instagram Business account (and whether it matches `INSTAGRAM_BUSINESS_ID`), **(3)** token permissions
(`pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`), **(4)** `PUBLIC_BASE_URL`
set + https. Token is masked. Use the **"Kontrollo Meta (preflight)"** button in the history detail.

## Publishing
- **Rules:** only `status=approved` (or `failed` → retry) can publish; **drafts are never published**;
  the user must **confirm** in a modal; platform selection = **Facebook only / Instagram only / both**.
- **Facebook:** `POST /{PAGE}/photos` with `url` (PUBLIC_BASE_URL + image path) + caption → saves `facebook_post_id`.
- **Instagram:** `POST /{IG}/media` (container) → `POST /{IG}/media_publish` → saves `instagram_media_id`.
- **Status flow:** `approved → publishing → published | failed`. On failure the error is stored on the
  record and a **↻ Riprovo** button appears. Every attempt is appended to **`data/publishing-history.json`**.
- **Dry-run** stays available (`/api/approved/:id/dryrun`) and never sends anything.

## Safety
- Tokens are read from env **only**, never sent to the browser, and **masked** in dry-run, preflight and logs.
- All Graph API responses are logged to `data/meta-api-log.json` with the token scrubbed (`***TOKEN***`).
- Image hosting: Meta fetches the creative from `PUBLIC_BASE_URL` — local paths aren't reachable, so deploy
  the platform (or the `data/approved` folder) behind a public https URL before going live.

## Endpoints
`GET /api/meta/preflight` · `POST /api/publish/:id {platforms}` · `GET /api/publishing-history`.
