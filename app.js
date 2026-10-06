(() => {
  const cfg = window.AWD_CONFIG || {};
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith("PASTE")) {
    app.innerHTML = `<div class="card pad narrow"><h2>Almost ready</h2><p>Add your Supabase project URL and anon key to <code>config.js</code>.</p></div>`;
    return;
  }
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const CALL_STATUSES = ["New", "Called", "Callback", "Design Sent", "Follow Up", "Won", "Not Interested", "Do Not Call"];
  const LEAD_STATUSES = ["Qualified", "Missing Info"];
  const KINDS = ["Call", "Text", "Email", "Design sent", "Note"];
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
    ["Business", [["business_name", "Business name", "text", true], ["trade", "Trade"], ["city", "City"], ["business_address", "Address"], ["business_phone", "Business phone", "tel"]]],
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
    const overdue = l.follow_up_date && l.follow_up_date < today() && !["Won", "Not Interested", "Do Not Call"].includes(l.call_status);
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

  async function todayView() {
    const { data: leads, error } = await sb.from("leads").select("*").order("follow_up_date", { ascending: true, nullsFirst: false });
    if (error) return fail(error);
    const open = (l) => !["Won", "Not Interested", "Do Not Call"].includes(l.call_status);
    const due = leads.filter((l) => open(l) && l.follow_up_date && l.follow_up_date <= today());
    const fresh = leads.filter((l) => l.call_status === "New");
    const count = (s) => leads.filter((l) => l.call_status === s).length;
    app.innerHTML = `
      <section class="stats">
        ${[["Total leads", leads.length], ["New", count("New")], ["Design sent", count("Design Sent")], ["Follow up", count("Follow Up") + count("Callback")], ["Won", count("Won")]]
          .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join("")}
      </section>
      <h2 class="h">Due today or overdue <span class="muted">(${due.length})</span></h2>
      <div class="list">${due.map(leadRow).join("") || `<p class="muted pad">Nothing due. Nice.</p>`}</div>
      <h2 class="h">New, not called yet <span class="muted">(${fresh.length})</span></h2>
      <div class="list">${fresh.slice(0, 25).map(leadRow).join("") || `<p class="muted pad">No new leads. <a href="#/import">Import Abby's list</a> or <a href="#/new">add one</a>.</p>`}</div>`;
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
        ${sel("f-trade", "All trades", uniq("trade"))}
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
    const [{ data: l, error }, { data: acts }] = await Promise.all([
      sb.from("leads").select("*").eq("id", id).single(),
      sb.from("activities").select("*").eq("lead_id", id).order("created_at", { ascending: false })
    ]);
    if (error) return fail(error);
    const phones = [[l.owner_phone, `Call ${l.owner_name || "owner"}`], [l.business_phone, "Call business"]].filter(([p]) => usable(p));
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
          ${usable(l.website) ? `<a class="btn ghost" target="_blank" rel="noopener" href="${esc(/^https?:/i.test(l.website) ? l.website : "https://" + l.website)}">🌐 Website</a>` : ""}
        </div>
        ${usable(l.rapport_note) ? `<p class="rapport"><b>Opener:</b> ${esc(l.rapport_note)}</p>` : ""}
        ${usable(l.website_notes) ? `<p class="muted"><b>Website:</b> ${esc(l.website_status || "")} ${esc(l.website_notes)}</p>` : ""}
      </section>

      <form class="card pad" id="log">
        <h3>Log a call or note</h3>
        <div class="grid">
          <label>Type<select name="kind">${KINDS.map((k) => `<option>${k}</option>`).join("")}</select></label>
          <label>Outcome<select name="outcome">${OUTCOMES.map((o) => `<option value="${o}">${o || "—"}</option>`).join("")}</select></label>
          <label>New call status<select name="call_status">${CALL_STATUSES.map((s) => `<option ${s === l.call_status ? "selected" : ""}>${s}</option>`).join("")}</select></label>
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
      </details>`;

    document.getElementById("log").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const note = f.get("note").trim(), outcome = f.get("outcome"), status = f.get("call_status"), fu = f.get("follow_up_date") || null;
      const statusChanged = status !== l.call_status;
      const parts = [note, statusChanged ? `Status: ${l.call_status} → ${status}` : ""].filter(Boolean);
      if (!parts.length && !outcome && fu === (l.follow_up_date || null)) return toast("Nothing to save", true);
      if (parts.length || outcome) {
        const { error: e1 } = await sb.from("activities").insert({ lead_id: id, kind: f.get("kind"), outcome: outcome || null, note: parts.join("\n") });
        if (e1) return fail(e1);
      }
      const { error: e2 } = await sb.from("leads").update({ call_status: status, follow_up_date: fu }).eq("id", id);
      if (e2) return fail(e2);
      toast("Saved"); leadView(id);
    };
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
    try {
      if (h === "/") await todayView();
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
})();
