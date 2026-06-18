#!/usr/bin/env python3
"""
Gjirafa50 KS — Daily Product Selection Engine (Step 1 of the social-post automation).

WHAT THIS DOES
  Given a pool of candidate products (already filtered + priced by the SQL in
  `candidate_query.sql`, run via the Gjirafa50 MCP database tool), this engine:
    1. Computes an effective price + discount % (TierPrice markdown, plus any
       sane public campaign discount).
    2. Scores every candidate with the weighted formula (see WEIGHTS).
    3. Allocates daily slots: 1 Product of the Day, 4 Happy Hour, 3 backups.
    4. Enforces category balance (no slot list dominated by one category).
    5. Avoids repeating a product picked in the last N days (local history file).
    6. Emits the result as JSON + CSV + a Markdown table.

  It does NOT generate images, write captions, or publish anything (those are later steps).

INPUT
  A JSON file (default: cand_today.json) = a list of candidate dicts with keys:
    product_id, product_name, shelf_price, old_price, stock,
    disc_pct_campaign, disc_amt_campaign, category, picture_guid, mime, slug,
    previous_sales (optional; units sold in the lookback window),
    previous_clicks (optional; NOT available in this DB — left None)

USAGE
  python3 select_products.py --candidates cand_today.json --outdir .

NOTE ON DATA AVAILABILITY (Gjirafa50)
  * Margin is NOT available in the Gjirafa50 DB (ProductCost = 0, no ProfitMargin
    column). The margin factor is therefore dropped and its weight is
    redistributed proportionally across the remaining factors. If cost/margin
    data becomes available later, set HAS_MARGIN = True and provide margin_score.
  * previous_clicks is NOT tracked anywhere in the DB, so the performance score
    uses sales velocity only.
"""

import argparse, csv, json, math, os, html, datetime as dt

# ----------------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------------
STORE = {
    "id": 2,
    "name": "Gjirafa50 KS",
    "url": "https://gjirafa50.com/",   # product_url = url + slug
    "currency": "EUR",
}

# Image URL template. nopCommerce here stores a PictureGuid + MimeType and serves
# absolute image paths. CONFIRM this base/pattern against a live product page and
# adjust if needed (e.g. a CDN host or a size suffix like _550).
IMAGE_URL_TEMPLATE = "https://gjirafa50.com/images/thumbs/{guid}.{ext}"

SLOTS = {"product_of_day": 1, "happy_hour": 4, "backup": 3}

# Base weights exactly as specified in the brief.
WEIGHTS = {
    "discount": 0.30,
    "margin": 0.25,      # auto-dropped + redistributed when HAS_MARGIN is False
    "stock": 0.20,
    "category": 0.15,
    "performance": 0.10,
}
HAS_MARGIN = False       # Gjirafa50 has no cost/margin data

# Selection knobs
NO_REPEAT_DAYS   = 7     # rule 6
MAX_PER_CATEGORY = 3     # rule 7 — cap across the 8 selected products
STOCK_ENOUGH     = 30    # rule 5 — stock at/above this is "enough" (score caps at 1)
CAMPAIGN_SANE_FRACTION = 0.9   # ignore a campaign discount >= 90% of shelf (data error / wrong currency)
SALES_LOOKBACK_DAYS = 90

# Optional manual category priority (rule used by category_priority factor).
# Anything not listed defaults to 0.5 (neutral). Range 0..1.
CATEGORY_PRIORITY = {
    # "Celular, Tablet & Navigim": 0.9,
    # "Kompjuter, Laptop & Monitor": 0.8,
}
DEFAULT_CATEGORY_PRIORITY = 0.5

HISTORY_FILE = "selection_history.json"


# ----------------------------------------------------------------------------
# PRICING
# ----------------------------------------------------------------------------
def effective_pricing(c):
    """Return (regular_price, discount_price, discount_percentage) for a candidate."""
    shelf = float(c["shelf_price"])
    old   = float(c.get("old_price") or 0)
    regular = old if old > shelf else shelf

    # Best public campaign discount value, in currency.
    pct = float(c.get("disc_pct_campaign") or 0)
    amt = float(c.get("disc_amt_campaign") or 0)
    campaign_val = max(shelf * pct / 100.0, amt)
    # Sanity: ignore nonsensical/cross-currency campaign amounts.
    if campaign_val <= 0 or campaign_val >= shelf * CAMPAIGN_SANE_FRACTION:
        campaign_val = 0.0

    discount_price = round(max(shelf - campaign_val, 0.0), 2)
    if regular <= 0:
        disc_pct = 0.0
    else:
        disc_pct = round((regular - discount_price) / regular * 100.0, 1)
    return round(regular, 2), discount_price, disc_pct


