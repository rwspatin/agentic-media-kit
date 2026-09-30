// media-viewer — a password-gated, single-file web app to review and download
// videos/images from any S3-compatible bucket (built for Railway buckets).
// Humans log in with a shared password (cookie); agents upload with a bearer
// token. No database, no client-side JS: the bucket is the source of truth.
// With PUBLIC_READ=true, browsing is open to anyone; writes still need auth.
import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { parse, serialize } from "cookie";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const {
  PORT = 3000,
  AUTH_PASSWORD,
  SESSION_SECRET,
  BUCKET_NAME,
  BUCKET_ENDPOINT,
  BUCKET_REGION = "auto",
  BUCKET_ACCESS_KEY_ID,
  BUCKET_SECRET_ACCESS_KEY,
  BUCKET_FORCE_PATH_STYLE = "false",
  // Optional: enables `Authorization: Bearer <token>` on POST /upload so
  // agents/scripts can publish without the cookie login dance.
  UPLOAD_TOKEN,
  // Optional: "true" lets anonymous visitors browse projects and play/download
  // media (a public demo or portfolio). Uploading still requires the password
  // cookie or the bearer token.
  PUBLIC_READ = "false",
  // Optional: name of the pseudo-project for files stored at the bucket root.
  UNSORTED_PROJECT = "unsorted",
  APP_TITLE = "Media Viewer",
  MAX_UPLOAD_MB = "1024",
  // Set to "false" only for plain-http local dev; browsers drop Secure
  // cookies over http://localhost in some setups.
  COOKIE_SECURE = "true",
} = process.env;

for (const [key, value] of Object.entries({
  AUTH_PASSWORD,
  SESSION_SECRET,
  BUCKET_NAME,
  BUCKET_ENDPOINT,
  BUCKET_ACCESS_KEY_ID,
  BUCKET_SECRET_ACCESS_KEY,
})) {
  if (!value) throw new Error(`Missing required env var: ${key}`);
}

const s3 = new S3Client({
  region: BUCKET_REGION,
  endpoint: BUCKET_ENDPOINT,
  forcePathStyle: BUCKET_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: BUCKET_ACCESS_KEY_ID,
    secretAccessKey: BUCKET_SECRET_ACCESS_KEY,
  },
});

const slugify = (value) =>
  (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || UNSORTED_PROJECT;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;
const mediaKind = (key) => (IMAGE_EXT.test(key) ? "image" : VIDEO_EXT.test(key) ? "video" : "file");

const CONTENT_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};
const contentTypeFor = (name, fallback) =>
  CONTENT_TYPES[(name.split(".").pop() || "").toLowerCase()] || fallback || "application/octet-stream";

const safeEqual = (a, b) => {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const publicRead = PUBLIC_READ === "true";

const COOKIE_NAME = "mv_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const cookieOpts = { httpOnly: true, secure: COOKIE_SECURE !== "false", sameSite: "lax", path: "/" };

const sign = (value) =>
  crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");

const makeSessionCookie = () => {
  const value = "ok";
  return serialize(COOKIE_NAME, `${value}.${sign(value)}`, { ...cookieOpts, maxAge: COOKIE_MAX_AGE });
};

const isAuthed = (req) => {
  const cookies = parse(req.headers.cookie || "");
  const raw = cookies[COOKIE_NAME];
  if (!raw) return false;
  const [value, signature] = raw.split(".");
  if (!value || !signature) return false;
  return safeEqual(signature, sign(value));
};

const hasUploadToken = (req) => {
  if (!UPLOAD_TOKEN) return false;
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  return Boolean(match) && safeEqual(match[1].trim(), UPLOAD_TOKEN);
};

const requireAuth = (req, res, next) => {
  if (isAuthed(req)) return next();
  res.redirect("/login");
};

// Browsing: open to everyone in PUBLIC_READ mode, otherwise same as requireAuth.
const requireRead = (req, res, next) => {
  if (publicRead || isAuthed(req)) return next();
  res.redirect("/login");
};

// Upload accepts either a browser session or the agent bearer token. Checked
// BEFORE multer so unauthenticated requests never buffer a body.
const requireUploadAuth = (req, res, next) => {
  if (hasUploadToken(req)) {
    req.viaToken = true;
    return next();
  }
  if (isAuthed(req)) return next();
  if (req.headers.authorization) return res.status(401).json({ error: "invalid token" });
  res.redirect("/login");
};

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(MAX_UPLOAD_MB) * 1024 * 1024 },
});

const title = escapeHtml(APP_TITLE);

const creditFooter = `<footer class="credit">Built with agentic-media-kit → <a href="https://github.com/rwspatin/agentic-media-kit">github.com/rwspatin/agentic-media-kit</a></footer>`;

