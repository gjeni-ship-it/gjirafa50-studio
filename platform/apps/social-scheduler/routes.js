// Social Scheduler routes (mounted AFTER Basic Auth in server.js — dashboard + API are protected).
const express = require('express');
const path = require('path');
const storage = require('../../shared/storage');
const meta = require('../../shared/meta');
const config = require('../../shared/config');
const sched = require('./scheduler');
const captions = require('./captions');
const router = express.Router();
const PUB = path.join(__dirname, 'public');

router.get('/social-scheduler', (req, res) => res.sendFile(path.join(PUB, 'index.html')));
router.get('/social-scheduler/app.js', (req, res) => res.sendFile(path.join(PUB, 'app.js')));

router.get('/api/scheduler/config', (req, res) => res.json({
  metaReady: meta.ready(),
  publicBaseHttps: /^https:\/\//.test(config.PUBLIC_BASE_URL || ''),
  publicBaseSet: !!config.PUBLIC_BASE_URL,
  statuses: sched.STATUSES,
}));
router.post('/api/scheduler/upload', (req, res) => {
  try { const { dataUrl, filename } = req.body || {}; res.json(storage.saveUploadDataUrl(dataUrl, filename)); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
router.post('/api/scheduler/captions', (req, res) => {
  try { res.json({ copy: captions.generate(req.body || {}) }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
router.get('/api/scheduler/posts', (req, res) => res.json({ posts: sched.list() }));
router.get('/api/scheduler/posts/:id', (req, res) => { const r = sched.get(req.params.id); if (!r) return res.status(404).json({ error: 'not found' }); res.json({ post: r }); });
router.post('/api/scheduler/posts', (req, res) => { try { res.json({ post: sched.create(req.body || {}) }); } catch (e) { res.status(400).json({ error: String(e.message || e) }); } });
router.post('/api/scheduler/posts/:id', (req, res) => { try { res.json({ post: sched.update(req.params.id, req.body || {}) }); } catch (e) { res.status(400).json({ error: String(e.message || e) }); } });
router.post('/api/scheduler/posts/:id/schedule', (req, res) => { try { res.json({ post: sched.schedule(req.params.id, (req.body || {}).scheduled_at) }); } catch (e) { res.status(400).json({ error: String(e.message || e) }); } });
router.post('/api/scheduler/posts/:id/cancel', (req, res) => { try { res.json({ post: sched.cancel(req.params.id) }); } catch (e) { res.status(400).json({ error: String(e.message || e) }); } });
router.post('/api/scheduler/posts/:id/retry', (req, res) => { try { res.json({ post: sched.retry(req.params.id) }); } catch (e) { res.status(400).json({ error: String(e.message || e) }); } });
router.post('/api/scheduler/posts/:id/dryrun', (req, res) => {
  const r = sched.get(req.params.id); if (!r) return res.status(404).json({ error: 'not found' });
  const base = config.PUBLIC_BASE_URL || '<PUBLIC_BASE_URL>'; const url = base + r.image_path;
  res.json({
    note: 'DRY-RUN — asgjë nuk u dërgua te Meta. Kjo është vetëm çfarë DO dërgohej.',
    platforms: r.platforms, scheduled_at: r.scheduled_at, image_url: url,
    facebook: (r.platforms !== 'instagram') ? { method: 'POST', endpoint: '/{PAGE}/photos', body: { url, caption: r.facebook_caption, published: true } } : null,
    instagram: (r.platforms !== 'facebook') ? [
      { step: 1, method: 'POST', endpoint: '/{IG}/media', body: { image_url: url, caption: r.instagram_caption } },
      { step: 2, method: 'POST', endpoint: '/{IG}/media_publish', body: { creation_id: '<FROM_STEP_1>' } },
    ] : null,
  });
});
router.get('/api/scheduler/history', (req, res) => res.json({ history: sched.history() }));
router.get('/api/scheduler/preflight', async (req, res) => { try { res.json(await meta.preflight()); } catch (e) { res.status(500).json({ error: String(e.message || e) }); } });
module.exports = router;
