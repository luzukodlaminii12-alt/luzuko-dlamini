import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { getUser } from "@netlify/identity";
import { getStore } from "@netlify/blobs";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { projects, media, links, settings } from "../../db/schema.ts";

// The site owner. Only this account (or an Identity user with the "admin" role) can edit content.
const OWNER_EMAIL = "luzukodlaminii12@gmail.com";
const MAX_UPLOAD = 20 * 1024 * 1024;
const SECTIONS = ["d3", "mg"];
const SETTING_KEYS = ["email", "appUrl", "appTitle", "appDescription", "appImage"];

const uploads = () => getStore("uploads");
const app = new Hono();

// ---------- auth ----------

type Owner = { email: string };

async function verifyToken(c: Context, token: string): Promise<{ email?: string; roles?: string[] } | null> {
  // Ask the site's Identity service who this token belongs to. It validates the signature and expiry.
  try {
    const res = await fetch(new URL("/.netlify/identity/user", c.req.url), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    return { email: u.email, roles: u.app_metadata?.roles ?? [] };
  } catch {
    return null;
  }
}

async function getOwner(c: Context): Promise<Owner | null> {
  let who: { email?: string; roles?: string[] } | null = null;
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : getCookie(c, "nf_jwt");
  if (token) who = await verifyToken(c, token);
  if (!who) {
    const u = await getUser().catch(() => null);
    if (u) who = { email: u.email, roles: u.roles ?? [] };
  }
  if (!who?.email) return null;
  const isOwner = who.email.toLowerCase() === OWNER_EMAIL || (who.roles ?? []).includes("admin");
  return isOwner ? { email: who.email } : null;
}

async function requireOwner(c: Context) {
  const owner = await getOwner(c);
  if (!owner) return c.json({ error: "Only the site owner can do that. Please log in." }, 401);
  return null;
}

// ---------- helpers ----------

function cleanUrl(value: unknown): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (/^mailto:/i.test(v)) return v;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

async function storeFile(file: File, prefix: string) {
  const type = file.type || "application/octet-stream";
  if (!/^(image|video)\//.test(type)) throw new Error("Only images and videos can be uploaded.");
  if (file.size > MAX_UPLOAD) throw new Error(`${file.name} is over the 20 MB limit.`);
  const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const key = `${prefix}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
  await uploads().set(key, await file.arrayBuffer(), { metadata: { contentType: type } });
  return { key, url: `/api/files/${key}`, kind: type.startsWith("video/") ? "v" : "i" };
}

async function removeBlobs(keys: (string | null)[]) {
  await Promise.all(keys.filter(Boolean).map((k) => uploads().delete(k as string).catch(() => {})));
}

async function readFile(c: Context): Promise<File | null> {
  const body = await c.req.parseBody();
  const f = body["file"];
  return f instanceof File ? f : null;
}

async function loadState() {
  const [p, m, l, s] = await Promise.all([
    db.select().from(projects).orderBy(asc(projects.position), asc(projects.id)),
    db.select().from(media).orderBy(asc(media.position), asc(media.id)),
    db.select().from(links).orderBy(asc(links.position), asc(links.id)),
    db.select().from(settings),
  ]);
  const byProject = new Map<number, { id: number; src: string; t: string }[]>();
  for (const item of m) {
    const list = byProject.get(item.projectId) ?? [];
    list.push({ id: item.id, src: item.url, t: item.kind });
    byProject.set(item.projectId, list);
  }
  const out: Record<string, unknown[]> = { d3: [], mg: [] };
  for (const proj of p) {
    if (!out[proj.section]) continue;
    out[proj.section].push({ id: proj.id, title: proj.title, imgs: byProject.get(proj.id) ?? [] });
  }
  const set: Record<string, string> = {};
  for (const row of s) set[row.key] = row.value;
  return {
    projects: out,
    links: l.map((x) => ({ id: x.id, name: x.name, description: x.description, badge: x.badge, url: x.url })),
    settings: set,
  };
}

// ---------- public routes ----------

app.get("/api/state", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await loadState());
});

app.get("/api/me", async (c) => {
  c.header("Cache-Control", "no-store");
  const owner = await getOwner(c);
  return c.json({ owner: !!owner, email: owner?.email ?? null });
});

// Serves uploaded photos and videos, with byte-range support so videos can seek on every browser.
app.get("/api/files/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ""));
  const found = await uploads().getWithMetadata(key, { type: "arrayBuffer" });
  if (!found) return c.text("Not found", 404);
  const data = found.data as ArrayBuffer;
  const type = String(found.metadata?.contentType || "application/octet-stream");
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  const range = c.req.header("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && (m[1] || m[2])) {
    const size = data.byteLength;
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(data.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(data, { headers: { ...headers, "Content-Length": String(data.byteLength) } });
});

// ---------- owner-only routes ----------

app.use("/api/*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const denied = await requireOwner(c);
  if (denied) return denied;
  return next();
});

// Create an empty project; files are then added one by one.
app.post("/api/projects", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const section = String(body.section ?? "");
  if (!SECTIONS.includes(section)) return c.json({ error: "Unknown section" }, 400);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${projects.position}), -1)` })
    .from(projects)
    .where(eq(projects.section, section));
  const [row] = await db
    .insert(projects)
    .values({ section, title: text(body.title, 120), position: Number(max) + 1 })
    .returning();
  return c.json({ id: row.id }, 201);
});

