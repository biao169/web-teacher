# Cloudflare deployment checklist

## Prerequisites

- Install Node.js LTS and npm.
- Install Wrangler through project dependencies with `npm install`.
- Login to Cloudflare with `npx wrangler login`.

Docker alternative when host Node/npm is unavailable:

```powershell
.\tools\docker-npm.ps1 install
.\tools\docker-npx.ps1 wrangler login
```

## Local verification

```powershell
npm install
npm run typecheck
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Docker equivalent:

```powershell
.\tools\docker-npm.ps1 install
.\tools\docker-npm.ps1 run typecheck
.\tools\docker-npm.ps1 run db:migrate:local
.\tools\docker-npm.ps1 run db:seed:local
.\tools\docker-dev.ps1
```

For local admin testing, create `.dev.vars`:

```text
LOCAL_ADMIN_TOKEN=replace-with-random-local-token
ADMIN_EMAILS=your-email@example.com
SITE_URL=http://127.0.0.1:8787
PUBLIC_MEDIA_BASE_URL=
```

Then access admin routes with header `X-Local-Admin-Token`.

## Cloudflare resources

```powershell
npx wrangler d1 create teacher_site
npx wrangler r2 bucket create teacher-site-media
```

Update `wrangler.toml` with the returned D1 `database_id`.

## Remote database

```powershell
npm run db:migrate:remote
npx wrangler d1 execute teacher_site --remote --file=./data/django_export.sql
```

## Media

During local development, media files live in `public/media/<object_key>`.

Before production, upload these files to R2 while preserving object keys. If you configure an R2 public/custom domain, set `PUBLIC_MEDIA_BASE_URL`; otherwise Worker `/media/*` proxies R2 objects.

## Admin security

Production admin access should be protected by Cloudflare Access. Set:

```text
ADMIN_EMAILS=your-email@example.com
LOCAL_ADMIN_TOKEN=
```

Do not set `LOCAL_ADMIN_TOKEN` in production.

## Deploy

```powershell
npm run deploy
```
