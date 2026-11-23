import {
  login,
  signup,
  logout,
  getUser,
  requestPasswordRecovery,
  handleAuthCallback,
  updateUser,
  acceptInvite,
  AuthError,
  MissingIdentityError,
} from "@netlify/identity";

// Globally disable portfolio audio
function muteAllMedia() {
  document.querySelectorAll("video, audio").forEach(media => {
    media.muted = true;
    media.defaultMuted = true;
    media.volume = 0;
    media.setAttribute("muted", "");
  });
}

document.addEventListener("volumechange", event => {
  const media = event.target;
  if (media instanceof HTMLMediaElement) {
    if (!media.muted) media.muted = true;
    if (media.volume !== 0) media.volume = 0;
  }
}, true);

document.addEventListener("play", muteAllMedia, true);

new MutationObserver(muteAllMedia).observe(document.documentElement, {
  childList: true,
  subtree: true
});

muteAllMedia();

const $ = (id) => document.getElementById(id);
const MAX_MB = 20;

// Shown until the live content loads (and if the API can't be reached).
let S = {
  projects: {
    d3: [
      { id: null, title: "Golden Cloud", imgs: [{ id: null, src: "/media/golden-cloud.jpg", t: "i" }] },
      { id: null, title: "Starbucks Booth", imgs: [{ id: null, src: "/media/starbucks-booth.jpg", t: "i" }] },
    ],
    mg: [
      ["Body Cream", "body cream.mp4"],
      ["Coffee", "coffee.mp4"],
      ["Motion Graphics", "d-1.mp4"],
      ["Fanta Orange", "fanta orange.mp4"],
      ["L'Oreal", "loreal.mp4"],
      ["NIVEA AD", "nivea-ad.mp4"],
      ["Sunglasses", "suninglass 2.mp4"],
      ["Tropican", "tropican.mp4"],
    ].map(([title, filename]) => ({
      id: null,
      title,
      imgs: [{
        id: null,
        src: `/media/${encodeURIComponent(filename)}`,
        t: "v",
      }],
    })),
  },
  links: [
    { name: "GitHub", description: "Code & open source repositories", badge: "Dev", url: "https://github.com/luzukodlaminii12-alt" },
  ],
  settings: {
    email: "luzukodlaminii12@gmail.com",
    appUrl: "",
    appTitle: "WRATH / iDREAMIT",
    appDescription: "Custom hardware engineering synthesis, PCB prototyping, and co-founding partnership platform.",
    appImage: "/media/wrath-idreamit.jpg",
  },
};
let owner = false;
let edit = false;
let cur = null;
let busy = 0;

// ---------- small helpers ----------

let toastT;
function toast(text, err) {
  const t = $("toast");
  t.textContent = text;
  t.classList.toggle("err", !!err);
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), err ? 4500 : 2600);
}

async function api(path, opts = {}) {
  const init = { method: opts.method || "GET", headers: {}, credentials: "same-origin" };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }
  if (init.method !== "GET") await getUser().catch(() => null); // refreshes the session cookie if needed
  const res = await fetch(path, init);
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (res.status === 401 && owner) {
      owner = false;
      setEdit(false);
      $("adminBtn").hidden = true;
      openAuth("login", "Your session ended. Please log in again.", "err");
    }
    if (res.status === 413) throw new Error("That file is too big to upload.");
    throw new Error((data && data.error) || "Something went wrong. Please try again.");
  }
  return data;
}

function mk(text, cls, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    fn(b);
  });
  return b;
}

// Two-tap confirm for destructive buttons.
function confirmTap(b, label) {
  if (b.textContent !== "Sure?") {
    b.textContent = "Sure?";
    setTimeout(() => (b.textContent = label), 2500);
    return false;
  }
  return true;
}

function fileIn(text, cls, accept, fn) {
  const a = document.createElement("label");
  a.className = cls;
  a.textContent = text;
  const f = document.createElement("input");
  f.type = "file";
  f.multiple = true;
  f.accept = accept;
  f.addEventListener("change", () => {
    const files = Array.from(f.files);
    f.value = "";
    if (files.length) fn(files);
  });
  a.addEventListener("click", (e) => e.stopPropagation());
  a.appendChild(f);
  return a;
}

