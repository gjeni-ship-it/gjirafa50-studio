/* Publisher — guarded bridge between approved records and meta.js.
   Rules enforced here: only status=approved may publish; never drafts; every attempt
   is appended to data/publishing-history.json; status transitions approved → publishing
   → published | failed; errors stored on the record. Tokens never touched here. */
const path = require('path');
const approvals = require('./approvals');
const meta = require('./meta');

const PUB_HISTORY = path.join(__dirname, 'data', 'publishing-history.json');

function platformsList(sel) {
  return { facebook: sel === 'facebook' || sel === 'both', instagram: sel === 'instagram' || sel === 'both' };
}

async function publish(id, sel) {
  const rec = approvals.get(id);
  if (!rec) throw new Error('Record not found');
  if (rec.status !== 'approved' && rec.status !== 'failed')
    throw new Error('Only an APPROVED post can be published (current status: ' + rec.status + ')');
  if (!meta.ready()) throw new Error('Meta credentials missing — publishing is disabled');

  const want = platformsList(sel);
  if (!want.facebook && !want.instagram) throw new Error('Choose at least one platform');

  approvals.updateRecord(id, { status: 'publishing', error_message: '' });

  const attempt = {
    attempt_id: Date.now() + '-' + Math.random().toString(16).slice(2, 8),
    record_id: id, product_id: rec.product_id, product_name: rec.product_name,
    platforms: sel, started_at: new Date().toISOString(),
    by: process.env.APPROVER || 'gjeni@gjirafa.com', results: {},
  };

  let allOk = true;
  if (want.facebook) {
    try { const r = await meta.publishFacebook(rec.feed_image_path, rec.facebook_caption); attempt.results.facebook = { ok: true, id: r.id }; }
    catch (e) { allOk = false; attempt.results.facebook = { ok: false, error: e.message }; }
  }
  if (want.instagram) {
    try { const r = await meta.publishInstagram(rec.feed_image_path, rec.instagram_caption); attempt.results.instagram = { ok: true, media_id: r.media_id }; }
    catch (e) { allOk = false; attempt.results.instagram = { ok: false, error: e.message }; }
  }

  attempt.finished_at = new Date().toISOString();
  attempt.status = allOk ? 'published' : 'failed';
  meta.appendJson(PUB_HISTORY, attempt);

  const patch = {
    status: allOk ? 'published' : 'failed',
    last_attempt_id: attempt.attempt_id,
    error_message: allOk ? '' : Object.entries(attempt.results).filter(([, v]) => !v.ok).map(([k, v]) => k + ': ' + v.error).join(' | '),
  };
  if (allOk) patch.published_at = new Date().toISOString();
  if (attempt.results.facebook && attempt.results.facebook.ok) patch.facebook_post_id = attempt.results.facebook.id;
  if (attempt.results.instagram && attempt.results.instagram.ok) patch.instagram_media_id = attempt.results.instagram.media_id;
  approvals.updateRecord(id, patch);

  return { attempt, record: approvals.get(id) };
}

function history() {
  try { return JSON.parse(require('fs').readFileSync(PUB_HISTORY, 'utf8')); } catch (e) { return []; }
}

module.exports = { publish, history };