# ----------------------------------------------------------------------------
# SCORING
# ----------------------------------------------------------------------------
def _minmax(vals):
    lo, hi = min(vals), max(vals)
    rng = hi - lo
    return lo, (rng if rng > 1e-9 else None)


def active_weights():
    w = dict(WEIGHTS)
    if not HAS_MARGIN:
        dropped = w.pop("margin")
        total = sum(w.values())
        for k in w:
            w[k] += dropped * (w[k] / total)   # redistribute proportionally
    return w


def score_pool(cands):
    """Attach regular/discount/disc_pct and a 0..1 score to every candidate."""
    for c in cands:
        c["regular_price"], c["discount_price"], c["discount_percentage"] = effective_pricing(c)
        c["previous_sales"] = int(c.get("previous_sales") or 0)
        c["previous_clicks"] = c.get("previous_clicks")  # None — not tracked

    disc_lo, disc_rng = _minmax([c["discount_percentage"] for c in cands])
    max_log_sales = max([math.log1p(c["previous_sales"]) for c in cands] + [0.0])

    w = active_weights()
    for c in cands:
        discount_score = ((c["discount_percentage"] - disc_lo) / disc_rng) if disc_rng else (c["discount_percentage"] / 100.0)
        stock_score = min(c["stock"] / float(STOCK_ENOUGH), 1.0)
        cat_priority = CATEGORY_PRIORITY.get(c["category"], DEFAULT_CATEGORY_PRIORITY)
        perf_score = (math.log1p(c["previous_sales"]) / max_log_sales) if max_log_sales > 0 else 0.0

        c["_scores"] = {
            "discount": round(discount_score, 4),
            "stock": round(stock_score, 4),
            "category": round(cat_priority, 4),
            "performance": round(perf_score, 4),
        }
        c["score"] = round(
            w["discount"] * discount_score
            + w["stock"] * stock_score
            + w["category"] * cat_priority
            + w["performance"] * perf_score,
            4,
        )
    return cands, w


# ----------------------------------------------------------------------------
# HISTORY (rule 6: no repeats within NO_REPEAT_DAYS)
# ----------------------------------------------------------------------------
def load_recent_ids(path, today):
    if not os.path.exists(path):
        return set(), []
    data = json.load(open(path, encoding="utf-8"))
    cutoff = today - dt.timedelta(days=NO_REPEAT_DAYS)
    recent = set()
    for entry in data:
        d = dt.date.fromisoformat(entry["date"])
        if d > cutoff:
            recent.update(entry.get("featured_ids", []))
    return recent, data


