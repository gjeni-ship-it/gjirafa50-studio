# Gjirafa50 Social Platform — Production Deployment

Goal: serve the app over **https** so Meta can fetch the approved creatives from a public
`PUBLIC_BASE_URL`, while keeping tokens and DB credentials server-side only.

## What must be true in production
- `PUBLIC_BASE_URL` is **https** and resolves from the public internet (Meta fetches images from it).
- Approved images are reachable at **`{PUBLIC_BASE_URL}/approved/<id>/<file>.png`** (public, no auth).
- `/health` returns `{status:"ok"}` (public).
- The UI + all `/api/*` are behind **Basic Auth** (`BASIC_AUTH_USER` / `BASIC_AUTH_PASS`).
- All secrets (`META_ACCESS_TOKEN`, `DB_CONN`, `GEMINI_API_KEY`) live in env only — never in the frontend.

## Prerequisites
- Node 18+ and **Chromium** (the approval step renders the PNGs with Playwright). Use the provided
  `Dockerfile` (Playwright base image) or run `npx playwright install --with-deps chromium` on the host.
- Build context contains both `platform/` and `creative-engine/` (the platform shells out to the engine).

## Persistent storage (important)
Approved records + images live under `platform/data/` (`approved-posts.json`, `approved/<id>/*.png`,
`publishing-history.json`). On hosts with **ephemeral disks** (Render/Railway default) these are lost on
redeploy/restart **and Meta could 404 the image**. Attach a **persistent volume/disk mounted at
`platform/data`**, or move image hosting to object storage (S3/R2/GCS) and set `PUBLIC_BASE_URL` to that
bucket's CDN. For a first production run, a small persistent disk is simplest.

## Health & verification
```bash
curl https://studio.yourdomain.com/health
npm run verify          # checks PUBLIC_BASE_URL + latest approved image is https + 200 + image/*
# or: node scripts/verify-public-image.js https://studio.yourdomain.com/approved/<id>/<id>_feed.png
```
Then in the app: open a record in **Historiku → Kontrollo Meta (preflight)** until all 4 checks are green.

---

## A) Render
1. Push the repo (with `platform/` + `creative-engine/`) to GitHub.
2. New **Web Service** → "Use a Dockerfile" → Dockerfile path `platform/Dockerfile`, context = repo root.
3. Add a **Disk**: mount path `/app/platform/data`, 1 GB (persists approved images).
4. **Environment**: paste the vars from `.env.production.example` (real values). Set `PORT=3000`.
5. Health check path: `/health`. Deploy.
6. `PUBLIC_BASE_URL` = your `https://<service>.onrender.com` (or custom domain). Run `npm run verify`.

## B) Railway
1. New project → Deploy from GitHub repo.
2. Set the **Dockerfile** path to `platform/Dockerfile` (root context). Railway gives an https domain.
3. Add a **Volume** mounted at `/app/platform/data`.
4. Add the env vars (Variables tab). Set `PUBLIC_BASE_URL` to the Railway https domain.
5. Healthcheck: `/health`. Deploy → `npm run verify`.

## C) VPS / Ubuntu (full control)
```bash
# 1. deps
sudo apt update && sudo apt install -y nodejs npm nginx
sudo npm i -g pm2
# 2. app
git clone <repo> /opt/gjirafa-studio && cd /opt/gjirafa-studio
cd creative-engine && npm install && npx playwright install --with-deps chromium && cd ..
cd platform && npm install
cp .env.production.example .env   # fill real values; PUBLIC_BASE_URL=https://studio.yourdomain.com
pm2 start server.js --name gjirafa-studio && pm2 save && pm2 startup
```
Nginx reverse proxy + HTTPS (Let's Encrypt):
```nginx
server {
  server_name studio.yourdomain.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
  client_max_body_size 30m;   # data-URI uploads (bg/cutout) on /api/approve
}
```
```bash
sudo certbot --nginx -d studio.yourdomain.com   # issues + auto-renews TLS → https ready
```
`data/` persists on the server's disk automatically. Back it up.

## D) Cloudflare Tunnel (quick testing, real https, no server)
Expose your **local** `node server.js` over a public https URL so Meta can fetch images during testing:
```bash
# terminal 1
cd platform && npm start
# terminal 2
cloudflared tunnel --url http://localhost:3000
# -> prints https://<random>.trycloudflare.com
# set PUBLIC_BASE_URL to that URL (restart the server), then: npm run verify
```
Great for verifying real Meta publishing before committing to a host. The URL is temporary.

---

# Security checklist (review before going live)
- [ ] **HTTPS only** — `PUBLIC_BASE_URL` is https; the app is served via TLS (host TLS / nginx+certbot / Cloudflare).
- [ ] **Basic Auth on** — `BASIC_AUTH_USER` + a long random `BASIC_AUTH_PASS` set (UI + API gated; verify `/` returns 401 without creds).
- [ ] **No tokens in the frontend** — confirmed: tokens are env-only, never in `/api/config`; masked in dry-run/preflight; scrubbed in `data/meta-api-log.json`.
- [ ] **DB credentials only in `.env`** — use a **read-only** SQL user; `.env` is git-ignored (see `.gitignore`).
- [ ] **`.env` never committed** — verify it is not in git history; rotate any secret that was ever committed.
- [ ] **Least-privilege Meta token** — only `pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish` (+ `instagram_basic`); use a long-lived Page token; rotate periodically.
- [ ] **Publishing is gated** — only `status=approved` publishes; drafts never; confirmation modal required.
- [ ] **Persistent `data/`** — approved images survive restarts (volume/disk or object storage) so Meta URLs don't 404.
- [ ] **Image route hardened** — `/approved/:id/:filename` validates id/filename and blocks path traversal (tested).
- [ ] **Limits & logs** — body limit set (30 MB); API responses logged with tokens scrubbed. Consider adding a rate limiter and an IP allowlist on `/api/publish`.
- [ ] **Backups** — back up `data/approved-posts.json` + `data/approved/` + `data/publishing-history.json`.

> Upgrade path: Basic Auth is the minimum login gate. For multiple users, replace it with real
> accounts/SSO (e.g. Google Workspace) and per-user publish permissions; the `approved_by` field already
> records who approved each post.
