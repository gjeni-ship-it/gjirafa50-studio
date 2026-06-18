# Deploy Gjirafa50 Studio (Product Studio + Social Scheduler) në Render

Rezultati: një link i përhershëm `https://<emri>.onrender.com` me të dy apps.

## Çfarë të duhet
- Llogari GitHub (falas) — për kodin.
- Llogari Render (render.com) — për hostimin.
- Plani **Starter** (~$7/muaj) që serveri të jetë GJITHMONË aktiv (scheduler-i të punojë). Falas fle dhe e ndal worker-in.

## Hapi 1 — Vendos kodin në GitHub
1. Hap github.com → New repository → emër `gjirafa50-studio` → Create.
2. Ngarko të gjithë përmbajtjen e kësaj dosjeje (Dockerfile, render.yaml, platform/, creative-engine/).
   - Mënyra e lehtë: te repo-ja e re → "Add file" → "Upload files" → tërhiq dosjet (ose përdor GitHub Desktop).

## Hapi 2 — Krijo shërbimin në Render
- Opsioni A (Blueprint, automatik): Render → New → "Blueprint" → zgjidh repo-n → Render lexon `render.yaml` dhe krijon shërbimin + diskun.
- Opsioni B (manual): Render → New → "Web Service" → zgjidh repo-n → Runtime: Docker → Plan: Starter → Add Disk: mountPath `/app/platform/data/social-scheduler`, 1GB.

## Hapi 3 — Variablat e mjedisit (Environment)
Vendos te Render → Environment:
- `PUBLIC_BASE_URL` = URL-ja e Render (psh `https://gjirafa50-studio.onrender.com`) — vendose pas deploy-it të parë, pastaj redeploy.
- `BASIC_AUTH_USER` dhe `BASIC_AUTH_PASS` = përdoruesi/fjalëkalimi për të hyrë në panel.
- `META_ACCESS_TOKEN`, `FACEBOOK_PAGE_ID`, `INSTAGRAM_BUSINESS_ID` = nga Meta (për publikim real).
- `GEMINI_API_KEY` = opsionale (AI).

## Hapi 4 — Deploy + provë
1. Render bën build (Docker) + deploy.
2. Hap `https://<emri>.onrender.com/health` → duhet `status: ok`.
3. Hap `https://<emri>.onrender.com/social-scheduler` (do kërkojë user/pass).
4. Vendos `PUBLIC_BASE_URL` te env (URL-ja jote) → Save → redeploy. Kjo e bën që fotot e ngarkuara të jenë publike për Meta.
5. Kontrollo Meta: te Social Scheduler → "Kontrollo Meta" (preflight).

## Shënime
- Disku persistent ruan postet e planifikuara + uploads. Pa disk, humbin në restart.
- Plani Starter mban serverin zgjuar → worker-i publikon në kohë. Free fle → mos e përdor për scheduler.
- Tokenat rrinë vetëm në server (Render env), s'ekspozohen.
