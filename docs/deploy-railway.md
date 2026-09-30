# Deploy media-viewer on Railway

You'll end up with a public HTTPS URL that shows a password prompt. Behind it, the viewer lists what your agents uploaded and gives you a real **Download** button for each file.

Requires the [Railway CLI](https://docs.railway.com/guides/cli) (`railway login`). Commands were checked against CLI v5. Run `railway <cmd> --help` if a flag has moved.

## 1. Project, service, bucket

```bash
railway init --name media-viewer          # creates + links a project in this directory
railway add --service media-viewer        # empty service (we deploy code in step 3)
railway bucket create media --json        # S3-compatible object storage
```

## 2. Wire the bucket and secrets into env vars

```bash
railway bucket credentials --bucket media --json
```

This prints the bucket's S3 name, endpoint, and access keys. Map them onto the viewer's variables:

| media-viewer var | Value |
|---|---|
| `BUCKET_NAME` | bucket name from the credentials output |
| `BUCKET_ENDPOINT` | S3 endpoint URL from the credentials output |
| `BUCKET_REGION` | `auto` |
| `BUCKET_ACCESS_KEY_ID` / `BUCKET_SECRET_ACCESS_KEY` | the key pair |
| `AUTH_PASSWORD` | the password you'll type on your phone |
| `SESSION_SECRET` | `openssl rand -hex 32` (signs the login cookie; rotate it to log everyone out) |
| `UPLOAD_TOKEN` | `openssl rand -hex 32`, used by agents in `Authorization: Bearer` |

Optional: `APP_TITLE`, `UNSORTED_PROJECT` (default `unsorted`), `MAX_UPLOAD_MB` (default 1024).

```bash
railway variable set --service media-viewer --skip-deploys \
  BUCKET_NAME=... BUCKET_ENDPOINT=... BUCKET_REGION=auto \
  BUCKET_ACCESS_KEY_ID=... BUCKET_SECRET_ACCESS_KEY=... \
  SESSION_SECRET="$(openssl rand -hex 32)" UPLOAD_TOKEN="$(openssl rand -hex 32)"
echo 'your-strong-password' | railway variable set AUTH_PASSWORD --stdin --service media-viewer --skip-deploys
```

Piping the password via `--stdin` keeps it out of your shell history.

## 3. Deploy

Pick one:

**A. From your machine (no GitHub needed)**

```bash
railway up apps/media-viewer --path-as-root --service media-viewer
```

**B. From GitHub (auto-deploy on push)**

```bash
railway service source connect --repo <you>/agentic-media-kit --branch main --service media-viewer
```

Then in the dashboard, go to **Service → Settings → Root Directory** and set it to `apps/media-viewer`. Railway picks up `apps/media-viewer/railway.json`, which builds with the Dockerfile and health-checks `GET /healthz`.

## 4. Domain

```bash
railway domain --service media-viewer            # generates a Railway-provided https domain
railway domain your-viewer.example.com --service media-viewer   # or a custom domain
```

## 5. Smoke test

```bash
export MEDIA_VIEWER_URL=https://<your-domain>
export UPLOAD_TOKEN=<value you set>
curl -s "$MEDIA_VIEWER_URL/healthz"                    # {"ok":true,...}
scripts/upload.sh smoke-test apps/studio/out/reel-cover.png
```

Open the printed `/p/smoke-test` link on your phone and log in. You should see the image and a Download button.

## Operations

- **Server throws on boot** with `Missing required env var: X`. Run `railway variable list --service media-viewer --kv` to see what's set.
- **`/healthz` is green but pages 500.** The health check deliberately doesn't touch the bucket. Check the bucket variables and `railway logs --service media-viewer`.
- **Upload limit.** Files are buffered in memory up to `MAX_UPLOAD_MB`. Keep the service's memory above that, or lower the limit.
- **Rotating secrets.** Changing `SESSION_SECRET` invalidates all cookies. Changing `UPLOAD_TOKEN` breaks agents until they get the new value.

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
