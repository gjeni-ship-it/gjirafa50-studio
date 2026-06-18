# Gjirafa50 creative design system (from real Drive references)

Sources: real Gjirafa50 / GjirafaMall social creatives in Google Drive (campaign folder
`1B2VYgt-…`, Dec 2025): `GJ50-1080.jpg` (feed), `GJIRAFA50-STORY.jpg` (story), plus MK/AL
and GjirafaMall variants, and the launch web-banners (iPhone Air, Watch, iPhone 17 Pro).
Copies saved in `brand/refs/`.

## Observed patterns (consistent across every reference)
- **Background:** full-bleed, cinematic **dark** photography (no white product card, no flat
  brand-colour fill). The image is the hero and bleeds to all edges. A subtle darkening keeps
  overlaid white text legible.
- **Colours:** white text on dark imagery; **red accent used sparingly** (≈ `#E4002B`) — only for
  the small top-left brandmark and the **strikethrough line on the old price**. No large colour blocks.
- **Typography:** heavy **condensed UPPERCASE** sans for headlines, in two tiers — a smaller lead
  line ("2 MUAJ ABONIM") above a giant impact word ("FALAS"). Eyebrow label (e.g. "STARLINK") is
  small, letter-spaced, uppercase. Supporting lines (installments) are small, sentence case.
- **Logo placement:** a small **red rounded rectangle brandmark top-left**; the **`gjirafa50.com`
  wordmark bottom-left** in white. Partner/"AUTHORIZED" logo top-right when relevant.
- **Discount treatment:** **no circular % badge.** Discount is shown as a **struck-through old
  price** (thin red line) directly above a **large white current price**, with a small
  installment line under it ("11.23€ x 24 Muaj").
- **Price layout:** bottom-left stack → old price (struck) · big current price · small note.
- **CTA / urgency:** bottom-right, right-aligned: small lead line + bold value
  ("Oferta vlen deri më / **5 JANAR**"). These brand banners use validity rather than a button.
- **Product image placement:** fills the frame (lifestyle). Text sits over the upper-left and the
  lower band.
- **Feed vs Story:** identical system; Feed (1080²) puts the headline mid-upper-left and the
  price/validity along the bottom. Story/Reel (1080×1920) push the headline into the upper third
  and the price + wordmark + validity into the lower third (Reel keeps the bottom clear for UI).

## How the template adapts this for catalog products
Catalog product photos are shot **on white**, not as cinematic scenes — so a literal full-bleed
white photo with white text won't work. The updated template keeps the brand's *chrome* and
*typography* exactly, and solves the white-background problem with a **soft radial spotlight**
behind the product so an isolated product sits naturally on the dark background:
- dark cinematic gradient background + soft light glow behind the product (hero, upper area);
- red rounded **brandmark top-left** + small **category eyebrow**;
- **condensed uppercase product name** as the headline;
- **struck old price (red line) + big white current price** bottom-left, with a small **`-XX%`**
  red tag (kept compact and rectangular, not a big circle) for commerce clarity;
- **`gjirafa50.com` wordmark bottom-left**, **CTA/urgency bottom-right**.

Brand font: the references use a heavy condensed grotesque. The template uses a condensed system
stack (Oswald → Arial Narrow → Impact); drop the real brand font into `brand/fonts/` and reference
it for a 1:1 match.

---

## Update — full library review (two style families)

After reviewing the wider Drive library ("Social Media - 1080shat", "TOP PRODUKTE - LANDING & SOCIAL",
campaign folders), Gjirafa50 uses **two** creative families:

1. **Premium campaign / launch** (e.g. Starlink, iPhone, Apple Watch): full-bleed **dark cinematic**
   photography, giant condensed uppercase headline, white text, struck price bottom-left, validity bottom-right.
2. **Product deal posts** (e.g. `TOP PRODUKTE/.../BLEJ-1080.jpg`, `BLEJ-story.jpg`): **LIGHT** off-white
   background, product centred/right, **bold dark product name** + subtitle (e.g. "100 ml"), **struck old
   price (red diagonal strike) + big black sale price**, solid rectangular **"BLEJ TANI"** button, large
   **"XX% ZBRITJE"** text, `gjirafa50.com` wordmark top-right (red "50"), small campaign label top-left.

**Decision:** our generator produces **product deal posts** from catalog photos (shot on white), so the
template now matches **family 2 (light deal)** — the closest, most authentic match, and it handles
product-on-white photos perfectly (no glow trick needed). The dark cinematic family is kept documented for
future premium-launch templates and can be added as a selectable "theme".

Reference copies saved in `brand/refs/`: `gj50_feed.jpg`, `gj50_story.jpg` (dark campaign),
`post_deal_feed.jpg` (light deal — the model for the current template), `post_buds3.jpg` (vendor co-brand).

---

## Update — orchestration: AI scenes + AI copy (toward the premium references)

To reach the reference quality (Kodak/Samsung/Lenovo/Gigabyte/Sense7 posts) the platform connects
two AIs, combined by the HTML/CSS layer:

- **Gemini = the photo.** `gemini.js` now generates a **theme-aware premium SCENE** (not a flat bg):
  `studio` (light), `tech_dark` (cinematic navy/black), `gaming_neon` (magenta/purple), `warm_room`
  (lifestyle interior), `fashion` (pastel studio). The platform picks a theme by product category.
  Product fidelity: the real product is composited via the cutout (Gemini may relight/scene it, never
  invent it).
- **LLM = the text.** `platform/aicopy.js` writes **organic Albanian** copy (headline, CTA, FB, IG, meta)
  with Gemini text (`gemini-2.5-flash`), brand-voice rules, prices taken from data — with a deterministic
  template fallback when no key. Button: **✨ AI tekst**.
- **CSS = the chrome.** Big BRAND + MODEL typography, struck old price + sale price, CTA, wordmark, logo —
  always exact, never AI.

Both AI steps require `GEMINI_API_KEY`. With the key set, the **Sfond AI** (scene) + **✨ AI tekst** +
real product cutout combine into creatives in the spirit of the references. Remaining iteration: tune the
big BRAND/MODEL typographic layout per theme to match a chosen reference 1:1.
