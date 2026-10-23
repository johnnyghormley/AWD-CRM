(() => {
  const cfg = window.AWD_CONFIG || {};
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith("PASTE")) {
    app.innerHTML = `<div class="card pad narrow"><h2>Almost ready</h2><p>Add your Supabase project URL and anon key to <code>config.js</code>.</p></div>`;
    return;
  }
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const CALL_STATUSES = ["New", "Called", "Callback", "Design Sent", "Follow Up", "Won", "Not Interested", "Do Not Call", "Disqualified"];
  const LEAD_STATUSES = ["Qualified", "Missing Info"];
  const CLOSED = ["Won", "Not Interested", "Do Not Call", "Disqualified"];
  const KINDS = ["Call", "Text", "Email", "Design sent", "Note"];
  const DNC_REASON = "Asked not to be called again";
  // "Does not speak English" is only a choice in the Log a call form: saving it disqualifies the lead (it's never stored as a status).
  const NO_ENGLISH = "Does not speak English";
  const DQ_REASONS = [DNC_REASON, NO_ENGLISH, "Already has a good website", "Out of business", "Outside our area", "Commercial only, not residential", "Too big / has a marketing team", "Can't reach the owner", "Duplicate", "Other"];
  const OUTCOMES = ["", "No answer", "Voicemail", "Talked", "Interested", "Wants design", "Not interested", "Wrong number", "Asked not to call"];

  // Columns in Abby's CSVs → database fields
  const CSV_MAP = {
    "Lead Status": "lead_status", "List": "list", "Business Name": "business_name", "Trade": "trade", "City": "city",
    "Business Address": "business_address", "Business Phone": "business_phone", "Owner Name": "owner_name",
    "Owner Title": "owner_title", "Owner Phone": "owner_phone", "Owner Phone Type": "owner_phone_type",
    "Owner Email": "owner_email", "Owner Email Status": "owner_email_status", "Website": "website",
    "Domain Owned": "domain_owned", "Website Status": "website_status", "Website Notes": "website_notes",
    "Google Rating": "google_rating", "Review Count": "review_count", "LinkedIn": "linkedin", "Facebook": "facebook",
    "Rapport Note": "rapport_note", "Missing": "missing", "Sources": "sources", "Date Researched": "date_researched",
    "Call Status": "call_status", "Next Step / Date": "next_step", "Call Notes": "_call_notes"
  };

  // Field layout for the lead form
  const FIELDS = [
    ["Business", [["business_name", "Business name", "text", true], ["trade", "Industry"], ["city", "City"], ["business_address", "Address"], ["business_phone", "Business phone", "tel"]]],
    ["Owner", [["owner_name", "Owner name"], ["owner_title", "Title"], ["owner_phone", "Owner phone", "tel"], ["owner_phone_type", "Phone type", ["", "Direct", "Main line"]], ["owner_email", "Owner email", "email"], ["owner_email_status", "Email status", ["", "Verified", "Inferred", "Not found"]]]],
    ["Lead", [["list", "List", ["", "A", "B"]], ["lead_status", "Lead status", LEAD_STATUSES], ["call_status", "Call status", CALL_STATUSES], ["follow_up_date", "Follow-up date", "date"], ["next_step", "Next step"], ["package", "Package", ["", "A", "B"]], ["missing", "Missing info"]]],
    ["Website", [["website", "Website"], ["domain_owned", "Domain owned", ["", "Yes", "No"]], ["website_status", "Website status", ["", "None", "Domain inactive", "Outdated", "Fair"]], ["website_notes", "Website notes", "textarea"]]],
    ["Research", [["google_rating", "Google rating", "number"], ["review_count", "Review count", "number"], ["linkedin", "LinkedIn"], ["facebook", "Facebook"], ["rapport_note", "Rapport note", "textarea"], ["sources", "Sources", "textarea"], ["date_researched", "Date researched", "date"]]]
  ];

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toLocaleDateString("en-CA");
  const fmtDate = (d) => d ? new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const fmtTime = (d) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const tel = (p) => (p || "").replace(/[^\d+]/g, "");
  const usable = (v) => v && !/^(unknown|none|n\/a|not found)$/i.test(String(v).trim());
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const statusClass = (s) => "st-" + slug(s);
  // Meetings (meetings table, meetings.sql): booked on a lead page, shown there and on the Calendar tab.
  const MEETING_KINDS = ["Phone call", "Video call", "In person"];
  const MEETING_ICON = { "Phone call": "📞", "Video call": "🎥", "In person": "🤝" };
  const fmtMeeting = (m) => new Date(m.starts_at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const localDay = (iso) => new Date(iso).toLocaleDateString("en-CA");
  // Google Calendar "add event" link, prefilled (opens in the browser; nothing is sent anywhere until you save it there).
  function gcalLink(m, l) {
    const z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const a = new Date(m.starts_at), b = new Date(a.getTime() + (m.duration_min || 30) * 60000);
    const q = new URLSearchParams({ action: "TEMPLATE", text: `AWD: ${m.kind} with ${l.business_name}`, dates: `${z(a)}/${z(b)}`,
      details: [usable(l.owner_name) && `Owner: ${l.owner_name}`, usable(l.owner_phone || l.business_phone) && `Phone: ${l.owner_phone || l.business_phone}`, m.note, `CRM: ${location.origin}/#/lead/${l.id}`].filter(Boolean).join("\n"),
      location: m.location || "" });
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }

  function toast(msg, bad) {
    const t = document.getElementById("toast");
    t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2800);
  }
  function fail(e) { console.error(e); toast(e.message || String(e), true); }

  // ---------- auth ----------
  async function session() { return (await sb.auth.getSession()).data.session; }

  function loginView() {
    nav.hidden = true;
    app.innerHTML = `
      <form class="card pad narrow" id="login">
        <h2>Sign in</h2>
        <label>Email<input name="email" type="email" required autocomplete="username"></label>
        <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn">Sign in</button>
      </form>`;
    document.getElementById("login").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
      if (error) return toast(error.message, true);
      route();
    };
  }
  document.getElementById("signout").onclick = async () => { await sb.auth.signOut(); location.hash = "#/"; loginView(); };

  // ---------- views ----------
  function leadRow(l) {
    const phone = usable(l.owner_phone) ? l.owner_phone : l.business_phone;
    const overdue = l.follow_up_date && l.follow_up_date < today() && !CLOSED.includes(l.call_status);
    return `<a class="row" href="#/lead/${l.id}">
      <div class="row-main">
        <b>${esc(l.business_name)}</b>
        <span class="muted">${esc([l.owner_name, l.trade, l.city].filter(usable).join(" · "))}</span>
      </div>
      <div class="row-side">
        <span class="pill ${statusClass(l.call_status)}">${esc(l.call_status)}</span>
        ${l.list ? `<span class="pill list">List ${esc(l.list)}</span>` : ""}
        ${l.lead_status === "Missing Info" ? `<span class="pill warn">Missing info</span>` : ""}
        ${l.follow_up_date ? `<span class="due ${overdue ? "late" : ""}">${overdue ? "Overdue · " : "Follow up "}${fmtDate(l.follow_up_date)}</span>` : ""}
        ${usable(phone) ? `<span class="muted small">${esc(phone)}</span>` : ""}
      </div></a>`;
  }

  // Compact row for the Today screen: company, contact, highlighted tap-to-call phone, missing-info flag.
  // `extra` is optional HTML (status pill, follow-up checkbox) shown between the details and the phone button.
  function todayRow(l, due, extra = "") {
    const phone = usable(l.owner_phone) ? l.owner_phone : l.business_phone;
    const missing = l.lead_status === "Missing Info"
      ? (usable(l.missing) ? l.missing.replace(/^needs?\s*/i, "").split(/[;.]/)[0].slice(0, 60) : "info") : "";
    const late = due && l.follow_up_date < today();
    return `<div class="trow" data-href="#/lead/${l.id}">
      <div class="trow-main">
        <a class="trow-name" href="#/lead/${l.id}">${esc(l.business_name)}</a>
        <span class="trow-contact">${usable(l.owner_name) ? esc(l.owner_name.split(" (")[0]) : '<span class="no-contact">No contact name</span>'}</span>
        ${missing ? `<span class="trow-missing">Missing: ${esc(missing)}</span>` : ""}
        ${due ? `<span class="due ${late ? "late" : ""}">${late ? "Overdue · " : "Due "}${fmtDate(l.follow_up_date)}</span>` : ""}
      </div>
      ${extra}
      ${usable(phone) ? `<a class="trow-phone" href="tel:${esc(tel(phone))}"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>${esc(phone)}</a>` : '<span class="trow-nophone">No phone</span>'}
    </div>`;
  }

  // ---------- Top-bar tabs: Ready / Missing info / Called (Follow up + Called lists) / Disqualified ----------
  const FOLLOW_STATUSES = ["Follow Up", "Callback"];
  const isFollow = (l) => FOLLOW_STATUSES.includes(l.call_status);
  // Disqualified = not a fit. A lead that asked not to be called again is disqualified automatically
  // (logging the outcome "Asked not to call" or the status "Do Not Call" sets it to Disqualified).
  const isDq = (l) => l.call_status === "Disqualified" || l.call_status === "Do Not Call";
  // Follow-up due = follow-up date is today or earlier (local date) on a lead that's still open, same rule as Today's
  // "Due today or overdue". Overdue ones stay until you log the call with a new date or status; closed and
  // disqualified leads never show.
  const isDue = (l) => !!l.follow_up_date && l.follow_up_date <= today() && !CLOSED.includes(l.call_status);
  const isFresh = (l) => l.lead_status !== "Missing Info" && l.call_status === "New";
  const TABS = [
    ["ready", "Ready", (l) => isFresh(l) || isDue(l), "Follow-ups due today (and overdue ones), then qualified leads not called yet."],
    ["missing", "Missing info", (l) => l.lead_status === "Missing Info" && l.call_status === "New", "Not called yet, still missing some info."],
    ["called", "Called", (l) => l.call_status !== "New" && !isDq(l), "Everyone you've called. Check Follow up to move a lead into the Follow up list."],
    ["disqualified", "Disqualified", isDq, "Leads that aren't a fit. They're kept out of every other list. Tap Restore to put one back in Ready."]
  ];

  // Show each tab's count next to its link in the top bar.
  function setNavCounts(leads) {
    TABS.forEach(([k, , test]) => {
      const b = nav.querySelector(`[data-count="${k}"]`);
      if (b) b.textContent = leads.filter(test).length;
    });
  }

  // Disqualify reason = the newest "Disqualified: ..." note on the lead.
  let dqReasons = new Map();
  function tabRow(l, tab) {
    if (tab === "disqualified") {
      const why = dqReasons.get(String(l.id)) || (l.call_status === "Do Not Call" ? DNC_REASON : "");
      return todayRow(l, false, `<div class="trow-extra">${why ? `<span class="dq-why">${esc(why)}</span>` : ""}<button type="button" class="btn ghost small" data-restore="${l.id}">↩ Restore</button></div>`);
    }
    if (tab === "ready-due") return todayRow(l, true, `<div class="trow-extra"><span class="pill ${statusClass(l.call_status)}">${esc(l.call_status)}</span></div>`);
    const status = tab === "called" ? `<span class="pill ${statusClass(l.call_status)}">${esc(l.call_status)}</span>` : "";
    const box = tab === "called" ? `<label class="fu-check"><input type="checkbox" data-id="${l.id}" ${isFollow(l) ? "checked" : ""}>Follow up</label>` : "";
    return todayRow(l, tab === "called" && !!l.follow_up_date, `<div class="trow-extra">${status}${box}</div>`);
  }

  function tabList(rows, tab, empty) {
    return `<div class="tlist">${rows.map((l) => tabRow(l, tab)).join("") || `<p class="muted pad">${empty}</p>`}</div>`;
  }

  async function disqualify(l, reason) {
    const from = l.call_status;
    const { error: e1 } = await sb.from("leads").update({ call_status: "Disqualified", follow_up_date: null }).eq("id", l.id);
    if (e1) { fail(e1); return false; }
    await sb.from("activities").insert({ lead_id: l.id, kind: "Note", note: `Disqualified: ${reason || "no reason given"}\nStatus: ${from} → Disqualified` });
    l.call_status = "Disqualified"; l.follow_up_date = null;
    toast(`${l.business_name} disqualified`);
    return true;
  }
  async function requalify(l) {
    const { error: e1 } = await sb.from("leads").update({ call_status: "New" }).eq("id", l.id);
    if (e1) { fail(e1); return false; }
    await sb.from("activities").insert({ lead_id: l.id, kind: "Note", note: "Restored from Disqualified\nStatus: Disqualified → New" });
    l.call_status = "New";
    toast(`${l.business_name} restored`);
    return true;
  }

  async function tabView(tab) {
    const [{ data: leads, error }, { data: dq, error: e2 }] = await Promise.all([
      sb.from("leads").select("*").order("follow_up_date", { ascending: true, nullsFirst: false }),
      sb.from("activities").select("lead_id, note").like("note", "Disqualified:%").order("created_at", { ascending: false })
    ]);
    if (error || e2) return fail(error || e2);
    dqReasons = new Map();
    (dq || []).forEach((a) => { if (!dqReasons.has(String(a.lead_id))) dqReasons.set(String(a.lead_id), a.note.split("\n")[0].replace(/^Disqualified:\s*/, "")); });
    drawTab(leads, tab);
  }

  function drawTab(leads, tab) {
    const el = app;
    const [, label, test, hint] = TABS.find(([k]) => k === tab);
    const rows = leads.filter(test);
    setNavCounts(leads);
    el.innerHTML = `
      <h2 class="h">${label} <span class="muted">(${rows.length})</span></h2>
      <p class="muted small tab-hint">${hint}</p>
      ${tab === "called" ? `
        <h3 class="sub-h">Follow up <span class="muted">(${rows.filter(isFollow).length})</span></h3>
        ${tabList(rows.filter(isFollow), "called", "No follow-ups.")}
        <h3 class="sub-h">Called <span class="muted">(${rows.filter((l) => !isFollow(l)).length})</span></h3>
        ${tabList(rows.filter((l) => !isFollow(l)), "called", "Nothing here yet.")}`
      : tab === "ready" ? `
        <h3 class="sub-h">Follow-ups due today <span class="muted">(${rows.filter(isDue).length})</span></h3>
        ${tabList(rows.filter(isDue), "ready-due", "No follow-ups due today.")}
        <h3 class="sub-h">Not called yet <span class="muted">(${rows.filter((l) => !isDue(l)).length})</span></h3>
        ${tabList(rows.filter((l) => !isDue(l)), "ready", "Nothing here yet.")}`
      : tabList(rows, tab, tab === "disqualified" ? "No disqualified leads. Use 🚫 Disqualify on a lead's page." : "Nothing here yet.")}`;
    el.querySelectorAll(".trow").forEach((r) => r.addEventListener("click", (e) => { if (!e.target.closest("a, label, input, button")) location.hash = r.dataset.href; }));
    el.querySelectorAll("[data-restore]").forEach((b) => b.onclick = async () => {
      const l = leads.find((x) => String(x.id) === b.dataset.restore);
      b.disabled = true;
      if (!(await requalify(l))) { b.disabled = false; return; }
      drawTab(leads, tab);
    });
    el.querySelectorAll(".fu-check input").forEach((cb) => cb.onchange = async () => {
      const l = leads.find((x) => String(x.id) === cb.dataset.id);
      const from = l.call_status, to = cb.checked ? "Follow Up" : "Called";
      cb.disabled = true;
      const { error: e1 } = await sb.from("leads").update({ call_status: to }).eq("id", l.id);
      if (e1) { cb.checked = !cb.checked; cb.disabled = false; return fail(e1); }
      await sb.from("activities").insert({ lead_id: l.id, kind: "Note", note: `Status: ${from} → ${to}` });
      l.call_status = to;
      toast(cb.checked ? `${l.business_name} moved to Follow up` : `${l.business_name} removed from Follow up`);
      drawTab(leads, tab);
    });
  }

  // ---------- Inquired: requests sent from the "Get your free design" form on the AWD website ----------
  async function refreshInquiryCount() {
    const { count } = await sb.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "New");
    const b = nav.querySelector('[data-count="inquired"]');
    if (b) { b.textContent = count || ""; b.classList.toggle("hot", !!count); }
  }

  function inquiryRow(q) {
    const site = usable(q.website) ? (/^https?:/i.test(q.website) ? q.website : "https://" + q.website) : "";
    const btns = q.status === "New"
      ? `<button class="btn small" data-add="${q.id}">Add to leads</button><button class="btn ghost small" data-dismiss="${q.id}">Dismiss</button>`
      : q.lead_id ? `<a class="btn ghost small" href="#/lead/${q.lead_id}">Open lead</a>` : `<span class="pill">${esc(q.status)}</span>`;
    return `<div class="trow inq">
      <div class="trow-main">
        <span class="trow-name">${esc(q.business)}</span>
        <span class="trow-contact">${esc(q.name)}${usable(q.trade) ? " · " + esc(q.trade) : ""}</span>
        <span class="muted small">${fmtTime(q.created_at)}${usable(q.email) ? ` · <a href="mailto:${esc(q.email)}">${esc(q.email)}</a>` : ""}${site ? ` · <a href="${esc(site)}" target="_blank" rel="noopener">${esc(q.website)}</a>` : " · No website"}</span>
        ${usable(q.source) ? `<span class="muted small">Heard about us: <b>${esc(q.source)}</b></span>` : ""}
        ${usable(q.message) ? `<span class="inq-msg">“${esc(q.message)}”</span>` : ""}
      </div>
      <div class="trow-extra">${btns}</div>
      <a class="trow-phone" href="tel:${esc(tel(q.phone))}"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>${esc(q.phone)}</a>
    </div>`;
  }

  async function inquiredView() {
    const { data: qs, error } = await sb.from("inquiries").select("*").order("created_at", { ascending: false });
    if (error) return fail(error);
    const fresh = qs.filter((q) => q.status === "New"), done = qs.filter((q) => q.status !== "New");
    app.innerHTML = `
      <h2 class="h">Inquired <span class="muted">(${fresh.length})</span></h2>
      <p class="muted small tab-hint">Requests sent from the "Get your free design" form on the AWD website. Call them, then Add to leads to work them like any other lead.</p>
      <div class="tlist">${fresh.map(inquiryRow).join("") || `<p class="muted pad">No new inquiries yet.</p>`}</div>
      ${done.length ? `<h3 class="sub-h">Handled <span class="muted">(${done.length})</span></h3><div class="tlist">${done.map(inquiryRow).join("")}</div>` : ""}`;
    refreshInquiryCount();
    app.querySelectorAll("[data-add]").forEach((b) => b.onclick = async () => {
      const q = qs.find((x) => x.id === b.dataset.add);
      b.disabled = true;
      const hasSite = usable(q.website);
      const lead = {
        business_name: q.business, owner_name: q.name, owner_phone: q.phone, owner_phone_type: "Direct",
        owner_email: q.email || null, owner_email_status: q.email ? "Verified" : null, trade: q.trade || null,
        website: hasSite ? q.website : null, list: hasSite ? "B" : "A", website_status: hasSite ? null : "None",
        lead_status: "Qualified", call_status: "New", sources: "Website inquiry form " + q.created_at.slice(0, 10) + (q.source ? " (heard about us: " + q.source + ")" : "")
      };
      const { data, error: e1 } = await sb.from("leads").insert(lead).select("id").single();
      if (e1) { b.disabled = false; return fail(e1); }
      await sb.from("activities").insert({ lead_id: data.id, kind: "Note", note: `Inquired through the website form on ${fmtTime(q.created_at)}.${q.source ? "\nHeard about us: " + q.source : ""}${q.message ? "\nMessage: " + q.message : ""}` });
      const { error: e2 } = await sb.from("inquiries").update({ status: "Added to leads", lead_id: data.id }).eq("id", q.id);
      if (e2) return fail(e2);
      toast(`${q.business} added to leads`); location.hash = "#/lead/" + data.id;
    });
    app.querySelectorAll("[data-dismiss]").forEach((b) => b.onclick = async () => {
      const q = qs.find((x) => x.id === b.dataset.dismiss);
      if (!confirm(`Dismiss the inquiry from ${q.business}? (Spam, duplicate, etc.)`)) return;
      const { error: e1 } = await sb.from("inquiries").update({ status: "Dismissed" }).eq("id", q.id);
      if (e1) return fail(e1);
      toast("Inquiry dismissed"); inquiredView();
    });
  }

  // ---------- Script: both AWD call scripts (generated from the vault by sync/build_scripts.py) ----------
  function scriptView() {
    const S = window.AWD_SCRIPTS || {};
    let which = "A";
    try { which = localStorage.getItem("awd-script-tab") || "A"; } catch (e) {}
    const draw = () => {
      app.innerHTML = `
        <div class="script-head">
          <h2 class="h">Call script</h2>
          <div class="script-tabs" role="tablist">
            <button role="tab" class="${which === "A" ? "on" : ""}" data-s="A" aria-selected="${which === "A"}">No website <span>List A</span></button>
            <button role="tab" class="${which === "B" ? "on" : ""}" data-s="B" aria-selected="${which === "B"}">Has a website <span>List B</span></button>
          </div>
        </div>
        <article class="card pad script">${S[which] || '<p class="muted">Script not loaded.</p>'}</article>`;
      app.querySelectorAll(".script-tabs button").forEach((b) => b.onclick = () => {
        which = b.dataset.s;
        try { localStorage.setItem("awd-script-tab", which); } catch (e) {}
        draw();
      });
    };
    draw();
  }

  async function todayView() {
    const { data: leads, error } = await sb.from("leads").select("*").order("follow_up_date", { ascending: true, nullsFirst: false });
    if (error) return fail(error);
    const open = (l) => !CLOSED.includes(l.call_status);
    const due = leads.filter((l) => open(l) && l.follow_up_date && l.follow_up_date <= today());
    const fresh = leads.filter((l) => l.call_status === "New");
    const count = (s) => leads.filter((l) => l.call_status === s).length;
    setNavCounts(leads);
    app.innerHTML = `
      ${window.AbbyRunner ? AbbyRunner.html(leads) : ""}
      <section class="stats">
        ${[["Total leads", leads.length], ["New", count("New")], ["Design sent", count("Design Sent")], ["Follow up", count("Follow Up") + count("Callback")], ["Won", count("Won")]]
          .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join("")}
      </section>
      <h2 class="h">Due today or overdue <span class="muted">(${due.length})</span></h2>
      <div class="tlist">${due.map((l) => todayRow(l, true)).join("") || `<p class="muted pad">Nothing due. Nice.</p>`}</div>
      <h2 class="h">New, not called yet <span class="muted">(${fresh.length})</span></h2>
      <div class="tlist">${fresh.slice(0, 50).map((l) => todayRow(l)).join("") || `<p class="muted pad">No new leads. <a href="#/import">Import Abby's list</a> or <a href="#/new">add one</a>.</p>`}</div>`;
    app.querySelectorAll(".trow").forEach((r) => r.addEventListener("click", (e) => { if (!e.target.closest("a")) location.hash = r.dataset.href; }));
    if (window.AbbyRunner) AbbyRunner.start(leads);
  }

  // ---------- Calendar: follow-ups (open leads' follow_up_date) + booked meetings, month grid + upcoming list ----------
  let calMonth = null; // "YYYY-MM" being shown
  async function calendarView() {
    const [{ data: leads, error }, { data: meets, error: mErr }] = await Promise.all([
      sb.from("leads").select("id,business_name,owner_name,call_status,follow_up_date,next_step").not("follow_up_date", "is", null),
      sb.from("meetings").select("*, leads(business_name, owner_name)").neq("status", "canceled").order("starts_at", { ascending: true })
    ]);
    if (error) return fail(error);
    const t = today();
    if (!calMonth) calMonth = t.slice(0, 7);
    // events by day: { day: "YYYY-MM-DD", type: "meet"|"fu", ... }
    const events = [];
    (leads || []).filter((l) => !CLOSED.includes(l.call_status)).forEach((l) => events.push({ day: l.follow_up_date, type: "fu", lead: l.id, name: l.business_name,
      sub: [l.call_status, l.next_step].filter(usable).join(" · "), late: l.follow_up_date < t, sort: "" }));
    (meets || []).forEach((m) => events.push({ day: localDay(m.starts_at), type: "meet", lead: m.lead_id, name: (m.leads && m.leads.business_name) || "Lead",
      time: new Date(m.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), kind: m.kind, done: m.status === "done",
      sub: [m.kind, `${m.duration_min} min`, m.location].filter(Boolean).join(" · "), sort: m.starts_at }));
    events.sort((a, b) => a.day.localeCompare(b.day) || (a.type === b.type ? a.sort.localeCompare(b.sort) : a.type === "meet" ? -1 : 1));
    const byDay = {};
    events.forEach((e) => (byDay[e.day] = byDay[e.day] || []).push(e));

    const [y, mo] = calMonth.split("-").map(Number);
    const first = new Date(y, mo - 1, 1), days = new Date(y, mo, 0).getDate();
    const ymd = (d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
    const chip = (e) => `<a class="cal-ev ${e.type}${e.late ? " late" : ""}${e.done ? " done" : ""}" href="#/lead/${e.lead}" title="${esc(e.name + (e.sub ? " · " + e.sub : ""))}">${e.type === "meet" ? `${MEETING_ICON[e.kind] || "📅"} ${esc(e.time)} ` : "↻ "}${esc(e.name)}</a>`;
    let cells = "";
    for (let i = 0; i < first.getDay(); i++) cells += `<div class="cal-day blank"></div>`;
    for (let d = 1; d <= days; d++) {
      const key = ymd(d), list = byDay[key] || [];
      cells += `<div class="cal-day${key === t ? " today" : ""}${key < t ? " past" : ""}"><span class="cal-num">${d}</span>${list.slice(0, 4).map(chip).join("")}${list.length > 4 ? `<span class="cal-more">+${list.length - 4} more</span>` : ""}</div>`;
    }
    const lateFu = events.filter((e) => e.type === "fu" && e.late);
    const ahead = events.filter((e) => e.day >= t && !e.done).slice(0, 40);
    const row = (e) => `<a class="agenda-row" href="#/lead/${e.lead}"><span class="agenda-tag ${e.type}">${e.type === "meet" ? "Meeting" : "Follow-up"}</span>
      <span><b>${esc(e.name)}</b>${e.type === "meet" ? ` · ${esc(e.time)}` : ""}<br><span class="muted small">${esc(e.sub || "")}</span></span></a>`;
    const groupRows = (list) => { let out = "", last = ""; list.forEach((e) => { if (e.day !== last) { last = e.day; out += `<div class="agenda-day">${e.day === t ? "Today · " : ""}${esc(fmtDate(e.day))}</div>`; } out += row(e); }); return out; };

    app.innerHTML = `
      <div class="cal-top"><h2 class="h">Calendar</h2>
        <div class="cal-nav"><button class="btn ghost small" id="cal-prev" aria-label="Previous month">‹</button>
          <b>${first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b>
          <button class="btn ghost small" id="cal-next" aria-label="Next month">›</button>
          <button class="btn ghost small" id="cal-today">Today</button></div></div>
      <p class="muted small cal-key"><span class="cal-ev meet">📅 Meeting</span> <span class="cal-ev fu">↻ Follow-up</span> <span class="cal-ev fu late">Overdue</span> · Book meetings from a lead's page.</p>
      ${mErr ? `<p class="pill warn">Meetings aren't set up yet (run meetings.sql). Showing follow-ups only.</p>` : ""}
      <section class="card cal">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="cal-dow">${d}</div>`).join("")}
        ${cells}
      </section>
      ${lateFu.length ? `<h2 class="h">Overdue follow-ups <span class="muted">(${lateFu.length})</span></h2><div class="card agenda">${groupRows(lateFu)}</div>` : ""}
      <h2 class="h">Upcoming <span class="muted">(${ahead.length})</span></h2>
      <div class="card agenda">${ahead.length ? groupRows(ahead) : `<p class="muted pad">Nothing scheduled.</p>`}</div>`;
    document.getElementById("cal-prev").onclick = () => { calMonth = shift(-1); calendarView(); };
    document.getElementById("cal-next").onclick = () => { calMonth = shift(1); calendarView(); };
    document.getElementById("cal-today").onclick = () => { calMonth = t.slice(0, 7); calendarView(); };
  }

  async function leadsView() {
    const { data: leads, error } = await sb.from("leads").select("*").order("updated_at", { ascending: false });
    if (error) return fail(error);
    const uniq = (k) => [...new Set(leads.map((l) => l[k]).filter(usable))].sort();
    const sel = (id, label, opts) => `<select id="${id}"><option value="">${label}</option>${opts.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
    app.innerHTML = `
      <div class="filters">
        <input id="q" type="search" placeholder="Search business, owner, phone…">
        ${sel("f-status", "All call statuses", CALL_STATUSES)}
        ${sel("f-list", "Lists A + B", ["A", "B"])}
        ${sel("f-lead", "Qualified + Missing", LEAD_STATUSES)}
        ${sel("f-trade", "All industries", uniq("trade"))}
        ${sel("f-city", "All cities", uniq("city"))}
      </div>
      <p class="muted small" id="count"></p>
      <div class="list" id="rows"></div>
      <p class="pad"><button class="btn ghost" id="export">Export CSV</button></p>`;
    const ids = ["q", "f-status", "f-list", "f-lead", "f-trade", "f-city"];
    const draw = () => {
      const [q, st, li, ls, tr, ci] = ids.map((i) => document.getElementById(i).value.toLowerCase());
      const rows = leads.filter((l) =>
        (!q || [l.business_name, l.owner_name, l.owner_phone, l.business_phone, l.owner_email, l.city, l.trade].join(" ").toLowerCase().includes(q)) &&
        (!st || (l.call_status || "").toLowerCase() === st) && (!li || (l.list || "").toLowerCase() === li) &&
        (!ls || (l.lead_status || "").toLowerCase() === ls) && (!tr || (l.trade || "").toLowerCase() === tr) && (!ci || (l.city || "").toLowerCase() === ci));
      document.getElementById("count").textContent = `${rows.length} of ${leads.length} leads`;
      document.getElementById("rows").innerHTML = rows.map(leadRow).join("") || `<p class="muted pad">No matches.</p>`;
    };
    ids.forEach((i) => document.getElementById(i).addEventListener("input", draw));
    document.getElementById("export").onclick = () => {
      const csv = Papa.unparse(leads.map(({ id, ...rest }) => rest));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `awd-leads-${today()}.csv`; a.click();
    };
    draw();
  }

  function input([key, label, type, required], lead) {
    const v = lead[key] ?? "";
    if (Array.isArray(type)) {
      const opts = type.includes(v) || !v ? type : [...type, v];
      return `<label>${label}<select name="${key}">${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    }
    if (type === "textarea") return `<label class="wide">${label}<textarea name="${key}" rows="2">${esc(v)}</textarea></label>`;
    return `<label>${label}<input name="${key}" type="${type || "text"}" value="${esc(v)}" ${required ? "required" : ""} ${type === "number" ? 'step="any"' : ""}></label>`;
  }

  function formHtml(lead) {
    return FIELDS.map(([title, fs]) => `<fieldset><legend>${title}</legend><div class="grid">${fs.map((f) => input(f, lead)).join("")}</div></fieldset>`).join("");
  }

  function readForm(form) {
    const out = {};
    FIELDS.forEach(([, fs]) => fs.forEach(([key, , type]) => {
      let v = form.elements[key].value.trim();
      if (type === "number") v = v === "" ? null : Number(v);
      else if (type === "date") v = v || null;
      out[key] = v === "" ? null : v;
    }));
    return out;
  }

  function newView() {
    app.innerHTML = `<form class="card pad" id="f"><h2>Add a lead</h2>${formHtml({ call_status: "New", lead_status: "Qualified" })}<button class="btn">Save lead</button></form>`;
    document.getElementById("f").onsubmit = async (e) => {
      e.preventDefault();
      const { data, error } = await sb.from("leads").insert(readForm(e.target)).select().single();
      if (error) return fail(error);
      toast("Lead added"); location.hash = "#/lead/" + data.id;
    };
  }

  async function leadView(id) {
    const [{ data: l, error }, { data: acts }, { data: meets, error: mErr }] = await Promise.all([
      sb.from("leads").select("*").eq("id", id).single(),
      sb.from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      sb.from("meetings").select("*").eq("lead_id", id).order("starts_at", { ascending: true })
    ]);
    if (error) return fail(error);
    const nowIso = new Date().toISOString();
    const upcoming = (meets || []).filter((m) => m.status === "scheduled");
    const pastMeets = (meets || []).filter((m) => m.status !== "scheduled").slice(-3).reverse();
    // Dex requests for this business (the Designs app's queue), newest first, to show what's already asked for.
    const sameBusiness = l.business_name.replace(/[\\%_]/g, "\\$&"); // exact name, case-insensitive (ilike with wildcards escaped)
    const { data: dexReqs } = await sb.from("design_requests").select("id, status, created_at").ilike("business", sameBusiness).order("created_at", { ascending: false });
    const dexOpen = (dexReqs || []).find((r) => r.status !== "done"), dexDone = (dexReqs || []).find((r) => r.status === "done");
    const phones = [[l.owner_phone, `Call ${usable(l.owner_name) ? l.owner_name.split(" (")[0] : "owner"}`], [l.business_phone, "Call business"]].filter(([p]) => usable(p));
    app.innerHTML = `
      <section class="card pad">
        <div class="head">
          <div>
            <h2>${esc(l.business_name)}</h2>
            <p class="muted">${esc([l.trade, l.city].filter(usable).join(" · "))}</p>
            <p>${usable(l.owner_name) ? `<b>${esc(l.owner_name)}</b>${usable(l.owner_title) ? ", " + esc(l.owner_title) : ""}` : `<span class="pill warn">No owner name</span>`}</p>
          </div>
          <div class="pills">
            <span class="pill ${statusClass(l.call_status)}">${esc(l.call_status)}</span>
            ${l.list ? `<span class="pill list">List ${esc(l.list)} · Package ${esc(l.list)}</span>` : ""}
            ${l.lead_status === "Missing Info" ? `<span class="pill warn">Missing: ${esc(l.missing || "info")}</span>` : ""}
          </div>
        </div>
        <div class="actions">
          ${phones.map(([p, t]) => `<a class="btn" href="tel:${esc(tel(p))}">📞 ${esc(t)} · ${esc(p)}</a>`).join("")}
          ${usable(l.owner_email) ? `<a class="btn ghost" href="mailto:${esc(l.owner_email)}">✉ ${esc(l.owner_email)}${l.owner_email_status === "Inferred" ? " (inferred)" : ""}</a>` : ""}
          ${!usable(l.owner_email) || l.owner_email_status === "Inferred" ? `<button type="button" class="btn ghost" id="add-email-btn">＋ ${usable(l.owner_email) ? "Add confirmed email" : "Add email"}</button>
          <form id="add-email" class="add-email" hidden>
            <input id="add-email-input" type="email" required placeholder="name@business.com" autocomplete="off" aria-label="Email address">
            <button class="btn">Save</button>
            <button type="button" class="btn ghost" id="add-email-cancel">Cancel</button>
          </form>` : ""}
          ${usable(l.website) ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(/^https?:/i.test(l.website) ? l.website : "https://" + l.website)}">🌐 Website</a>` : ""}
          ${l.call_status === "Disqualified"
            ? `<button type="button" class="btn ghost" id="requal-btn">↩ Restore lead</button>`
            : `<button type="button" class="btn ghost" id="dq-btn">🚫 Disqualify</button>
          <form id="dq-form" class="add-email" hidden>
            <select id="dq-reason" required aria-label="Reason"><option value="">Reason (required)…</option>${DQ_REASONS.map((r) => `<option>${r}</option>`).join("")}</select>
            <input id="dq-note" placeholder="Details (optional)" autocomplete="off" aria-label="Details">
            <button class="btn danger">Disqualify</button>
            <button type="button" class="btn ghost" id="dq-cancel">Cancel</button>
          </form>`}
        </div>
        ${usable(l.rapport_note) ? `<p class="rapport"><b>Opener:</b> ${esc(l.rapport_note)}</p>` : ""}
        ${usable(l.website_notes) ? `<p class="muted"><b>Website:</b> ${esc(l.website_status || "")} ${esc(l.website_notes)}</p>` : ""}
      </section>

      <section class="card pad meets">
        <div class="meets-head"><h3>📅 Meetings</h3>${mErr ? "" : `<button type="button" class="btn" id="meet-btn">Book a meeting</button>`}</div>
        ${mErr ? `<p class="muted small">Meetings aren't set up yet: run <code>meetings.sql</code> in Supabase.</p>` : `
        <form id="meet-form" class="meet-form" hidden>
          <div class="grid">
            <label>Date<input type="date" name="date" required value="${today()}"></label>
            <label>Time<input type="time" name="time" required value="10:00" step="900"></label>
            <label>Length<select name="duration">${[15, 30, 45, 60, 90].map((n) => `<option value="${n}" ${n === 30 ? "selected" : ""}>${n} min</option>`).join("")}</select></label>
            <label>Type<select name="kind">${MEETING_KINDS.map((k) => `<option>${k}</option>`).join("")}</select></label>
            <label class="wide">Where <span class="muted small">(address, video link or phone; optional)</span><input name="location" autocomplete="off" placeholder="${esc(usable(l.business_address) ? l.business_address : "Zoom / Google Meet link, address or phone")}"></label>
            <label class="wide">Notes<textarea name="note" rows="2" placeholder="What's the meeting for?"></textarea></label>
          </div>
          <div class="row-btns"><button class="btn">Book meeting</button><button type="button" class="btn ghost" id="meet-cancel">Cancel</button></div>
        </form>
        ${upcoming.length ? upcoming.map((m) => `<div class="meet ${m.starts_at < nowIso ? "late" : ""}">
            <div><b>${MEETING_ICON[m.kind] || "📅"} ${esc(fmtMeeting(m))}</b> · ${esc(m.kind)} · ${m.duration_min} min${m.starts_at < nowIso ? ` <span class="pill warn">Past, not marked done</span>` : ""}
              ${m.location ? `<div class="muted small">${/^https?:\/\//i.test(m.location) ? `<a href="${esc(m.location)}" target="_blank" rel="noopener">${esc(m.location)}</a>` : esc(m.location)}</div>` : ""}
              ${m.note ? `<div class="small">${esc(m.note)}</div>` : ""}</div>
            <div class="meet-btns"><a class="btn ghost small" target="_blank" rel="noopener" href="${esc(gcalLink(m, l))}">+ Google Calendar</a>
              <button type="button" class="btn ghost small" data-meet-done="${m.id}">✓ Done</button><button type="button" class="btn ghost small" data-meet-cancel="${m.id}">Cancel</button></div>
          </div>`).join("") : `<p class="muted small">No meetings booked.</p>`}
        ${pastMeets.length ? `<p class="muted small" style="margin-top:8px">Earlier: ${pastMeets.map((m) => `${esc(fmtMeeting(m))} (${m.status === "done" ? "done" : "canceled"})`).join(" · ")}</p>` : ""}`}
      </section>

      ${(window.AWD_PAYMENT_LINKS || []).length ? `<section class="card pad pay">
        <h3>💳 Send payment link</h3>
        <div class="pay-row">
          <select id="pay-pkg" aria-label="Package">${window.AWD_PAYMENT_LINKS.map((p) => `<option value="${p.key}" ${p.key === (l.list === "B" ? "website_upgrade" : "new_website") ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>
          <button type="button" class="btn" id="pay-copy">Copy links</button>
          ${usable(phones[0] && phones[0][0]) ? `<a class="btn ghost" id="pay-text" href="#">Text it</a>` : ""}
          ${usable(l.owner_email) && l.owner_email_status !== "Inferred" ? `<a class="btn ghost" id="pay-email" href="#">Email it (Gmail)</a>` : `<button type="button" class="btn ghost" id="pay-add-email">＋ Add email to send it</button>`}
        </div>
        <p class="muted small" id="pay-detail"></p>
        <p class="muted small">They pay on Stripe's secure page, by card (+3% fee) or from their bank account (no fee). You never see their card or bank details. Bank payments take a few business days to clear.</p>
      </section>` : ""}

      <form class="card pad" id="log">
        <h3>Log a call or note</h3>
        <div class="grid">
          <label>Type<select name="kind">${KINDS.map((k) => `<option>${k}</option>`).join("")}</select></label>
          <label>Outcome<select name="outcome">${OUTCOMES.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}</select></label>
          <label>New call status<select name="call_status">${[...CALL_STATUSES, NO_ENGLISH].map((s) => `<option ${s === (l.call_status === "New" ? "Called" : l.call_status) ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label>Follow up on<input type="date" name="follow_up_date" value="${esc(l.follow_up_date || "")}"></label>
          <label class="wide">Notes<textarea name="note" rows="3" placeholder="What happened? What's next?"></textarea></label>
        </div>
        <button class="btn">Save</button>
      </form>

      <section class="card pad">
        <h3>History</h3>
        ${(acts || []).map((a) => `<div class="act"><div class="muted small">${fmtTime(a.created_at)} · ${esc(a.kind)}${a.outcome ? " · " + esc(a.outcome) : ""}</div><div>${esc(a.note || "").replace(/\n/g, "<br>")}</div></div>`).join("") || `<p class="muted">No activity yet.</p>`}
      </section>

      <details class="card pad"><summary><b>Edit all details</b></summary>
        <form id="edit">${formHtml(l)}<div class="row-btns"><button class="btn">Save changes</button><button type="button" class="btn danger" id="del">Delete lead</button></div></form>
      </details>

      <section class="card pad dex">
        <h3>🎨 Free design by Dex</h3>
        ${dexOpen
          ? `<p><b>${dexOpen.status === "in_progress" ? "Dex is building it" : "Queued for Dex"}</b> since ${fmtTime(dexOpen.created_at)}. Tell Claude “Dex, check the queue” to start it. Track it in <a href="/designs/">Designs</a>.</p>`
          : `${dexDone ? `<p class="muted small">Dex already built one (requested ${fmtTime(dexDone.created_at)}). See <a href="/designs/">Designs</a>.</p>` : ""}
            <p class="muted small">Adds ${esc(l.business_name)} to Dex's queue with this lead's details. Dex never contacts the business.</p>
            <button type="button" class="btn" id="dex-btn">${dexDone ? "Have Dex build another design" : "Have Dex build a free design"}</button>`}
      </section>`;

    // ---------- book / finish / cancel a meeting ----------
    const meetBtn = document.getElementById("meet-btn"), meetForm = document.getElementById("meet-form");
    if (meetBtn && meetForm) {
      meetBtn.onclick = () => { meetBtn.hidden = true; meetForm.hidden = false; meetForm.scrollIntoView({ block: "center", behavior: "smooth" }); };
      document.getElementById("meet-cancel").onclick = () => { meetForm.hidden = true; meetBtn.hidden = false; };
      meetForm.onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(meetForm);
        const start = new Date(`${f.get("date")}T${f.get("time")}`);
        if (isNaN(start)) return toast("Pick a date and time", true);
        const m = { lead_id: id, starts_at: start.toISOString(), duration_min: +f.get("duration") || 30, kind: f.get("kind"),
          location: f.get("location").trim() || null, note: f.get("note").trim() || null };
        const { error: e1 } = await sb.from("meetings").insert(m);
        if (e1) return fail(e1);
        await sb.from("activities").insert({ lead_id: id, kind: "Note", note: `Meeting booked: ${fmtMeeting(m)}, ${m.kind}, ${m.duration_min} min${m.location ? ` (${m.location})` : ""}${m.note ? `\n${m.note}` : ""}` });
        toast(`Meeting booked for ${fmtMeeting(m)}`); leadView(id);
      };
    }
    app.querySelectorAll("[data-meet-done], [data-meet-cancel]").forEach((b) => b.onclick = async () => {
      const done = !!b.dataset.meetDone, mid = b.dataset.meetDone || b.dataset.meetCancel;
      const m = (meets || []).find((x) => x.id === mid);
      if (!done && !confirm(`Cancel the meeting on ${fmtMeeting(m)}?`)) return;
      const { error: e1 } = await sb.from("meetings").update({ status: done ? "done" : "canceled" }).eq("id", mid);
      if (e1) return fail(e1);
      await sb.from("activities").insert({ lead_id: id, kind: "Note", note: `Meeting ${done ? "held" : "canceled"}: ${fmtMeeting(m)}, ${m.kind}` });
      toast(done ? "Marked done" : "Meeting canceled"); leadView(id);
    });

    // ---------- Have Dex build a free design: queue a design_requests row from this lead ----------
    const dexBtn = document.getElementById("dex-btn");
    if (dexBtn) dexBtn.onclick = async () => {
      if (!confirm(`Have Dex build a free website design for ${l.business_name}?`)) return;
      dexBtn.disabled = true;
      // Re-check so a second tap (or another device) can't queue it twice.
      const { data: open } = await sb.from("design_requests").select("id").ilike("business", sameBusiness).neq("status", "done");
      if (open && open.length) { toast("Already queued for Dex"); return leadView(id); }
      const pick = (...v) => v.filter(usable).join(" / ");
      const extra = [`From CRM lead ${location.origin}/#/lead/${l.id}`, usable(l.city) && `City: ${l.city}`, usable(l.business_address) && `Address: ${l.business_address}`,
        usable(l.list) && `List ${l.list}`, usable(l.website_status) && `Website: ${l.website_status}`, usable(l.website_notes) && `Website notes: ${l.website_notes}`,
        usable(l.rapport_note) && `Rapport: ${l.rapport_note}`, l.google_rating && `Google: ${l.google_rating}★ (${l.review_count || 0} reviews)`].filter(Boolean).join("\n");
      const { error: e1 } = await sb.from("design_requests").insert({
        business: l.business_name, contact: usable(l.owner_name) ? l.owner_name : null,
        phone: pick(l.owner_phone, l.business_phone) || null, email: usable(l.owner_email) ? l.owner_email : null,
        industry: usable(l.trade) ? l.trade : null, links: pick(l.website, l.facebook, l.linkedin) || null, style: extra
      });
      if (e1) { dexBtn.disabled = false; return fail(e1); }
      await sb.from("activities").insert({ lead_id: id, kind: "Note", note: "Asked Dex to build a free design (queued in Designs)" });
      toast("Queued for Dex. Tell Claude “Dex, check the queue”."); leadView(id);
    };

    // New leads default to "Called" in the Log a call form, since logging a call is what moves them from Ready to Called.
    let statusTouched = false;
    document.querySelector('#log [name="call_status"]').onchange = () => { statusTouched = true; };
    document.getElementById("log").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const note = f.get("note").trim(), outcome = f.get("outcome");
      let status = f.get("call_status"), fu = f.get("follow_up_date") || null;
      // They asked not to be called again → disqualify the company (reason line first, so the Disqualified tab shows it).
      const dnc = (outcome === "Asked not to call" || status === "Do Not Call") && l.call_status !== "Disqualified";
      if (dnc) { status = "Disqualified"; fu = null; }
      // They don't speak English → disqualify the company with that reason.
      const noEnglish = !dnc && status === NO_ENGLISH;
      if (noEnglish) { status = "Disqualified"; fu = null; }
      const dqLine = dnc ? `Disqualified: ${DNC_REASON}` : noEnglish && l.call_status !== "Disqualified" ? `Disqualified: ${NO_ENGLISH}` : "";
      // A logged call means the lead has been called: never leave it "New" (that kept it in Ready instead of Called).
      // A text, email or note on a New lead keeps it New unless a status was picked on purpose.
      if (f.get("kind") === "Call" && status === "New") status = "Called";
      else if (f.get("kind") !== "Call" && l.call_status === "New" && status === "Called" && !statusTouched) status = "New";
      const statusChanged = status !== l.call_status;
      const parts = [dqLine, note, statusChanged ? `Status: ${l.call_status} → ${status}` : ""].filter(Boolean);
      if (!parts.length && !outcome && fu === (l.follow_up_date || null)) return toast("Nothing to save", true);
      if (parts.length || outcome) {
        const { error: e1 } = await sb.from("activities").insert({ lead_id: id, kind: f.get("kind"), outcome: outcome || null, note: parts.join("\n") });
        if (e1) return fail(e1);
      }
      const { error: e2 } = await sb.from("leads").update({ call_status: status, follow_up_date: fu }).eq("id", id);
      if (e2) return fail(e2);
      toast(dnc ? `${l.business_name} disqualified (asked not to be called)` : dqLine ? `${l.business_name} disqualified (does not speak English)` : "Saved"); leadView(id);
    };
    // ---------- disqualify / restore ----------
    const dqBtn = document.getElementById("dq-btn"), dqForm = document.getElementById("dq-form");
    if (dqBtn) {
      dqBtn.onclick = () => { dqBtn.hidden = true; dqForm.hidden = false; dqForm.scrollIntoView({ block: "center", behavior: "smooth" }); };
      document.getElementById("dq-cancel").onclick = () => { dqForm.hidden = true; dqBtn.hidden = false; };
      const dqSel = document.getElementById("dq-reason"), dqNote = document.getElementById("dq-note");
      // "Other" needs the details typed in, so every disqualify has a real reason.
      dqSel.onchange = () => { dqNote.required = dqSel.value === "Other"; dqNote.placeholder = dqNote.required ? "Details (required for Other)" : "Details (optional)"; };
      dqForm.onsubmit = async (e) => {
        e.preventDefault();
        const note = dqNote.value.trim();
        if (!dqSel.value) return toast("Pick a reason first", true);
        if (dqSel.value === "Other" && !note) { dqNote.focus(); return toast("Type the reason", true); }
        const reason = [dqSel.value, note].filter(Boolean).join(" · ");
        if (await disqualify(l, reason)) leadView(id);
      };
    }
    const rq = document.getElementById("requal-btn");
    if (rq) rq.onclick = async () => { rq.disabled = true; if (await requalify(l)) leadView(id); else rq.disabled = false; };

    // ---------- add / correct the owner's email ----------
    const addBtn = document.getElementById("add-email-btn"), addForm = document.getElementById("add-email");
    if (addBtn && addForm) {
      const openAdd = () => { addBtn.hidden = true; addForm.hidden = false; const i = document.getElementById("add-email-input"); i.focus(); addForm.scrollIntoView({ block: "center", behavior: "smooth" }); };
      addBtn.onclick = openAdd;
      const pa = document.getElementById("pay-add-email"); if (pa) pa.onclick = openAdd;
      document.getElementById("add-email-cancel").onclick = () => { addForm.hidden = true; addBtn.hidden = false; };
      addForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("add-email-input").value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("That doesn't look like an email address", true);
        const before = usable(l.owner_email) ? l.owner_email : "none";
        const { error: e1 } = await sb.from("leads").update({ owner_email: email, owner_email_status: "Verified" }).eq("id", id);
        if (e1) return fail(e1);
        await sb.from("activities").insert({ lead_id: id, kind: "Note", note: `Email added by hand: ${email} (was: ${before})` });
        toast("Email saved"); leadView(id);
      };
    }

    // ---------- payment link (Stripe) ----------
    const payBox = document.getElementById("pay-pkg");
    if (payBox) {
      const pkg = () => window.AWD_PAYMENT_LINKS.find((p) => p.key === payBox.value);
      const first = usable(l.owner_name) ? l.owner_name.split(" ")[0].split("(")[0].trim() : "there";
      // Every package has a card link (3% fee) and a no-fee bank link; the customer picks.
      const links = () => pkg().bank_url ? `Pay by card (3% card fee): ${pkg().url}
Pay from your bank account (no fee): ${pkg().bank_url}` : pkg().url;
      const msg = () => `Hi ${first}, it's Johnny with Affordable Web Designs. Here are the secure links to get your website going (${pkg().label}: ${pkg().detail}).
${links()}`;
      const showDetail = () => { document.getElementById("pay-detail").textContent = pkg().detail + (pkg().fee_line ? ". " + pkg().fee_line : ""); };
      const logSent = async (how) => {
        await sb.from("activities").insert({ lead_id: id, kind: how === "Email" ? "Email" : how === "Text" ? "Text" : "Note", note: `Payment link ${how === "Copied" ? "copied" : how === "Email" ? "opened in Gmail to send" : "opened in a text to send"}: ${pkg().label}, ${pkg().detail}` });
      };
      payBox.onchange = showDetail; showDetail();
      document.getElementById("pay-copy").onclick = async () => {
        try { await navigator.clipboard.writeText(links()); toast(pkg().bank_url ? "Card + bank links copied" : "Payment link copied"); } catch (e) { prompt("Copy this:", links()); }
        await logSent("Copied");
      };
      const t = document.getElementById("pay-text");
      if (t) t.onclick = async (e) => { e.preventDefault(); await logSent("Text"); location.href = `sms:${tel(phones[0][0])}?&body=${encodeURIComponent(msg())}`; };
      const m = document.getElementById("pay-email");
      // Branded email: preview, then copy + open a Gmail draft from the AWD account (payemail.js).
      if (m) m.onclick = (e) => {
        e.preventDefault();
        window.AWDPayEmail({ to: l.owner_email, first, business: usable(l.business_name) ? l.business_name : "", pkg: pkg(), onSent: () => logSent("Email") });
      };
    }

    document.getElementById("edit").onsubmit = async (e) => {
      e.preventDefault();
      const { error: e3 } = await sb.from("leads").update(readForm(e.target)).eq("id", id);
      if (e3) return fail(e3);
      toast("Changes saved"); leadView(id);
    };
    document.getElementById("del").onclick = async () => {
      if (!confirm(`Delete ${l.business_name} and its history? This can't be undone.`)) return;
      const { error: e4 } = await sb.from("leads").delete().eq("id", id);
      if (e4) return fail(e4);
      toast("Lead deleted"); location.hash = "#/leads";
    };
  }

  function importView() {
    app.innerHTML = `
      <section class="card pad narrow">
        <h2>Import Abby's call list</h2>
        <p class="muted">Choose <b>List A - No Website.csv</b> or <b>List B - Has Website.csv</b> from <code>Documents\\AWD\\Abby\\Call Lists</code>. Leads already in the CRM (same business name and phone) are skipped.</p>
        <input type="file" id="file" accept=".csv">
        <div id="preview"></div>
      </section>`;
    document.getElementById("file").onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      Papa.parse(file, {
        header: true, skipEmptyLines: true, complete: async (res) => {
          const rows = res.data.map((r) => {
            const o = {}; let notes = "";
            for (const [col, val] of Object.entries(r)) {
              const key = CSV_MAP[col.trim()]; if (!key) continue;
              let v = (val ?? "").trim();
              if (key === "_call_notes") { notes = v; continue; }
              if (["google_rating", "review_count"].includes(key)) v = isNaN(parseFloat(v)) ? null : (key === "review_count" ? parseInt(v, 10) : parseFloat(v));
              else if (key === "date_researched") v = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
              else if (v === "") v = null;
              o[key] = v;
            }
            if (!o.call_status) o.call_status = "New";
            return { row: o, notes };
          }).filter((x) => x.row.business_name);
          const { data: existing, error } = await sb.from("leads").select("business_name,business_phone,owner_phone");
          if (error) return fail(error);
          const seen = new Set(existing.map((x) => slug(x.business_name) + "|" + tel(x.owner_phone || x.business_phone)));
          const fresh = rows.filter((x) => !seen.has(slug(x.row.business_name) + "|" + tel(x.row.owner_phone || x.row.business_phone)));
          document.getElementById("preview").innerHTML = `
            <p><b>${rows.length}</b> leads in file · <b>${fresh.length}</b> new · ${rows.length - fresh.length} already in CRM</p>
            ${fresh.length ? `<button class="btn" id="go">Import ${fresh.length} leads</button>` : ""}`;
          const go = document.getElementById("go");
          if (go) go.onclick = async () => {
            go.disabled = true; go.textContent = "Importing…";
            for (const x of fresh) {
              const { data, error: e1 } = await sb.from("leads").insert(x.row).select("id").single();
              if (e1) return fail(e1);
              if (x.notes) await sb.from("activities").insert({ lead_id: data.id, kind: "Note", note: "Imported call notes: " + x.notes });
            }
            toast(`Imported ${fresh.length} leads`); location.hash = "#/leads";
          };
        }
      });
    };
  }

  // ---------- router ----------
  async function route() {
    if (!(await session())) return loginView();
    nav.hidden = false;
    const h = location.hash.replace(/^#/, "") || "/";
    nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + h || (h.startsWith("/lead/") && a.getAttribute("href") === "#/leads")));
    app.innerHTML = `<p class="muted pad">Loading…</p>`;
    refreshInquiryCount().catch(() => {});
    try {
      if (h === "/") await todayView();
      else if (h === "/inquired") await inquiredView();
      else if (["/ready", "/missing", "/called", "/disqualified"].includes(h)) await tabView(h.slice(1));
      else if (h === "/calendar") await calendarView();
      else if (h === "/script") scriptView();
      else if (h === "/leads") await leadsView();
      else if (h === "/new") newView();
      else if (h === "/import") importView();
      else if (h.startsWith("/lead/")) await leadView(h.slice(6));
      else location.hash = "#/";
    } catch (e) { fail(e); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();

  // ---------- installable app (Chrome/Edge "Install app") ----------
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
  let installPrompt = null;
  const installBtn = document.getElementById("install");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; installBtn.hidden = false; });
  installBtn.onclick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null; installBtn.hidden = true;
  };
  window.addEventListener("appinstalled", () => { installBtn.hidden = true; toast("AWD CRM installed"); });
})();
