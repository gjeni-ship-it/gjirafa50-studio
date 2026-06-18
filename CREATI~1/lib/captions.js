/* Deterministic Albanian caption generator (Step 2, automated).
   Mirrors the hand-written copy style: short, sales-focused, urgency,
   no exaggerated claims, no clickbait. No LLM call — fully reproducible. */

function shortName(name) {
  const s = String(name || '').trim();
  const head = s.split(',')[0].trim();           // up to first comma keeps headlines tight
  return head.length >= 8 ? head : s;
}

function generate(product, brand) {
  const name = product.product_name || '';
  const short = shortName(name);
  const reg = product.regular_price;
  const sale = product.sale_price;
  const disc = product.discount_percentage;       // e.g. "-88%"
  const url = product.product_url || '';
  const isPoD = String(product.slot || '').toLowerCase().includes('day');

  const kicker = isPoD ? 'Oferta e Ditës' : 'Happy Hour';
  const emoji = isPoD ? '🔥' : '⚡';
  const cta = isPoD ? 'Bli tani' : 'Porosit tani';
  const urgency = isPoD
    ? 'Sasi e kufizuar, sa të zgjasin gjendjet'
    : 'Kohë e kufizuar, sa të zgjasin gjendjet';
  const hashtag = isPoD ? '#OfertaEDitës' : '#HappyHour';

  return {
    slot: product.slot,
    product_id: product.product_id || product.id,
    product_name: name,
    category: product.category,
    regular_price: reg,
    current_price: sale,
    discount_percentage: disc,
    you_save: product.you_save || undefined,
    product_url: url,

    headline: `${short} — tani ${sale}`,
    cta: cta,
    facebook_feed_caption:
      `${emoji} ${kicker} në Gjirafa50! ${name} — tani ${sale} në vend të ${reg} (${disc}). ${urgency}. ${cta}: ${url}`,
    instagram_caption:
      `${kicker} ${emoji}\n${short} — tani ${sale} (${disc}, ishte ${reg})\n${urgency}. Lidhja në bio.\n#Gjirafa50 ${hashtag}`,
    story_text:
      `${kicker.toUpperCase()}\n${short}\n${sale}  (${disc})\n${cta} →`,
    carousel_text: [
      short,
      product.category || '',
      `Tani ${sale} në vend të ${reg} (${disc})`,
      `${cta} — Gjirafa50`,
    ],
    ab_variation: {
      headline: `${kicker}: ${short} për ${sale}`,
      facebook_feed_caption:
        `${short} tani vetëm ${sale} (ishte ${reg}, ${disc}). ${urgency}. ${url}`,
    },
  };
}

module.exports = { generate, shortName };
