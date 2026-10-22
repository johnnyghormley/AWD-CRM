// Dex Design Desk: design pipeline, revenue and Dex's design queue.
// Same Supabase project and login as the CRM (tables from designs.sql, private "designs" storage bucket).
(() => {
  const cfg = window.AWD_CONFIG;
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const BUCKET = "designs";

  const STATUSES = [
    ["building", "Building"], ["sent", "Sent"], ["approved", "Approved"],
    ["paid", "Paid"], ["live", "Live"], ["archived", "Archived"]
  ];
  const SLABEL = Object.fromEntries(STATUSES);
  // Matches the CRM's Stripe packages (payments.js).
  const PKGS = [
    ["new_website", "New Website", 225, 50],
    ["website_upgrade", "Website Upgrade", 200, 50],
    ["website_only", "Website Only", 200, 0],
    ["website_only_domain", "Website Only + web address", 225, 0],
    ["referral", "Referral Discount", 100, 25],
    ["custom", "Custom / client job", null, null]
  ];
  const PKG = Object.fromEntries(PKGS.map((p) => [p[0], p]));
  const $ = (id) => document.getElementById(id);
  const money = (n) => "$" + (Number(n) || 0).toLocaleString("en-US");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => /^https?:\/\//i.test(u || "") ? u : "";
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  let designs = [], reqs = [], filter = "all", editingId = null, signed = {};

  let tt;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), 2600); }
  function opts(sel, list, val) { sel.innerHTML = list.map(([k, l]) => `<option value="${k}" ${k === val ? "selected" : ""}>${esc(l)}</option>`).join(""); }
  opts($("dfStatus"), STATUSES, "building");
  opts($("dfPkg"), PKGS.map((p) => [p[0], p[1]]), "new_website");
  function fillPkgPrices() {
    const p = PKG[$("dfPkg").value];
    if (p && p[2] != null) { $("dfUp").value = p[2]; $("dfMo").value = p[3]; }
  }
  $("dfPkg").addEventListener("change", fillPkgPrices);

  // ---------- auth ----------
  async function session() { return (await sb.auth.getSession()).data.session; }
  function showLogin() { $("login").hidden = false; $("main").hidden = true; $("topActions").hidden = true; }
  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $("lgEmail").value, password: $("lgPass").value });
    if (error) return toast(error.message);
    start();
  });
  $("signout").addEventListener("click", async () => { await sb.auth.signOut(); showLogin(); });

  // ---------- data ----------
  async function signUrls(paths) {
    const need = paths.filter((p) => p && !signed[p]);
    if (!need.length) return;
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(need, 3600);
    (data || []).forEach((r) => { if (r.signedUrl) signed[r.path] = r.signedUrl; });
  }
  async function load() {
    const [d, r] = await Promise.all([
      sb.from("designs").select("*").order("created_at", { ascending: false }),
      sb.from("design_requests").select("*").order("created_at", { ascending: false })
    ]);
    if (d.error || r.error) {
      const err = d.error || r.error;
      $("dbBanner").hidden = !/relation|does not exist|schema cache|PGRST205|42P01/i.test((err.code || "") + " " + err.message);
      if ($("dbBanner").hidden) toast("Couldn't load designs: " + err.message);
      return;
    }
    $("dbBanner").hidden = true;
    designs = d.data; reqs = r.data;
    await signUrls(designs.map((x) => x.thumb).concat(...reqs.map((x) => x.photos || [])));
    renderAll();
  }
  async function uploadImage(file, folder) {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || "image/png" });
    if (error) throw error;
    return path;
  }

  // ---------- rendering ----------
  const isPaying = (d) => d.status === "paid" || d.status === "live";

  function renderFlow() {
    const c = {}; designs.forEach((d) => (c[d.status] = (c[d.status] || 0) + 1));
    $("flow").innerHTML = [["all", "All"]].concat(STATUSES).map(([k, l]) => {
      const n = k === "all" ? designs.length : (c[k] || 0);
      return `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${esc(l)} <span class="n">${n}</span></button>`;
    }).join("");
  }

  function renderStats() {
    const paying = designs.filter(isPaying);
    const mrrSites = paying.filter((d) => Number(d.monthly) > 0);
    $("stMrr").textContent = money(mrrSites.reduce((s, d) => s + Number(d.monthly || 0), 0));
    $("stMrrN").textContent = mrrSites.length + (mrrSites.length === 1 ? " site on a plan" : " sites on a plan");
    $("stUp").textContent = money(paying.reduce((s, d) => s + Number(d.upfront || 0), 0));
    $("stUpN").textContent = "from " + paying.length + (paying.length === 1 ? " paid design" : " paid designs");
    $("stLive").textContent = designs.filter((d) => d.status === "live").length;
    $("stWait").textContent = designs.filter((d) => d.status === "sent").length;
  }

  function renderDesigns() {
    const list = designs.filter((d) => filter === "all" || d.status === filter);
    if (!list.length) {
      $("designs").innerHTML = `<div class="empty">${designs.length ? "No designs with this status." : "No designs yet. Tap “Add a design” to log the first one."}</div>`;
      return;
    }
    $("designs").innerHTML = list.map((d) => {
      const p = PKG[d.pkg], img = signed[d.thumb], prev = safeUrl(d.preview), live = safeUrl(d.live);
      return `<article class="card">
        <div class="thumb">${img ? `<img src="${esc(img)}" alt="Homepage of ${esc(d.business)}" loading="lazy">` : `<span class="ph">${esc((d.business || "?").slice(0, 1))}</span>`}</div>
        <div class="cbody">
          <div class="ctitle"><div><h3>${esc(d.business)}</h3><p>${esc(d.owner || "No contact yet")}</p></div><span class="pill s-${esc(d.status)}">${esc(SLABEL[d.status] || d.status)}</span></div>
          <dl class="meta">
            <dt>Package</dt><dd>${esc(p ? p[1] : "Not set")}</dd>
            <dt>Price</dt><dd>${d.upfront != null ? money(d.upfront) + " up front" : "Not set"}${Number(d.monthly) > 0 ? " · " + money(d.monthly) + "/mo" : ""}</dd>
            ${prev ? `<dt>Preview</dt><dd><a href="${esc(prev)}" target="_blank" rel="noopener">${esc(host(prev))}…</a></dd>` : ""}
            ${live ? `<dt>Live</dt><dd><a href="${esc(live)}" target="_blank" rel="noopener">${esc(host(live))}</a></dd>` : ""}
          </dl>
          ${d.notes ? `<p class="note">${esc(d.notes)}</p>` : ""}
          <div class="row">
            <select aria-label="Change status for ${esc(d.business)}" data-status="${esc(d.id)}">${STATUSES.map(([k, l]) => `<option value="${k}" ${k === d.status ? "selected" : ""}>${l}</option>`).join("")}</select>
            <button type="button" data-edit="${esc(d.id)}">Edit</button>
          </div>
        </div></article>`;
    }).join("");
  }

  function renderMoney() {
    const rows = designs.filter((d) => isPaying(d) || d.status === "approved")
      .sort((a, b) => Number(b.monthly || 0) - Number(a.monthly || 0));
    $("moneyRows").innerHTML = rows.length ? rows.map((d) => {
      const live = safeUrl(d.live);
      return `<tr><td>${esc(d.business)}</td><td>${esc(PKG[d.pkg] ? PKG[d.pkg][1] : "Not set")}</td>
        <td><span class="pill s-${esc(d.status)}">${esc(SLABEL[d.status])}</span></td>
        <td>${live ? `<a href="${esc(live)}" target="_blank" rel="noopener">${esc(host(live))}</a>` : "—"}</td>
        <td class="num">${d.upfront != null ? money(d.upfront) : "—"}</td>
        <td class="num">${Number(d.monthly) > 0 ? money(d.monthly) : "—"}</td></tr>`;
    }).join("") : `<tr><td colspan="6" class="note">No approved or paying clients yet. Set a design to Approved, Paid or Live and it shows up here.</td></tr>`;
    const paying = designs.filter(isPaying);
    $("totUp").textContent = money(paying.reduce((s, d) => s + Number(d.upfront || 0), 0));
    $("totMo").textContent = money(paying.reduce((s, d) => s + Number(d.monthly || 0), 0)) + "/mo";
    const by = {}; paying.forEach((d) => (by[d.pkg] = (by[d.pkg] || 0) + 1));
    $("pkgs").innerHTML = PKGS.map(([k, l, up, mo]) => `<div class="pkg"><b>${esc(l)}</b><span>${up == null ? "Priced per job" : money(up) + " up front" + (mo ? " + " + money(mo) + "/mo" : ", no monthly")}</span><span class="n">${by[k] || 0} sold</span></div>`).join("");
  }

  function renderReqs() {
    const order = { queued: 0, in_progress: 1, done: 2 };
    const list = reqs.slice().sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0));
    if (!list.length) { $("reqs").innerHTML = `<div class="empty">The queue is empty. Fill in the form above and Dex will build it next.</div>`; return; }
    const lbl = { queued: "Queued", in_progress: "Dex is on it", done: "Done" };
    $("reqs").innerHTML = list.map((r) => `<div class="req ${esc(r.status)}">
      <div class="ctitle"><div><h3>${esc(r.business)}</h3><p class="note">${esc([r.industry, r.contact, r.phone, r.email].filter(Boolean).join(" · "))}</p></div><span class="pill ${r.status === "done" ? "s-live" : r.status === "in_progress" ? "s-approved" : "s-building"}">${lbl[r.status] || "Queued"}</span></div>
      ${r.style ? `<p style="white-space:pre-line">${esc(r.style)}</p>` : ""}
      ${r.links ? `<p class="note">Links: ${esc(r.links)}</p>` : ""}
      ${(r.photos || []).length ? `<div class="photos">${r.photos.map((p) => signed[p] ? `<img src="${esc(signed[p])}" alt="Reference photo for ${esc(r.business)}" loading="lazy">` : "").join("")}</div>` : ""}
      <div class="row">
        ${r.status !== "done" ? `<button type="button" data-rdone="${esc(r.id)}">Mark done</button>` : `<button type="button" data-rq="${esc(r.id)}">Put back in queue</button>`}
        <button type="button" class="ghost danger" data-rdel="${esc(r.id)}">Remove</button>
        <span class="hint">${r.created_at ? "Added " + new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
      </div></div>`).join("");
  }

  function renderAll() { renderFlow(); renderStats(); renderDesigns(); renderMoney(); renderReqs(); }

  // ---------- events ----------
  $("flow").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; renderFlow(); renderDesigns(); });

  function openDesignForm(d) {
    editingId = d ? d.id : null;
    $("designFormH").textContent = d ? "Edit " + d.business : "Add a design";
    $("dfBusiness").value = d?.business || ""; $("dfOwner").value = d?.owner || "";
    $("dfStatus").value = d?.status || "building"; $("dfPkg").value = d?.pkg || "new_website";
    $("dfUp").value = d?.upfront ?? ""; $("dfMo").value = d?.monthly ?? "";
    if (!d) fillPkgPrices();
    $("dfPreview").value = d?.preview || ""; $("dfLive").value = d?.live || ""; $("dfNotes").value = d?.notes || "";
    $("dfThumb").value = ""; $("dfMsg").textContent = "";
    $("designForm").hidden = false; $("designForm").scrollIntoView({ block: "start", behavior: "smooth" }); $("dfBusiness").focus();
  }
  $("btnNewDesign").addEventListener("click", () => openDesignForm(null));
  $("dfCancel").addEventListener("click", () => { $("designForm").hidden = true; editingId = null; });
  $("designs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-edit]"); if (!b) return;
    const d = designs.find((x) => x.id === b.dataset.edit); if (d) openDesignForm(d);
  });
  $("designs").addEventListener("change", async (e) => {
    const s = e.target.closest("[data-status]"); if (!s) return;
    const { error } = await sb.from("designs").update({ status: s.value }).eq("id", s.dataset.status);
    if (error) return toast("Couldn't change status: " + error.message);
    toast("Moved to " + SLABEL[s.value]); load();
  });

  $("dfSave").addEventListener("click", async () => {
    const business = $("dfBusiness").value.trim();
    if (!business) { $("dfMsg").textContent = "Add the business name first."; $("dfBusiness").focus(); return; }
    const num = (v) => (v === "" ? null : Math.max(0, Number(v)));
    const body = {
      business, owner: $("dfOwner").value.trim(), status: $("dfStatus").value, pkg: $("dfPkg").value,
      upfront: num($("dfUp").value), monthly: num($("dfMo").value),
      preview: $("dfPreview").value.trim(), live: $("dfLive").value.trim(), notes: $("dfNotes").value.trim()
    };
    $("dfSave").disabled = true; $("dfMsg").textContent = "Saving…";
    try {
      const f = $("dfThumb").files[0];
      if (f) body.thumb = await uploadImage(f, "screenshots");
      const q = editingId ? sb.from("designs").update(body).eq("id", editingId) : sb.from("designs").insert(body);
      const { error } = await q; if (error) throw error;
      $("designForm").hidden = true; toast(editingId ? "Design updated" : "Design added"); editingId = null; load();
    } catch (err) { $("dfMsg").textContent = "Couldn't save: " + (err.message || err); }
    finally { $("dfSave").disabled = false; }
  });

  $("rqSave").addEventListener("click", async () => {
    const business = $("rqBusiness").value.trim();
    if (!business) { $("rqMsg").textContent = "Add the business name first."; $("rqBusiness").focus(); return; }
    $("rqSave").disabled = true; $("rqMsg").textContent = "Queuing…";
    try {
      const photos = [];
      for (const f of Array.from($("rqPhotos").files || []).slice(0, 6)) photos.push(await uploadImage(f, "requests"));
      const { error } = await sb.from("design_requests").insert({
        business, contact: $("rqContact").value.trim(), phone: $("rqPhone").value.trim(), email: $("rqEmail").value.trim(),
        industry: $("rqIndustry").value.trim(), links: $("rqLinks").value.trim(), style: $("rqStyle").value.trim(), photos
      });
      if (error) throw error;
      ["rqBusiness", "rqContact", "rqPhone", "rqEmail", "rqIndustry", "rqLinks", "rqStyle"].forEach((id) => ($(id).value = ""));
      $("rqPhotos").value = "";
      $("rqMsg").textContent = "Queued. Tell Claude “Dex, check the queue” to start it.";
      toast("Queued for Dex"); load();
    } catch (err) { $("rqMsg").textContent = "Couldn't queue it: " + (err.message || err); }
    finally { $("rqSave").disabled = false; }
  });

  $("reqs").addEventListener("click", async (e) => {
    const done = e.target.closest("[data-rdone]"), back = e.target.closest("[data-rq]"), del = e.target.closest("[data-rdel]");
    let res;
    if (done) res = await sb.from("design_requests").update({ status: "done" }).eq("id", done.dataset.rdone);
    else if (back) res = await sb.from("design_requests").update({ status: "queued" }).eq("id", back.dataset.rq);
    else if (del) {
      if (del.dataset.armed !== "1") { del.dataset.armed = "1"; del.textContent = "Tap again to remove"; setTimeout(() => { if (del.isConnected) { del.dataset.armed = ""; del.textContent = "Remove"; } }, 3000); return; }
      res = await sb.from("design_requests").delete().eq("id", del.dataset.rdel);
    } else return;
    if (res.error) return toast("Couldn't update: " + res.error.message);
    toast(done ? "Marked done" : back ? "Back in the queue" : "Request removed"); load();
  });

  // ---------- start ----------
  async function start() {
    if (!(await session())) return showLogin();
    $("login").hidden = true; $("main").hidden = false; $("topActions").hidden = false;
    renderAll(); load();
  }
  start();

  // ---------- installable app ----------
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) => console.warn("SW", e));
  let installPrompt = null;
  const installBtn = $("install");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; installBtn.hidden = false; });
  installBtn.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt(); await installPrompt.userChoice;
    installPrompt = null; installBtn.hidden = true;
  });
  window.addEventListener("appinstalled", () => { installBtn.hidden = true; toast("Dex Design Desk installed"); });
})();