def save_history(path, history, today, featured_ids, backup_ids):
    history = [h for h in history if h.get("date") != today.isoformat()]
    history.append({
        "date": today.isoformat(),
        "store": STORE["name"],
        "featured_ids": featured_ids,   # Product of Day + Happy Hour (count as "posted")
        "backup_ids": backup_ids,
    })
    json.dump(history, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


# ----------------------------------------------------------------------------
# SLOT ALLOCATION (rules 6, 7, 8)
# ----------------------------------------------------------------------------
def allocate(cands, recent_ids):
    ranked = sorted(cands, key=lambda c: c["score"], reverse=True)
    total_needed = SLOTS["product_of_day"] + SLOTS["happy_hour"] + SLOTS["backup"]

    chosen, cat_count = [], {}

    def take(pool, cap_check=True):
        for c in pool:
            if c in chosen:
                continue
            if c["product_id"] in recent_ids:
                continue
            if cap_check and cat_count.get(c["category"], 0) >= MAX_PER_CATEGORY:
                continue
            chosen.append(c)
            cat_count[c["category"]] = cat_count.get(c["category"], 0) + 1
            return c
        return None

    # Pass 1: respect the category cap.
    while len(chosen) < total_needed:
        if take(ranked, cap_check=True) is None:
            break
    # Pass 2: relax the cap only if we still can't fill all slots.
    while len(chosen) < total_needed:
        if take(ranked, cap_check=False) is None:
            break

    pod = chosen[:SLOTS["product_of_day"]]
    hh  = chosen[SLOTS["product_of_day"]:SLOTS["product_of_day"] + SLOTS["happy_hour"]]
    bk  = chosen[SLOTS["product_of_day"] + SLOTS["happy_hour"]:total_needed]
    return pod, hh, bk


# ----------------------------------------------------------------------------
# OUTPUT
# ----------------------------------------------------------------------------
def ext_from_mime(mime):
    return {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp"}.get(
        (mime or "").lower(), "jpg")


def reason(c):
    bits = [f"{c['discount_percentage']:.0f}% off"]
    bits.append(f"stock {c['stock']:,}" + (" (ample)" if c["stock"] >= STOCK_ENOUGH else ""))
    bits.append(f"cat: {c['category']}")
    if c["previous_sales"]:
        bits.append(f"{c['previous_sales']} sold/{SALES_LOOKBACK_DAYS}d")
    bits.append(f"score {c['score']:.3f}")
    return " • ".join(bits)


def to_row(slot, c):
    return {
        "slot": slot,
        "product_id": c["product_id"],
        "product_name": html.unescape(c["product_name"] or ""),
        "category": c["category"],
        "regular_price": f'{c["regular_price"]:.2f} {STORE["currency"]}',
        "discount_price": f'{c["discount_price"]:.2f} {STORE["currency"]}',
        "discount_percentage": f'{c["discount_percentage"]:.1f}%',
        "stock": c["stock"],
        "score": f'{c["score"]:.3f}',
        "reason_selected": reason(c),
        "product_url": STORE["url"].rstrip("/") + "/" + (c.get("slug") or ""),
        "image_url": IMAGE_URL_TEMPLATE.format(guid=c.get("picture_guid"), ext=ext_from_mime(c.get("mime"))),
    }


COLS = ["slot", "product_id", "product_name", "category", "regular_price",
        "discount_price", "discount_percentage", "stock", "score",
        "reason_selected", "product_url", "image_url"]


def build_rows(pod, hh, bk):
    rows = []
    for c in pod:
        rows.append(to_row("Product of the Day", c))
    for i, c in enumerate(hh, 1):
        rows.append(to_row(f"Happy Hour {i}", c))
    for i, c in enumerate(bk, 1):
        rows.append(to_row(f"Backup {i}", c))
    return rows


def write_outputs(rows, outdir, weights):
    os.makedirs(outdir, exist_ok=True)
    json.dump(rows, open(os.path.join(outdir, "selection_today.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    with open(os.path.join(outdir, "selection_today.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=COLS)
        wr.writeheader()
        wr.writerows(rows)
    # Markdown
    md = [f"# Daily product selection — {STORE['name']} — {dt.date.today().isoformat()}", ""]
    md.append("Weights used (margin dropped — no cost data): " +
              ", ".join(f"{k} {v:.3f}" for k, v in weights.items()))
    md.append("")
    md.append("| " + " | ".join(COLS) + " |")
    md.append("|" + "|".join(["---"] * len(COLS)) + "|")
    for r in rows:
        md.append("| " + " | ".join(str(r[c]).replace("|", "\\|") for c in COLS) + " |")
    open(os.path.join(outdir, "selection_today.md"), "w", encoding="utf-8").write("\n".join(md))


# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", default="cand_today.json")
    ap.add_argument("--outdir", default=".")
    ap.add_argument("--history", default=HISTORY_FILE)
    args = ap.parse_args()

    cands = json.load(open(args.candidates, encoding="utf-8"))
    today = dt.date.today()

    cands, weights = score_pool(cands)
    recent_ids, history = load_recent_ids(args.history, today)
    pod, hh, bk = allocate(cands, recent_ids)

    rows = build_rows(pod, hh, bk)
    write_outputs(rows, args.outdir, weights)

    featured_ids = [c["product_id"] for c in pod + hh]
    backup_ids = [c["product_id"] for c in bk]
    save_history(args.history, history, today, featured_ids, backup_ids)

    print(f"Candidates scored: {len(cands)}")
    print(f"Excluded as seen in last {NO_REPEAT_DAYS} days: {len(recent_ids)}")
    print(f"Selected: {len(pod)} Product of Day, {len(hh)} Happy Hour, {len(bk)} backup")
    print("Active weights:", {k: round(v, 3) for k, v in weights.items()})
    for r in rows:
        print(f"  [{r['slot']:>18}] {r['discount_percentage']:>6} {r['score']:>6}  "
              f"{str(r['product_name'])[:46]:46}  {r['category']}")


if __name__ == "__main__":
    main()