// Large photos are scaled down in the browser so they upload quickly and reliably.
async function prepare(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= 4.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// ---------- lightbox & CV ----------

const isV = (it) => it.t === "v";
function openLb(key, pi, ii) {
  cur = { key, pi, ii: ii || 0 };
  showLb();
}
function showLb() {
  const p = S.projects[cur.key][cur.pi];
  const lb = $("lb");
  if (!p || !p.imgs.length) return closeLb();
  const n = p.imgs.length;
  cur.ii = (cur.ii + n) % n;
  const it = p.imgs[cur.ii];
  lb.innerHTML = "";
  let m;
  if (isV(it)) {
    m = document.createElement("video");
    m.controls = true;
    m.autoplay = true;
    m.loop = true;
    m.playsInline = true;
  } else {
    m = document.createElement("img");
    m.alt = p.title || "";
  }
  m.src = it.src;
  m.addEventListener("click", (e) => e.stopPropagation());
  lb.appendChild(m);
  if (n > 1) {
    const l = mk("‹", "lbb", () => { cur.ii--; showLb(); });
    l.style.left = "24px";
    l.setAttribute("aria-label", "Previous");
    const r = mk("›", "lbb", () => { cur.ii++; showLb(); });
    r.style.right = "24px";
    r.setAttribute("aria-label", "Next");
    const c = document.createElement("div");
    c.className = "cnt";
    c.textContent = cur.ii + 1 + " / " + n;
    lb.append(l, r, c);
  }
  const x = mk("✕", "lbb", closeLb);
  x.style.top = "24px";
  x.style.right = "24px";
  x.setAttribute("aria-label", "Close");
  lb.appendChild(x);
  if (edit && it.id) {
    const d = mk("× Remove photo", "lbb", async (b) => {
      if (!confirmTap(b, "× Remove photo")) return;
      b.disabled = true;
      try {
        await api("/api/media/" + it.id, { method: "DELETE" });
        p.imgs.splice(cur.ii, 1);
        if (!p.imgs.length) S.projects[cur.key].splice(cur.pi, 1);
        toast("Removed");
        redraw();
        showLb();
      } catch (e) {
        b.disabled = false;
        toast(e.message, true);
      }
    });
    d.style.top = "24px";
    d.style.left = "24px";
    d.style.fontSize = "13px";
    lb.appendChild(d);
  }
  lb.classList.add("open");
  lock();
}
function closeLb() {
  const lb = $("lb");
  lb.classList.remove("open");
  lb.innerHTML = "";
  lock();
}
$("lb").addEventListener("click", closeLb);
function lock() {
  const open = ["lb", "cvm", "authm"].some((id) => $(id).classList.contains("open"));
  document.body.style.overflow = open ? "hidden" : "";
}
function cvOpen(o) {
  $("cvm").classList.toggle("open", o);
  lock();
  if (o) $("cvx").focus();
}
$("cv").addEventListener("click", (e) => { e.preventDefault(); cvOpen(true); });
$("aboutL").addEventListener("click", (e) => { e.preventDefault(); cvOpen(true); });
$("cvx").addEventListener("click", () => cvOpen(false));
$("cvm").addEventListener("click", function (e) { if (e.target === this) cvOpen(false); });
$("cvPrint").addEventListener("click", () => window.print());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLb();
    cvOpen(false);
    closeAuth();
  }
  if ($("lb").classList.contains("open")) {
    if (e.key === "ArrowRight") { cur.ii++; showLb(); }
    if (e.key === "ArrowLeft") { cur.ii--; showLb(); }
  }
});

// ---------- galleries ----------

