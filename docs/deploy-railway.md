# Deploy media-viewer on Railway

You'll end up with a public HTTPS URL that shows a password prompt. Behind it, the viewer lists what your agents uploaded and gives you a real **Download** button for each file.

Requires the [Railway CLI](https://docs.railway.com/guides/cli) (`railway login`) and `jq`. Commands were checked end to end against CLI v5.30 (a real deploy from GitHub, September 2026). Run `railway <cmd> --help` if a flag has moved.

## 1. Project, service, bucket

```bash
railway init --name media-viewer          # creates + links a project in this directory (add --workspace "<name>" if you have several)
railway add --service media-viewer        # empty service (we deploy code in step 3); press Enter at the variable prompt
railway bucket create media --region iad --json   # S3-compatible object storage
```

`--region` is required outside an interactive terminal. Pick `sjc` (US West), `iad` (US East), `ams` (EU West), or `sin` (Asia Pacific), ideally close to where the service runs.

## 2. Wire the bucket and secrets into env vars

```bash
railway bucket credentials --bucket media --json
```

This prints JSON with `bucketName`, `endpoint`, `region` (`auto`), `accessKeyId`, `secretAccessKey`, and `urlStyle` (`virtual-host`). Note that `bucketName` is the real S3 name (e.g. `media-ab12c-...`), not the `media` label you passed to `create`. Map them onto the viewer's variables:

| media-viewer var | Value |
|---|---|
| `BUCKET_NAME` | `bucketName` (not `media`) |
| `BUCKET_ENDPOINT` | `endpoint` |
| `BUCKET_REGION` | `auto` |
| `BUCKET_ACCESS_KEY_ID` / `BUCKET_SECRET_ACCESS_KEY` | `accessKeyId` / `secretAccessKey` |
| `AUTH_PASSWORD` | the password you'll type on your phone |
| `SESSION_SECRET` | `openssl rand -hex 32` (signs the login cookie; rotate it to log everyone out) |
| `UPLOAD_TOKEN` | `openssl rand -hex 32`, used by agents in `Authorization: Bearer` |

Optional: `PUBLIC_READ=true` (public read-only gallery: anyone can browse and download, uploads still need auth; see below), `APP_TITLE`, `UNSORTED_PROJECT` (default `unsorted`), `MAX_UPLOAD_MB` (default 1024). Leave `BUCKET_FORCE_PATH_STYLE` unset: Railway buckets use virtual-host style.

```bash
creds="$(railway bucket credentials --bucket media --json)"
railway variable set --service media-viewer --skip-deploys \
  BUCKET_NAME="$(jq -r .bucketName <<<"$creds")" \
  BUCKET_ENDPOINT="$(jq -r .endpoint <<<"$creds")" \
  BUCKET_REGION=auto \
  BUCKET_ACCESS_KEY_ID="$(jq -r .accessKeyId <<<"$creds")" \
  BUCKET_SECRET_ACCESS_KEY="$(jq -r .secretAccessKey <<<"$creds")" \
  SESSION_SECRET="$(openssl rand -hex 32)" UPLOAD_TOKEN="$(openssl rand -hex 32)"
unset creds
echo 'your-strong-password' | railway variable set AUTH_PASSWORD --stdin --service media-viewer --skip-deploys
railway variable list --service media-viewer --kv | grep UPLOAD_TOKEN   # copy it for your agents
```

Piping the password via `--stdin` keeps it out of your shell history (the trailing newline is stripped).

## 3. Deploy

Pick one:

**A. From your machine (no GitHub needed)**

```bash
railway up apps/media-viewer --path-as-root --service media-viewer
```

**B. From GitHub (auto-deploy on push)**

Set the root directory **first**. Otherwise the first deploy builds the repo root (a monorepo with no Dockerfile) instead of the viewer. In the dashboard: **Service → Settings → Source → Root Directory** = `/apps/media-viewer`. (With the Railway MCP server: `update_service` with `root_directory: "/apps/media-viewer"`. `railway environment edit --service-config media-viewer source.rootDirectory ...` reported "No changes to apply" on CLI v5.30.) Then connect the repo, which triggers the first deploy:

```bash
railway service source connect --repo <you>/agentic-media-kit --branch main --service media-viewer
```

If you connected first, set the root directory afterwards and run `railway redeploy --from-source --service media-viewer --yes`.

**Health check (both options).** Railway finds `apps/media-viewer/Dockerfile` through the root directory and builds with it. The `deploy` section of `apps/media-viewer/railway.json` (health check, restart policy) was **not** applied in our test: Railway has deprecated `railway.json` config-as-code, and the deployed service had no health check. Set it on the service yourself: **Settings → Deploy → Healthcheck Path** = `/healthz` (MCP: `update_service` with `health_check_path: "/healthz"`). Then roll a fresh deploy:

```bash
railway redeploy --from-source --service media-viewer --yes
```

Plain `railway redeploy` re-runs the previous deployment's snapshot and does **not** pick up changed service settings. Use `--from-source`. The build log should end with `Path: /healthz ... Healthcheck succeeded!` (`railway logs --build --service media-viewer`).

## 4. Domain

```bash
railway domain --service media-viewer            # generates a Railway-provided https domain
railway domain your-viewer.example.com --service media-viewer   # or a custom domain
```

## 5. Smoke test

From the repo root, after `npm install`:

```bash
export MEDIA_VIEWER_URL=https://<your-domain>
export UPLOAD_TOKEN=<value you set>
curl -s "$MEDIA_VIEWER_URL/healthz"                    # {"ok":true,...}
(cd apps/studio && npx remotion still Reel-Cover out/reel-cover.png)   # something to upload
scripts/upload.sh smoke-test apps/studio/out/reel-cover.png            # expects HTTP 201
```

Open the printed `/p/smoke-test` link on your phone and log in. You should see the image and a Download button. Headless check of the same thing:

```bash
curl -s -c /tmp/mv.txt -o /dev/null -w '%{http_code}\n' --data-urlencode "password=$AUTH_PASSWORD" "$MEDIA_VIEWER_URL/login"   # 302
curl -s -b /tmp/mv.txt "$MEDIA_VIEWER_URL/p/smoke-test" | grep -c reel-cover.png                                            # > 0
```

## Operations

- **Server throws on boot** with `Missing required env var: X`. Run `railway variable list --service media-viewer --kv` to see what's set.
- **`/healthz` is green but pages 500.** The health check deliberately doesn't touch the bucket. Check the bucket variables and `railway logs --service media-viewer`.
- **Upload limit.** Files are buffered in memory up to `MAX_UPLOAD_MB`. Keep the service's memory above that, or lower the limit.
- **Rotating secrets.** Changing `SESSION_SECRET` invalidates all cookies. Changing `UPLOAD_TOKEN` breaks agents until they get the new value.

## Optional: a public read-only demo

To share a gallery publicly (a launch page, a portfolio), turn on read-only mode:

```bash
railway variable set --service media-viewer PUBLIC_READ=true    # triggers a redeploy
curl -s -o /dev/null -w '%{http_code}\n' "$MEDIA_VIEWER_URL/"   # 200 without login
curl -s -o /dev/null -w '%{http_code}\n' -F project=x -F file=@README.md "$MEDIA_VIEWER_URL/upload"   # 302 to /login
```

Anonymous visitors get the gallery, players, and Download buttons, plus a "Sign in to upload" link. Uploads still require the password cookie or `UPLOAD_TOKEN`. Every object in the bucket becomes public, so use a separate viewer and bucket for private reviews.

## Optional: a remote agent devbox

To run the *whole pipeline* remotely (agent + browser + Remotion + upload) without your laptop, add a second, long-running service to the same project:

```bash
railway add --service devbox --image ubuntu:24.04     # or your own dev image
railway ssh --service devbox                          # shell into it
```

A bare base image exits right away, so give the service a long-running start command (**Settings → Deploy → Custom Start Command**: `sleep infinity`) or use an image that already runs something.

Inside the box, one-time setup:

```bash
apt-get update && apt-get install -y curl git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
npm i -g agent-browser && agent-browser install --with-deps
npm i -g @anthropic-ai/claude-code        # and/or @openai/codex
git clone https://github.com/<you>/agentic-media-kit && cd agentic-media-kit && npm install
```

Set `MEDIA_VIEWER_URL` and `UPLOAD_TOKEN` as devbox variables. The devbox can reach the viewer over Railway's private network, but using the public URL keeps the upload links you get back clickable. Attach a **volume** if you want repos and caches to survive redeploys. See [remote-workflow.md](remote-workflow.md) for the end-to-end loop.

Remotion renders are CPU-bound, so give the devbox several vCPUs. It's idle most of the time, so consider scaling it down between sessions.
