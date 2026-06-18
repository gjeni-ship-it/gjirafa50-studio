// Scheduler worker: every 60s publishes posts whose time has arrived, via the existing Meta publisher.
const meta = require('../../shared/meta');
const config = require('../../shared/config');
const sched = require('./scheduler');
let timer = null, running = false;
async function publishOne(post) {
  if (!config.PUBLIC_BASE_URL) throw new Error('PUBLIC_BASE_URL mungon');
  if (!meta.ready()) throw new Error('Kredencialet e Meta mungojnë');
  if (!post.image_path) throw new Error('Mungon imazhi');
  const out = {}; const plats = post.platforms || 'both';
  if (plats === 'facebook' || plats === 'both') { const r = await meta.publishFacebook(post.image_path, post.facebook_caption); out.facebook_post_id = r.id; }
  if (plats === 'instagram' || plats === 'both') { const r = await meta.publishInstagram(post.image_path, post.instagram_caption); out.instagram_media_id = r.media_id; }
  return out;
}
async function tick() {
  if (running) return; running = true;
  try {
    for (const p of sched.due(Date.now())) {
      sched.setStatus(p.id, 'publishing');
      try {
        const ids = await publishOne(sched.get(p.id));
        sched.setStatus(p.id, 'published', Object.assign({ published_at: new Date().toISOString(), error_message: null }, ids));
        sched.logHistory({ post_id: p.id, status: 'published', ids });
      } catch (e) {
        sched.setStatus(p.id, 'failed', { error_message: String(e.message || e) });
        sched.logHistory({ post_id: p.id, status: 'failed', error: String(e.message || e) });
      }
    }
  } catch (e) { /* never crash the loop */ } finally { running = false; }
}
function start() { if (timer) return; tick(); timer = setInterval(tick, 60000); console.log('Social Scheduler worker: kontrollon çdo 60s'); }
module.exports = { start, tick, publishOne };