function grid(key, label, accept, addText) {
  const host = $("g_" + key);
  const list = S.projects[key];
  host.innerHTML = "";
  $("c_" + key).textContent = String(list.length).padStart(2, "0") + " " + label;
  list.forEach((p, pi) => {
    const it = p.imgs[0];
    const c = document.createElement("div");
    c.className = "card";
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", "View gallery" + (p.title ? ": " + p.title : ""));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === c) openLb(key, pi, 0); });
    let m;
    if (it && isV(it)) {
      m = document.createElement("video");
      m.muted = true;
      m.loop = true;
      m.playsInline = true;
      m.preload = "metadata";
      m.src = it.src + "#t=0.1";
      c.addEventListener("mouseenter", () => m.play().catch(() => {}));
      c.addEventListener("mouseleave", () => m.pause());
    } else if (it) {
      m = document.createElement("img");
      m.src = it.src;
      m.alt = p.title || "";
      m.loading = "lazy";
    }
    if (m) c.appendChild(m);
    const l = document.createElement("div");
    l.className = "lbl";
    l.textContent = "▣ View gallery (" + p.imgs.length + ")";
    c.appendChild(l);
    c.addEventListener("click", () => openLb(key, pi, 0));
    if (edit && p.id) {
      c.appendChild(
        mk("× Remove", "del", async (b) => {
          if (!confirmTap(b, "× Remove")) return;
          b.disabled = true;
          try {
            await api("/api/projects/" + p.id, { method: "DELETE" });
            list.splice(pi, 1);
            toast("Project removed");
            redraw();
          } catch (e) {
            b.disabled = false;
            toast(e.message, true);
          }
        })
      );
      c.appendChild(fileIn("+ Photos", "plus", accept, (fs) => upload(key, fs, p, c)));
    }
    const w = document.createElement("div");
    w.className = "item";
    w.appendChild(c);
    const cap = document.createElement("div");
    cap.className = "cap";
    if (edit && p.id) {
      const ti = document.createElement("input");
      ti.className = "ti";
      ti.placeholder = "Add a title";
      ti.maxLength = 120;
      ti.value = p.title || "";
      ti.addEventListener("change", async () => {
        const title = ti.value.trim();
        try {
          await api("/api/projects/" + p.id, { method: "PATCH", body: { title } });
          p.title = title;
          toast("Title saved");
        } catch (e) {
          toast(e.message, true);
        }
      });
      ti.addEventListener("keydown", (e) => { if (e.key === "Enter") ti.blur(); });
      cap.appendChild(ti);
    } else if (p.title) {
      const t = document.createElement("span");
      t.className = "ct";
      t.textContent = p.title;
      cap.appendChild(t);
    }
    const n = document.createElement("span");
    n.className = "cn";
    n.textContent = p.imgs.length + (p.imgs.length === 1 ? " file" : " files");
    cap.appendChild(n);
    w.appendChild(cap);
    host.appendChild(w);
  });
  if (edit) {
    const add = fileIn(addText, "card add", accept, (fs) => upload(key, fs, null, add));
    host.appendChild(add);
  } else if (!list.length) {
    host.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Nothing here yet</b><small>New work is on the way.</small></div>';
  }
}

function redraw() {
  grid("d3", "Projects", "image/*", "+ New project");
  grid("mg", "Items", "image/*,video/*", "+ New item");
}