const layout = (pageTitle, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(pageTitle)} · ${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    background: #0d1220; color: #e8ebf2;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  header {
    padding: 20px 20px 12px; border-bottom: 1px solid #1e2740;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  header .titles { display: flex; flex-direction: column; gap: 2px; }
  header h1 { font-size: 18px; margin: 0; font-weight: 700; letter-spacing: -0.01em; }
  header .crumb { font-size: 13px; color: #7885a8; }
  header .crumb a { color: #7885a8; text-decoration: none; }
  header nav form { margin: 0; }
  header nav button.link {
    background: none; border: none; padding: 0; color: #8fa2d4; font-size: 14px; font-weight: 400; cursor: pointer;
  }
  main { padding: 20px; max-width: 720px; margin: 0 auto; }
  .grid { display: flex; flex-direction: column; gap: 24px; }
  .card {
    background: #131a2e; border: 1px solid #1e2740; border-radius: 16px;
    overflow: hidden;
  }
  .card video, .card img { width: 100%; display: block; background: #000; }
  .card .meta { padding: 12px 16px; font-size: 13px; color: #9aa5c2; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .card .meta .name { color: #e8ebf2; font-weight: 600; word-break: break-all; }
  .card .meta .side { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .card .meta a.download {
    color: #8fa2d4; text-decoration: none; font-size: 13px; font-weight: 600;
    border: 1px solid #29335a; border-radius: 8px; padding: 8px 12px;
  }
  .projects { display: flex; flex-direction: column; gap: 10px; }
  .project-link {
    display: flex; justify-content: space-between; align-items: center;
    background: #131a2e; border: 1px solid #1e2740; border-radius: 14px;
    padding: 16px 18px; color: #e8ebf2; text-decoration: none;
  }
  .project-link .count { color: #7885a8; font-size: 13px; }
  .empty { color: #7885a8; text-align: center; padding: 40px 20px; }
  form.login {
    max-width: 320px; margin: 80px auto; display: flex; flex-direction: column; gap: 12px;
    padding: 28px; background: #131a2e; border: 1px solid #1e2740; border-radius: 16px;
  }
  input[type="password"], input[type="text"], input[type="file"] {
    background: #0d1220; border: 1px solid #29335a; color: #e8ebf2;
    padding: 12px 14px; border-radius: 10px; font-size: 16px; width: 100%;
  }
  button {
    background: #4a63e0; color: white; border: none; border-radius: 10px;
    padding: 12px 16px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button:active { opacity: 0.85; }
  .upload-card {
    background: #131a2e; border: 1px dashed #29335a; border-radius: 16px;
    padding: 18px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;
  }
  .new-project { display: flex; gap: 10px; margin-bottom: 24px; }
  .new-project input { flex: 1; }
  .new-project button { flex-shrink: 0; }
  .error { color: #ff8080; font-size: 14px; }
  header nav a.signin { color: #8fa2d4; font-size: 14px; text-decoration: none; white-space: nowrap; }
  footer.credit { padding: 28px 20px 36px; text-align: center; font-size: 12px; color: #5d6a8c; }
  footer.credit a { color: #7885a8; text-decoration: none; border-bottom: 1px solid #29335a; white-space: nowrap; }
</style>
</head>
<body>${body}${publicRead ? creditFooter : ""}</body>
</html>`;

const logoutForm = `<form method="post" action="/logout"><button type="submit" class="link">Log out</button></form>`;
const signInLink = `<a class="signin" href="/login">Sign in to upload</a>`;
const navFor = (authed) => (authed ? logoutForm : signInLink);

// Unauthenticated liveness probe for Railway/Docker health checks. Does not
// touch the bucket, so it stays green even if storage is misconfigured.
app.get("/healthz", (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

app.get("/login", (req, res) => {
  if (isAuthed(req)) return res.redirect("/");
  const error = req.query.error ? `<p class="error">Wrong password.</p>` : "";
  res.send(
    layout(
      "Sign in",
      `<form class="login" method="post" action="/login">
        <h1 style="margin:0 0 4px">${title}</h1>
        ${error}
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required />
        <button type="submit">Sign in</button>
      </form>`
    )
  );
});

app.post("/login", (req, res) => {
  if (safeEqual(req.body.password || "", AUTH_PASSWORD)) {
    res.setHeader("Set-Cookie", makeSessionCookie());
    return res.redirect("/");
  }
  res.redirect("/login?error=1");
});

app.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", serialize(COOKIE_NAME, "", { ...cookieOpts, maxAge: 0 }));
  res.redirect("/login");
});

// Projects are just first-path-segment prefixes in the bucket ("demo/foo.mp4"
// -> project "demo") — no database needed, S3 IS the source of truth.
app.get("/", requireRead, async (req, res, next) => {
  try {
    const authed = isAuthed(req);
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET_NAME, Delimiter: "/" })
    );
    const projects = (list.CommonPrefixes || [])
      .map((p) => p.Prefix.replace(/\/$/, ""))
      .sort((a, b) => a.localeCompare(b));
    const hasRootFiles = (list.Contents || []).some((o) => o.Key && !o.Key.endsWith("/"));

    const projectLink = (p) =>
      `<a class="project-link" href="/p/${encodeURIComponent(p)}"><span>${escapeHtml(p)}</span><span class="count">open →</span></a>`;
    const links = projects.map(projectLink).join("");
    const rootLink = hasRootFiles ? projectLink(UNSORTED_PROJECT) : "";

    const body = `
      <header>
        <div class="titles"><h1>${title}</h1></div>
        <nav>${navFor(authed)}</nav>
      </header>
      <main>
        ${authed ? `<form class="new-project" method="get" action="/go">
          <input type="text" name="project" placeholder="New project (e.g. my-app)" required />
          <button type="submit">Open</button>
        </form>` : ""}
        <div class="projects">
          ${links}${rootLink || (projects.length ? "" : `<p class="empty">No projects yet.${authed ? " Create one above." : ""}</p>`)}
        </div>
      </main>`;
    res.send(layout("Projects", body));
  } catch (err) {
    next(err);
  }
});

app.get("/go", requireAuth, (req, res) => {
  res.redirect(`/p/${encodeURIComponent(slugify(req.query.project))}`);
});

app.get("/p/:project", requireRead, async (req, res, next) => {
  try {
    const authed = isAuthed(req);
    const project = slugify(req.params.project);
    const isRoot = project === UNSORTED_PROJECT;
    const prefix = isRoot ? "" : `${project}/`;

    const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix }));
    const objects = (list.Contents || [])
      .filter((o) => o.Key && !o.Key.endsWith("/") && (isRoot ? !o.Key.includes("/") : true))
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    // Two presigned URLs per object: an inline one for <video>/<img>, and an
    // attachment one for the Download button (one disposition per signature).
    const cards = await Promise.all(
      objects.map(async (o) => {
        const displayName = o.Key.slice(prefix.length);
        const [viewUrl, downloadUrl] = await Promise.all([
          getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: o.Key }), { expiresIn: 3600 }),
          getSignedUrl(
            s3,
            new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: o.Key,
              ResponseContentDisposition: `attachment; filename="${displayName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
            }),
            { expiresIn: 3600 }
          ),
        ]);
        const sizeMb = ((o.Size ?? 0) / (1024 * 1024)).toFixed(1);
        const kind = mediaKind(o.Key);
        const preview =
          kind === "image"
            ? `<img loading="lazy" src="${escapeHtml(viewUrl)}" alt="${escapeHtml(displayName)}" />`
            : kind === "video"
              ? `<video controls preload="metadata" playsinline src="${escapeHtml(viewUrl)}"></video>`
              : "";
        return `<div class="card">
          ${preview}
          <div class="meta">
            <span class="name">${escapeHtml(displayName)}</span>
            <span class="side">${sizeMb} MB<a class="download" href="${escapeHtml(downloadUrl)}">Download</a></span>
          </div>
        </div>`;
      })
    );

    const body = `
      <header>
        <div class="titles">
          <h1>${escapeHtml(project)}</h1>
          <span class="crumb"><a href="/">← projects</a></span>
        </div>
        <nav>${navFor(authed)}</nav>
      </header>
      <main>
        ${authed ? `<form class="upload-card" method="post" action="/upload" enctype="multipart/form-data">
          <strong>Upload to "${escapeHtml(project)}"</strong>
          <input type="hidden" name="project" value="${escapeHtml(project)}" />
          <input type="file" name="file" accept="video/*,image/*" required />
          <button type="submit">Upload</button>
        </form>` : ""}
        <div class="grid">
          ${cards.length ? cards.join("") : `<p class="empty">Nothing in this project yet.</p>`}
        </div>
      </main>`;
    res.send(layout(project, body));
  } catch (err) {
    next(err);
  }
});

app.post("/upload", requireUploadAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      if (req.viaToken) return res.status(400).json({ error: "missing multipart field 'file'" });
      return res.redirect("/");
    }
    const project = slugify(req.body.project);
    const isRoot = project === UNSORTED_PROJECT;
    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = isRoot ? `${Date.now()}-${safeName}` : `${project}/${Date.now()}-${safeName}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: contentTypeFor(safeName, req.file.mimetype),
      })
    );
    const projectPath = `/p/${encodeURIComponent(project)}`;
    if (req.viaToken) {
      return res.status(201).json({ ok: true, project, key, size: req.file.size, url: projectPath });
    }
    res.redirect(projectPath);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 500;
  if (req.viaToken) return res.status(status).json({ error: err.message });
  res.status(status).send(layout("Error", `<main><p class="error">${escapeHtml(err.message)}</p></main>`));
});

app.listen(PORT, () => console.log(`media-viewer listening on :${PORT}`));