app.patch("/api/projects/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  await db.update(projects).set({ title: text(body.title, 120) }).where(eq(projects.id, id));
  return c.json({ ok: true });
});

app.delete("/api/projects/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const items = await db.select({ blobKey: media.blobKey }).from(media).where(eq(media.projectId, id));
  await db.delete(projects).where(eq(projects.id, id));
  await removeBlobs(items.map((i) => i.blobKey));
  return c.json({ ok: true });
});

// Upload one photo/video into a project.
app.post("/api/projects/:id/media", async (c) => {
  const id = Number(c.req.param("id"));
  const [proj] = await db.select().from(projects).where(eq(projects.id, id));
  if (!proj) return c.json({ error: "Project not found" }, 404);
  const file = await readFile(c);
  if (!file) return c.json({ error: "No file received" }, 400);
  if (proj.section === "d3" && !file.type.startsWith("image/")) {
    return c.json({ error: "The 3D section only takes photos." }, 400);
  }
  let stored;
  try {
    stored = await storeFile(file, "projects");
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${media.position}), -1)` })
    .from(media)
    .where(eq(media.projectId, id));
  const [row] = await db
    .insert(media)
    .values({ projectId: id, url: stored.url, blobKey: stored.key, kind: stored.kind, position: Number(max) + 1 })
    .returning();
  return c.json({ id: row.id, src: row.url, t: row.kind }, 201);
});

app.delete("/api/media/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [row] = await db.delete(media).where(eq(media.id, id)).returning();
  if (row) {
    await removeBlobs([row.blobKey]);
    // Remove a project once its last file is gone.
    const left = await db.select({ id: media.id }).from(media).where(eq(media.projectId, row.projectId)).limit(1);
    if (!left.length) await db.delete(projects).where(eq(projects.id, row.projectId));
  }
  return c.json({ ok: true });
});

// Replace the whole "Digital Footprint" list.
app.put("/api/links", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!Array.isArray(body)) return c.json({ error: "Expected a list of links" }, 400);
  const rows = body
    .slice(0, 30)
    .map((l: Record<string, unknown>, i: number) => ({
      name: text(l.name, 60),
      description: text(l.description, 140),
      badge: text(l.badge, 30),
      url: cleanUrl(l.url),
      position: i,
    }))
    .filter((l) => l.name);
  await db.transaction(async (tx) => {
    await tx.delete(links);
    if (rows.length) await tx.insert(links).values(rows);
  });
  return c.json({ ok: true, links: rows });
});

app.patch("/api/settings", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const updates: { key: string; value: string }[] = [];
  for (const key of SETTING_KEYS) {
    if (!(key in body) || key === "appImage") continue;
    let value = text(body[key], key === "appDescription" ? 400 : 200);
    if (key === "appUrl") value = cleanUrl(value);
    if (key === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return c.json({ error: "That email address doesn’t look right." }, 400);
    }
    updates.push({ key, value });
  }
  for (const u of updates) {
    await db.insert(settings).values(u).onConflictDoUpdate({ target: settings.key, set: { value: u.value } });
  }
  return c.json({ ok: true, settings: Object.fromEntries(updates.map((u) => [u.key, u.value])) });
});

// Replace the photo on the app card.
app.post("/api/settings/app-image", async (c) => {
  const file = await readFile(c);
  if (!file || !file.type.startsWith("image/")) return c.json({ error: "Please choose a photo." }, 400);
  let stored;
  try {
    stored = await storeFile(file, "app");
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
  const [old] = await db.select().from(settings).where(eq(settings.key, "appImage"));
  await db
    .insert(settings)
    .values({ key: "appImage", value: stored.url })
    .onConflictDoUpdate({ target: settings.key, set: { value: stored.url } });
  if (old?.value.startsWith("/api/files/")) await removeBlobs([old.value.replace("/api/files/", "")]);
  return c.json({ ok: true, url: stored.url });
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Something went wrong. Please try again." }, 500);
});

export const config = { path: "/api/*" };

export default app;
