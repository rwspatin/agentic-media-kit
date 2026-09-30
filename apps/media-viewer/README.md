# media-viewer

A password-gated, single-file web app for reviewing and downloading videos and images stored in any S3-compatible bucket (built for Railway buckets). It's mobile-first, has no client-side JavaScript, and uses no database.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness (`{"ok":true}`). Does not touch the bucket. |
| `GET /login`, `POST /login`, `POST /logout` | none | Shared-password login, backed by an HMAC-signed cookie valid for 30 days |
| `GET /` | cookie (none if `PUBLIC_READ=true`) | Lists projects (first path segment of each object key) |
| `GET /p/:project` | cookie (none if `PUBLIC_READ=true`) | Grid of videos and images, each with inline playback and a Download button |
| `POST /upload` | cookie **or** `Authorization: Bearer $UPLOAD_TOKEN` | Multipart upload: fields `project` and `file`. Browsers get redirected; token requests get `201` JSON `{ok, project, key, size, url}`. |

```bash
curl -H "Authorization: Bearer $UPLOAD_TOKEN" -F project=my-app -F "file=@reel.mp4;type=video/mp4" \
  "$MEDIA_VIEWER_URL/upload"
```

## Env

See [`.env.example`](.env.example). Required: `AUTH_PASSWORD`, `SESSION_SECRET`, `BUCKET_NAME`, `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`. The server refuses to boot without them.
Optional: `UPLOAD_TOKEN`, `PUBLIC_READ`, `UNSORTED_PROJECT` (default `unsorted`), `APP_TITLE`, `MAX_UPLOAD_MB`, `BUCKET_REGION` (default `auto`), `BUCKET_FORCE_PATH_STYLE` (set `true` for MinIO), `COOKIE_SECURE`, `PORT`.

## Public read-only mode

Set `PUBLIC_READ=true` to turn the viewer into a public gallery (a demo, a portfolio, a launch page). Anonymous visitors can browse projects, play media, and use Download. Everything that writes stays locked: the upload form and the "New project" box are hidden unless you're signed in, `POST /upload` still needs the password cookie or the bearer token, and a small "Sign in to upload" link replaces "Log out". A footer credits the kit. Default is `false` (everything behind the password).

Anything in the bucket becomes public in this mode, so don't mix private reviews and public content in the same bucket.

## How it works

- **Projects are key prefixes**: `my-app/1712345-reel.mp4` belongs to project `my-app`. Files at the root appear under `UNSORTED_PROJECT`.
- **Presigned URLs, two per file**: one inline (for `<video>`/`<img>`) and one with `Content-Disposition: attachment` for Download. A single signature can't carry both dispositions. Media never streams through the app.
- **Uploads are buffered in memory** (`MAX_UPLOAD_MB`) and then `PutObject`'d as `<project>/<timestamp>-<sanitized-name>`.

## Run

```bash
npm install
cp .env.example .env    # fill it in; COOKIE_SECURE=false for http://localhost
npm run dev             # node --env-file-if-exists=.env --watch server.js
```

Deploy: [../../docs/deploy-railway.md](../../docs/deploy-railway.md). Design rule: keep it a single file with about five dependencies. Extend the prefix-as-organization pattern before adding a database.