async function upload(key, files, project, cardEl) {
  if (busy) return toast("Please wait for the current upload to finish.", true);
  busy++;
  const overlay = document.createElement("div");
  overlay.className = "uploading";
  cardEl.appendChild(overlay);
  let created = null;
  let ok = 0;
  try {
    if (!project) {
      const r = await api("/api/projects", { method: "POST", body: { section: key } });
      created = { id: r.id, title: "", imgs: [] };
      project = created;
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      overlay.textContent = `Uploading ${i + 1} of ${files.length}…`;
      if (key === "d3" && !f.type.startsWith("image/")) {
        toast(f.name + " isn’t a photo, skipped.", true);
        continue;
      }
      if (f.size > MAX_MB * 1024 * 1024) {
        toast(`${f.name} is over the ${MAX_MB} MB limit.`, true);
        continue;
      }
      try {
        const form = new FormData();
        form.append("file", await prepare(f));
        const item = await api(`/api/projects/${project.id}/media`, { method: "POST", form });
        project.imgs.push(item);
        ok++;
      } catch (e) {
        toast(`Couldn’t upload ${f.name}: ${e.message}`, true);
      }
    }
    if (created) {
      if (ok) S.projects[key].push(created);
      else await api("/api/projects/" + created.id, { method: "DELETE" }).catch(() => {});
    }
    if (ok) toast(ok === 1 ? "Uploaded, it’s live" : `${ok} files uploaded, they’re live`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy--;
    overlay.remove();
    redraw();
  }
}

// ---------- app card ----------

function renderApp() {
  const s = S.settings;
  const title = s.appTitle || "My App";
  $("appTitle").textContent = title;
  $("appDesc").textContent = s.appDescription || "";
  $("appImg").src = s.appImage || "/media/wrath-idreamit.jpg";
  $("appImg").alt = title;
  const go = $("appGo");
  if (s.appUrl) {
    go.href = s.appUrl;
    go.hidden = false;
  } else {
    go.hidden = true;
  }
  $("appSoon").hidden = !!s.appUrl;
  $("appCard").classList.toggle("editing", edit);
  $("appPanel").hidden = !edit;
  const wrap = $("appImgWrap");
  wrap.querySelectorAll(".plus,.uploading").forEach((n) => n.remove());
  if (edit) {
    $("appTitleIn").value = s.appTitle || "";
    $("appUrlIn").value = s.appUrl || "";
    $("appDescIn").value = s.appDescription || "";
    const btn = fileIn("+ Change photo", "plus", "image/*", async (fs) => {
      const overlay = document.createElement("div");
      overlay.className = "uploading";
      overlay.textContent = "Uploading…";
      wrap.appendChild(overlay);
      try {
        const form = new FormData();
        form.append("file", await prepare(fs[0]));
        const r = await api("/api/settings/app-image", { method: "POST", form });
        S.settings.appImage = r.url;
        toast("Photo updated");
      } catch (e) {
        toast(e.message, true);
      } finally {
        renderApp();
      }
    });
    btn.querySelector("input").multiple = false;
    wrap.appendChild(btn);
  }
}

$("appSave").addEventListener("click", async () => {
  const b = $("appSave");
  b.disabled = true;
  try {
    const r = await api("/api/settings", {
      method: "PATCH",
      body: { appTitle: $("appTitleIn").value, appUrl: $("appUrlIn").value, appDescription: $("appDescIn").value },
    });
    Object.assign(S.settings, r.settings);
    if ($("appUrlIn").value.trim() && !r.settings.appUrl) toast("That app address doesn’t look right.", true);
    else toast("App card saved");
    renderApp();
  } catch (e) {
    toast(e.message, true);
  } finally {
    b.disabled = false;
  }
});

// ---------- links ----------

function row(l, main) {
  const a = document.createElement("a");
  a.className = "link" + (main ? " main" : "") + (!l.url ? " off" : "");
  a.href = l.url || "#";
  if (!main && l.url) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  if (!l.url) a.addEventListener("click", (e) => e.preventDefault());
  a.innerHTML = '<div class="ico"></div><div class="t"><h4></h4><small></small></div><span class="badge"></span>';
  const ico = a.querySelector(".ico");
  if (main) ico.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
  else ico.innerHTML = iconFor(l);
  a.querySelector("h4").textContent = l.name;
  a.querySelector("small").textContent = l.description + (!l.url && edit ? " · not live yet, add an address" : "");
  a.querySelector(".badge").textContent = l.badge;
  $("linkList").appendChild(a);
}

function iconFor(l) {
  const n = (l.name + " " + l.url).toLowerCase();
  if (n.includes("github"))
    return '<svg viewBox="0 0 24 24"><path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 00-1.3-3.2 4.2 4.2 0 00-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 00-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 00-.1 3.2A4.6 4.6 0 004 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>';
  if (n.includes("linkedin"))
    return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 014 0v4M12 10v7"/></svg>';
  if (n.includes("instagram"))
    return '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/></svg>';
  if (n.includes("facebook"))
    return '<svg viewBox="0 0 24 24"><path d="M15 3h-2a4 4 0 00-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 011-1h2z"/></svg>';
  return '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>';
}

function renderLinks() {
  $("linkList").innerHTML = "";
  const email = S.settings.email || "luzukodlaminii12@gmail.com";
  row({ name: "Email Me", description: email, badge: "Direct", url: "mailto:" + email }, true);
  S.links.forEach((l) => { if (l.url || edit) row(l, false); });
  $("cvEmail").textContent = email;
  $("cvEmail").href = "mailto:" + email;
  $("cvMail").href = "mailto:" + email;
  $("linkPanel").hidden = !edit;
  if (edit) {
    $("emailIn").value = email;
    $("linkRows").innerHTML = "";
    S.links.forEach((l) => addLinkRow(l));
  }
}

function addLinkRow(l = { name: "", description: "", badge: "", url: "" }) {
  const r = document.createElement("div");
  r.className = "row";
  [
    ["name", "Name (e.g. Instagram)"],
    ["description", "Short description"],
    ["badge", "Tag (e.g. Social)"],
    ["url", "https://…"],
  ].forEach(([k, ph]) => {
    const i = document.createElement("input");
    i.dataset.k = k;
    i.placeholder = ph;
    i.value = l[k] || "";
    if (k === "url") i.inputMode = "url";
    r.appendChild(i);
  });
  r.appendChild(mk("Remove", "ghost danger", () => r.remove()));
  $("linkRows").appendChild(r);
}

$("linkAdd").addEventListener("click", () => addLinkRow());
$("linkSave").addEventListener("click", async () => {
  const b = $("linkSave");
  const list = Array.from($("linkRows").children).map((r) => {
    const o = {};
    r.querySelectorAll("input").forEach((i) => (o[i.dataset.k] = i.value.trim()));
    return o;
  });
  b.disabled = true;
  try {
    const email = $("emailIn").value.trim();
    const s = await api("/api/settings", { method: "PATCH", body: { email } });
    Object.assign(S.settings, s.settings);
    const r = await api("/api/links", { method: "PUT", body: list });
    S.links = r.links;
    toast("Links saved");
    renderLinks();
  } catch (e) {
    toast(e.message, true);
  } finally {
    b.disabled = false;
  }
});

// ---------- edit mode ----------

function setEdit(on) {
  edit = on && owner;
  $("adminBtn").classList.toggle("on", edit);
  $("adminBtn").textContent = edit ? "Editing" : "Edit site";
  $("editbar").hidden = !edit;
  redraw();
  renderApp();
  renderLinks();
}
$("adminBtn").addEventListener("click", () => setEdit(!edit));
$("doneBtn").addEventListener("click", () => setEdit(false));
$("logoutBtn").addEventListener("click", async () => {
  try {
    await logout();
  } catch {}
  owner = false;
  $("adminBtn").hidden = true;
  setEdit(false);
  toast("Logged out");
});

// ---------- owner login ----------

let mode = "login";
let inviteToken = null;

function authMsg(text, kind) {
  const m = $("authMsg");
  m.hidden = !text;
  m.textContent = text || "";
  m.className = "msg" + (kind ? " " + kind : "");
}

function openAuth(m = "login", msg, kind) {
  mode = m;
  const cfg = {
    login: ["Owner login", "Log in to upload photos and edit your site.", "Log in", true, true],
    signup: ["Create account", "One-time setup. Use your owner email; a confirmation link is sent to it.", "Create account", true, true],
    forgot: ["Reset password", "Enter your email and a reset link is sent to you.", "Send reset link", true, false],
    recovery: ["New password", "Choose a new password for your account.", "Save password", false, true],
    invite: ["Set password", "Choose a password to finish setting up your account.", "Save password", false, true],
  }[m];
  $("authTitle").textContent = cfg[0];
  $("authHint").textContent = cfg[1];
  $("authGo").textContent = cfg[2];
  $("emailField").hidden = !cfg[3];
  $("passField").hidden = !cfg[4];
  $("authPass").autocomplete = m === "login" ? "current-password" : "new-password";
  $("toSignup").hidden = m !== "login";
  $("toForgot").hidden = m !== "login";
  $("toLogin").hidden = m === "login" || m === "recovery" || m === "invite";
  authMsg(msg, kind);
  $("authm").classList.add("open");
  lock();
  setTimeout(() => (cfg[3] ? $("authEmail") : $("authPass")).focus(), 30);
}
function closeAuth() {
  $("authm").classList.remove("open");
  lock();
}
$("ownerLogin").addEventListener("click", async () => {
  if (owner) return setEdit(true);
  openAuth("login");
});
$("authx").addEventListener("click", closeAuth);
$("authm").addEventListener("click", function (e) { if (e.target === this) closeAuth(); });
$("toSignup").addEventListener("click", () => openAuth("signup"));
$("toForgot").addEventListener("click", () => openAuth("forgot"));
$("toLogin").addEventListener("click", () => openAuth("login"));

function authError(e) {
  if (e instanceof MissingIdentityError) return "Login isn’t switched on for this site yet.";
  if (e instanceof AuthError) {
    if (e.status === 401 || e.status === 400) {
      return /confirm/i.test(e.message) ? "Please confirm your email first (check your inbox)." : "Wrong email or password.";
    }
    if (e.status === 403) return "Only the site owner can create an account here.";
    if (e.status === 422) return /password/i.test(e.message) ? "Password must be at least 6 characters." : e.message;
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("authEmail").value.trim();
  const pass = $("authPass").value;
  if (!$("emailField").hidden && !email) return authMsg("Please enter your email.", "err");
  if (!$("passField").hidden && pass.length < 6) return authMsg("Password must be at least 6 characters.", "err");
  const b = $("authGo");
  b.disabled = true;
  try {
    if (mode === "login") {
      await login(email, pass);
      await afterLogin();
    } else if (mode === "signup") {
      const u = await signup(email, pass);
      if (u && u.emailVerified) await afterLogin();
      else authMsg("Almost there! Open the confirmation link sent to " + email + ", then you’ll be logged in.", "ok");
    } else if (mode === "forgot") {
      await requestPasswordRecovery(email);
      authMsg("If that account exists, a reset link is on its way to " + email + ".", "ok");
    } else if (mode === "recovery") {
      await updateUser({ password: pass });
      await afterLogin("Password updated");
    } else if (mode === "invite") {
      await acceptInvite(inviteToken, pass);
      await afterLogin("Account ready");
    }
  } catch (err) {
    const denied = mode === "signup" && err instanceof AuthError && (err.status === 401 || err.status === 403);
    authMsg(denied ? "Only the site owner’s email can create an account here." : authError(err), "err");
  } finally {
    b.disabled = false;
  }
});

async function checkOwner() {
  try {
    const me = await api("/api/me");
    owner = !!me.owner;
  } catch {
    owner = false;
  }
  $("adminBtn").hidden = !owner;
  $("ownerLogin").textContent = owner ? "Edit site" : "Owner login";
  return owner;
}

async function afterLogin(note) {
  if (await checkOwner()) {
    closeAuth();
    $("authPass").value = "";
    setEdit(true);
    toast(note ? note + ". You can edit your site now" : "Welcome back! You can edit your site now");
  } else {
    try {
      await logout();
    } catch {}
    openAuth("login", "This account can’t edit this site.", "err");
  }
}

// ---------- start ----------

async function loadState() {
  try {
    const data = await api("/api/state");
    if (data && data.projects) {
      const bundledMg = S.projects.mg; // the eight videos defined at the top of this file
      S = data;
      S.projects.mg = bundledMg;
    }
  } catch {}
  redraw();
  renderApp();
  renderLinks();
}

redraw();
renderApp();
renderLinks();
loadState();

(async () => {
  try {
    const result = await handleAuthCallback();
    if (result) {
      history.replaceState(null, "", location.pathname + location.search);
      if (result.type === "recovery") return openAuth("recovery");
      if (result.type === "invite") {
        inviteToken = result.token;
        return openAuth("invite");
      }
      if (result.type === "confirmation") return afterLogin("Email confirmed");
    }
  } catch (e) {
    openAuth("login", authError(e), "err");
    return;
  }
  const u = await getUser().catch(() => null);
  if (u) await checkOwner();
  if (location.hash === "#admin") {
    if (owner) setEdit(true);
    else openAuth("login");
  }
})();
