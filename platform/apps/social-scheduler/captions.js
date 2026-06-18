// Albanian caption generator for ready-made images. Template-based (deterministic),
// no fake claims; only uses what the user provides. (AI text can be layered later.)
function tagify(s) { return String(s || '').replace(/[^A-Za-z0-9ËëÇç]/g, '').slice(0, 18); }
function generate(input) {
  input = input || {};
  const name = (input.product_name || '').trim();
  const price = (input.price || '').trim();
  const disc = (input.discount || '').trim();
  const campaign = (input.campaign || '').trim();
  const link = (input.link || '').trim();
  const notes = (input.notes || '').trim();
  const head = name || campaign || 'Ofertë e re te Gjirafa50';
  const priceBit = price ? (disc ? ('Tani ' + price + ' (' + disc + ')') : ('Vetëm ' + price)) : '';
  const tags = ['#Gjirafa50', '#Kosova'];
  if (campaign) tags.unshift('#' + tagify(campaign));
  if (name) tags.unshift('#' + tagify(name));
  const hashtags = Array.from(new Set(tags.filter(t => t.length > 1))).slice(0, 6).join(' ');
  let fb = (disc ? '🔥 ' : '✨ ') + head;
  if (priceBit) fb += '\n' + priceBit;
  if (notes) fb += '\n' + notes;
  fb += '\n🚚 Porosit online, dërgesa kudo në Kosovë.';
  if (link) fb += '\n🛒 ' + link;
  fb += '\n\n' + hashtags;
  let ig = head;
  if (priceBit) ig += '\n' + priceBit;
  if (notes) ig += '\n' + notes;
  ig += '\n🛒 Lidhja në bio\n\n' + hashtags;
  const description = (head + (disc ? (' — ' + disc) : '') + (price ? (' ' + price) : '') + ' te Gjirafa50.').replace(/\s+/g, ' ').trim();
  return { facebook: fb, instagram: ig, hashtags, description, cta: 'Bli tani', source: 'template' };
}
module.exports = { generate };
