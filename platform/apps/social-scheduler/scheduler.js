// Social Scheduler — scheduled posts store + status workflow. Nothing published here.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DATA = path.join(__dirname, '..', '..', 'data', 'social-scheduler');
const STORE = path.join(DATA, 'scheduled-posts.json');
const HIST = path.join(DATA, 'publishing-history.json');
const STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'];
function ensure() { fs.mkdirSync(DATA, { recursive: true }); }
function readAll() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { return []; } }
function writeAll(a) { ensure(); fs.writeFileSync(STORE, JSON.stringify(a, null, 2)); }
function newId() { return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex'); }
function list() { return readAll(); }
function get(id) { return readAll().find(p => p.id === id); }
function create(p) {
  const all = readAll();
  const rec = {
    id: newId(), status: STATUSES.includes(p.status) ? p.status : 'draft',
    image_path: p.image_path || '', image_filename: p.image_filename || '',
    platforms: ['facebook', 'instagram', 'both'].includes(p.platforms) ? p.platforms : 'both',
    facebook_caption: p.facebook_caption || '', instagram_caption: p.instagram_caption || '',
    hashtags: p.hashtags || '', meta_description: p.meta_description || '', cta: p.cta || '',
    meta: { product_name: p.product_name || '', price: p.price || '', discount: p.discount || '', campaign: p.campaign || '', link: p.link || '', notes: p.notes || '' },
    scheduled_at: p.scheduled_at || null, created_at: new Date().toISOString(),
  };
  all.unshift(rec); writeAll(all); return rec;
}
function update(id, patch) {
  const all = readAll(); const r = all.find(x => x.id === id); if (!r) throw new Error('Post nuk u gjet');
  ['facebook_caption', 'instagram_caption', 'hashtags', 'meta_description', 'cta', 'platforms', 'scheduled_at', 'image_path', 'image_filename', 'status'].forEach(k => { if (patch[k] !== undefined) r[k] = patch[k]; });
  if (patch.meta) r.meta = Object.assign(r.meta || {}, patch.meta);
  r.updated_at = new Date().toISOString(); writeAll(all); return r;
}
function setStatus(id, status, extra) {
  const all = readAll(); const r = all.find(x => x.id === id); if (!r) throw new Error('Post nuk u gjet');
  r.status = status; if (extra) Object.assign(r, extra); r.updated_at = new Date().toISOString(); writeAll(all); return r;
}
function schedule(id, scheduled_at) {
  const r = get(id); if (!r) throw new Error('Post nuk u gjet');
  if (!r.image_path) throw new Error('Mungon imazhi');
  const when = new Date(scheduled_at).getTime();
  if (isNaN(when)) throw new Error('Datë/orë e pavlefshme');
  return update(id, { scheduled_at: new Date(when).toISOString(), status: 'scheduled' });
}
function cancel(id) {
  const r = get(id); if (!r) throw new Error('Post nuk u gjet');
  if (['publishing', 'published'].includes(r.status)) throw new Error("S'anulohet dot (" + r.status + ')');
  return setStatus(id, 'cancelled');
}
function retry(id) {
  const r = get(id); if (!r) throw new Error('Post nuk u gjet');
  if (r.status !== 'failed') throw new Error('Vetëm postet e dështuara riprovohen');
  return setStatus(id, 'scheduled', { error_message: null });
}
function due(now) { now = now || Date.now(); return readAll().filter(p => p.status === 'scheduled' && p.scheduled_at && new Date(p.scheduled_at).getTime() <= now); }
function history() { try { return JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch (e) { return []; } }
function logHistory(entry) { ensure(); const a = history(); a.unshift(Object.assign({ at: new Date().toISOString() }, entry)); fs.writeFileSync(HIST, JSON.stringify(a, null, 2)); }
module.exports = { STATUSES, list, get, create, update, setStatus, schedule, cancel, retry, due, history, logHistory, DATA };
