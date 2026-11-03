// Campaigns tab: email campaigns to I Know Warehouses' HubSpot contacts.
// Pick an audience from HubSpot, write the email with merge fields, preview it, then send a capped, spaced-out
// batch each day through Resend (api/campaign-send.js). Opens/clicks/bounces come back from Resend's webhook,
// unsubscribes from the link in every email. Tables: campaigns.sql. Settings: Vercel environment variables.
// app.js calls AWDCampaigns.view(route, ctx) with its helpers (sb, app, esc, toast, fail, fmtTime, session).
(() => {
  const R = window.AWDCampaignRender;
  let ctx, config = null, configErr = "";
  const pct = (n, d) => d ? Math.round((n / d) * 100) + "%" : "—";
  const name = (c) => [c.firstname, c.lastname].filter(Boolean).join(" ") || "—";

  async function api(path, body) {
    const s = await ctx.session();
    const r = await fetch("/api/" + path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + (s && s.access_token), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ error: r.status === 404 ? "The Campaigns server functions aren't deployed yet." : `Server error (${r.status})` }));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  }
  async function loadConfig() {
    try { config = await api("hubspot?action=config"); configErr = ""; } catch (e) { config = null; configErr = e.message; }
    return config;
  }
  const renderOpts = (unsubUrl = "#unsubscribe-link") => ({ business: (config && config.business) || "I Know Warehouses", address: (config && config.address) || "[mailing address not set]", unsubUrl });
  const previewFrame = (mail) => `<div class="cm-preview">
      <div class="cm-prev-meta"><div><span class="muted">From</span> ${ctx.esc((config && config.from) || "[CAMPAIGN_FROM not set]")}</div><div><span class="muted">Subject</span> <b>${ctx.esc(mail.subject || "(no subject)")}</b></div></div>
      <iframe class="cm-prev-body" sandbox="" srcdoc="${ctx.esc(mail.html)}" title="Email preview"></iframe></div>`;

  function setupCard() {
    if (!config) return `<section class="card pad cm-setup"><h3>Setup</h3><p class="muted small">${ctx.esc(configErr || "Checking…")}</p></section>`;
    const item = (ok, label, hint) => `<li class="${ok ? "ok" : "todo"}"><span>${ok ? "✓" : "○"}</span><div><b>${label}</b>${hint ? `<div class="muted small">${hint}</div>` : ""}</div></li>`;
    return `<section class="card pad cm-setup">
      <div class="cm-setup-head"><h3>Setup</h3><span class="pill ${config.live ? "st-won" : "st-callback"}">${config.live ? "Live: emails really send" : "Dry run only: nothing is sent"}</span></div>
      <ul class="cm-check">
        ${item(config.hubspot, "HubSpot connected", config.hubspot ? "" : "Add HUBSPOT_TOKEN in Vercel (a HubSpot private app token).")}
        ${item(config.resend, "Resend connected", config.resend ? "" : "Add RESEND_API_KEY in Vercel.")}
        ${item(!!config.from, "Sending address", config.from ? ctx.esc(config.from) + (config.replyTo ? ` · replies to ${ctx.esc(config.replyTo)}` : "") : "Add CAMPAIGN_FROM, e.g. Your Name &lt;you@yourdomain.com&gt;.")}
        ${item(!!config.address, "Mailing address in every email", config.address ? ctx.esc(config.address) : "Add CAMPAIGN_MAILING_ADDRESS (required by law in marketing email).")}
        ${item(config.webhook, "Open / click / bounce tracking", config.webhook ? "" : "Add the Resend webhook and RESEND_WEBHOOK_SECRET.")}
      </ul></section>`;
  }

  // ---------- list of campaigns ----------
  async function listView() {
    const { sb, app, esc } = ctx;
    app.innerHTML = `<p class="muted pad">Loading…</p>`;
    const [{ data: camps, error }, { data: sends }, { data: unsubs }] = await Promise.all([
      sb.from("campaigns").select("*").order("created_at", { ascending: false }),
      sb.from("campaign_sends").select("campaign_id,status,sent_at,opened_at,clicked_at,replied_at,bounced_at,unsubscribed_at"),
      sb.from("email_unsubscribes").select("*").order("created_at", { ascending: false }),
      loadConfig()
    ]);
    if (error) {
      app.innerHTML = `<div class="page-head"><h2 class="h">Campaigns</h2></div>${setupCard()}
        <section class="card pad"><h3>One more step</h3><p>The campaign tables aren't in the database yet. In Supabase, open <b>SQL Editor</b>, paste in <code>campaigns.sql</code> from the CRM folder and click <b>Run</b>. Then reload.</p></section>`;
      return;
    }
    const stats = (id) => {
      const s = (sends || []).filter((x) => x.campaign_id === id);
      const sent = s.filter((x) => x.sent_at && ["scheduled", "sent", "bounced"].includes(x.status));
      return { total: s.length, sent: sent.length, queued: s.filter((x) => x.status === "queued").length,
        opened: s.filter((x) => x.opened_at).length, clicked: s.filter((x) => x.clicked_at).length, replied: s.filter((x) => x.replied_at).length,
        bounced: s.filter((x) => x.bounced_at).length, unsub: s.filter((x) => x.unsubscribed_at).length };
    };
    app.innerHTML = `
      <div class="page-head"><h2 class="h">Campaigns</h2><div class="page-tools"><a class="btn" href="#/campaigns/new">＋ New campaign</a></div></div>
      <p class="muted small tab-hint">Email campaigns to I Know Warehouses' HubSpot contacts. Each day's batch is capped and spaced out, and every email has an unsubscribe link and your mailing address.</p>
      ${setupCard()}
      <div class="card table-wrap"><table class="tbl">
        <thead><tr><th>Campaign</th><th>Status</th><th>Recipients</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Replied</th><th>Bounced</th><th>Unsub.</th></tr></thead>
        <tbody>${(camps || []).map((c) => { const s = stats(c.id); return `<tr>
          <td><a href="#/campaigns/${c.id}">${esc(c.name)}</a><div class="muted small">${esc(c.subject)}</div></td>
          <td><span class="pill cm-st-${esc(c.status)}">${esc(c.status === "draft" ? "Ready" : c.status === "sending" ? "Sending" : "Done")}</span></td>
          <td>${s.total}${s.queued ? `<div class="muted small">${s.queued} waiting</div>` : ""}</td><td>${s.sent}</td>
          <td>${s.opened} <span class="muted small">${pct(s.opened, s.sent)}</span></td><td>${s.clicked} <span class="muted small">${pct(s.clicked, s.sent)}</span></td>
          <td>${s.replied}</td><td>${s.bounced}</td><td>${s.unsub}</td></tr>`; }).join("")
          || `<tr><td colspan="9" class="muted pad">No campaigns yet. <a href="#/campaigns/new">Create the first one</a>.</td></tr>`}</tbody>
      </table></div>
      <details class="card pad"><summary><b>Never email</b> <span class="muted">(${(unsubs || []).length})</span></summary>
        <p class="muted small">Unsubscribes, hard bounces and spam complaints. These addresses are skipped in every campaign. Add one by hand when someone asks by phone or reply.</p>
        <form id="unsub-add" class="add-email"><input id="unsub-email" type="email" required placeholder="name@company.com" aria-label="Email address"><button class="btn small">Add</button></form>
        <div class="cm-unsubs">${(unsubs || []).map((u) => `<div><span>${esc(u.email)}</span><span class="muted small">${esc(u.source || "")} · ${ctx.fmtTime(u.created_at)}</span></div>`).join("")}</div>
      </details>`;
    document.getElementById("unsub-add").onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById("unsub-email").value.trim().toLowerCase();
      const { error: e1 } = await sb.from("email_unsubscribes").upsert({ email, source: "manual" }, { onConflict: "email" });
      if (e1) return ctx.fail(e1);
      ctx.toast(`${email} won't be emailed`); listView();
    };
  }

  // ---------- new campaign: audience → compose → preview → save ----------
  async function newView() {
    const { sb, app, esc } = ctx;
    app.innerHTML = `<p class="muted pad">Loading…</p>`;
    const [{ data: templates }, { data: unsubs }] = await Promise.all([
      sb.from("email_templates").select("*").order("name"), sb.from("email_unsubscribes").select("email"), loadConfig()]);
    const never = new Set((unsubs || []).map((u) => u.email));
    let opts = { lead_status: [] }, lists = [], contacts = [], picked = new Set();
    if (config && config.hubspot) {
      [opts, lists] = await Promise.all([api("hubspot?action=options").catch(() => ({ lead_status: [] })), api("hubspot?action=lists").then((r) => r.lists).catch(() => [])]);
    }
    app.innerHTML = `
      <div class="crumbs"><a href="#/campaigns">Campaigns</a> <span>›</span> New campaign</div>
      ${config && config.hubspot ? "" : setupCard()}
      <section class="card pad">
        <h3>1 · Who gets it</h3>
        <div class="tabs cm-mode" role="tablist"><button type="button" class="on" data-mode="filter">Filter contacts</button><button type="button" data-mode="list">A HubSpot list</button></div>
        <div id="by-filter" class="cm-filters">
          <fieldset class="cm-ls"><legend>Lead Status <span class="muted small">(none checked = any)</span></legend>
            ${(opts.lead_status || []).map((o) => `<label class="fu-check"><input type="checkbox" value="${esc(o.value)}">${esc(o.label)}</label>`).join("") || `<span class="muted small">Lead Status choices load once HubSpot is connected.</span>`}</fieldset>
          <div class="grid">
            <label>City<input id="f-city" placeholder="Deer Park"></label>
            <label>Industry contains<input id="f-ind" placeholder="Logistics"></label>
            <label>Company contains<input id="f-co" placeholder="Warehouse"></label>
          </div>
        </div>
        <div id="by-list" hidden><label>HubSpot list<select id="f-list"><option value="">Pick a list…</option>${lists.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}${l.size != null ? ` (${esc(l.size)})` : ""}</option>`).join("")}</select></label></div>
        <div class="row-btns" style="margin-top:12px"><button type="button" class="btn" id="find">Find contacts</button><span class="muted small" id="found"></span></div>
        <div id="who"></div>
      </section>

      <div class="cm-compose">
        <section class="card pad">
          <h3>2 · Write it</h3>
          <div class="grid">
            <label>Campaign name <span class="muted small">(only you see this)</span><input id="c-name" placeholder="Deer Park owners · Nov"></label>
            <label>Start from a template<select id="c-tpl"><option value="">—</option>${(templates || []).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
            <label class="wide">Subject<input id="c-subject" placeholder="Quick question about {company}"></label>
            <label class="wide">Email<textarea id="c-body" rows="12" placeholder="Hi {firstname|there},&#10;&#10;…"></textarea></label>
          </div>
          <div class="cm-chips"><span class="muted small">Insert:</span>${R.FIELDS.map((f) => `<button type="button" class="pill" data-field="${f}">{${f}}</button>`).join("")}
            <span class="muted small">Add a fallback for blanks: {firstname|there}</span></div>
          <div class="grid" style="margin-top:12px">
            <label>Emails per day (all campaigns)<input id="c-cap" type="number" min="1" max="200" value="40"></label>
            <label>Minutes between emails<input id="c-space" type="number" min="1" max="120" value="8"></label>
          </div>
          <p class="muted small">Every email ends with ${esc(renderOpts().business)}, your mailing address and an unsubscribe link. You don't need to add them.</p>
          <div class="row-btns"><button type="button" class="btn ghost" id="save-tpl">Save as template</button><button type="button" class="btn" id="save">Save campaign</button></div>
        </section>
        <section class="card pad">
          <div class="meets-head"><h3>Preview</h3><select id="p-who" aria-label="Preview as"><option value="">Sample contact</option></select></div>
          <p class="cm-warn" id="p-warn" hidden></p>
          <div id="prev"></div>
        </section>
      </div>`;

    const $ = (id) => document.getElementById(id);
    let mode = "filter";
    app.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
      mode = b.dataset.mode;
      app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
      $("by-filter").hidden = mode !== "filter"; $("by-list").hidden = mode !== "list";
    });
    const sample = { firstname: "Pat", lastname: "Sample", company: "Sample Logistics LLC", city: "Deer Park", jobtitle: "Owner" };
    const tpl = () => ({ subject: $("c-subject").value, body: $("c-body").value });
    const drawPreview = () => {
      const c = contacts.find((x) => x.id === $("p-who").value) || sample;
      const miss = R.missing(tpl(), c);
      $("p-warn").hidden = !miss.length;
      $("p-warn").textContent = miss.length ? `${name(c)} has no ${miss.join(", ")}. Add a fallback, e.g. {${miss[0]}|…}, or that spot will be blank.` : "";
      const blanks = contacts.filter((x) => picked.has(x.id) && R.missing(tpl(), x).length).length;
      if (blanks && !miss.length) { $("p-warn").hidden = false; $("p-warn").textContent = `${blanks} picked contact${blanks === 1 ? " is" : "s are"} missing a merge field. Add fallbacks, e.g. {firstname|there}.`; }
      $("prev").innerHTML = previewFrame(R.render(tpl(), c, renderOpts()));
    };
    ["c-subject", "c-body"].forEach((i) => $(i).addEventListener("input", drawPreview));
    $("p-who").onchange = drawPreview;
    app.querySelectorAll("[data-field]").forEach((b) => b.onclick = () => {
      const t = $("c-body"), ins = `{${b.dataset.field}}`, at = t.selectionStart ?? t.value.length;
      t.value = t.value.slice(0, at) + ins + t.value.slice(t.selectionEnd ?? at); t.focus(); t.selectionStart = t.selectionEnd = at + ins.length; drawPreview();
    });
    $("c-tpl").onchange = () => {
      const t = (templates || []).find((x) => x.id === $("c-tpl").value); if (!t) return;
      $("c-subject").value = t.subject || ""; $("c-body").value = t.body || ""; drawPreview();
    };
    $("save-tpl").onclick = async () => {
      if (!$("c-subject").value.trim() && !$("c-body").value.trim()) return ctx.toast("Write the subject or email first", true);
      const n = prompt("Template name:", $("c-name").value || $("c-subject").value); if (!n) return;
      const { error } = await sb.from("email_templates").insert({ name: n.trim(), ...tpl() });
      if (error) return ctx.fail(error);
      ctx.toast("Template saved");
    };

    const drawWho = () => {
      const ok = contacts.filter((c) => !never.has(c.email.toLowerCase()));
      $("found").textContent = contacts.length ? `${contacts.length} found · ${picked.size} picked${contacts.length - ok.length ? ` · ${contacts.length - ok.length} on the never-email list` : ""}` : "";
      $("who").innerHTML = contacts.length ? `<div class="table-wrap cm-who"><table class="tbl">
        <thead><tr><th class="ck"><input type="checkbox" id="all" ${picked.size === ok.length ? "checked" : ""} aria-label="Pick all"></th><th>Name</th><th>Company</th><th>Email</th><th>City</th><th>Lead Status</th></tr></thead>
        <tbody>${contacts.map((c) => { const no = never.has(c.email.toLowerCase()); return `<tr class="${no ? "cm-off" : ""}">
          <td class="ck">${no ? "" : `<input type="checkbox" data-pick="${esc(c.id)}" ${picked.has(c.id) ? "checked" : ""} aria-label="Pick">`}</td>
          <td>${esc(name(c))}</td><td>${esc(c.company)}</td><td>${esc(c.email)}${no ? ` <span class="pill st-disqualified">Never email</span>` : ""}</td><td>${esc(c.city)}</td><td>${esc(c.hs_lead_status)}</td></tr>`; }).join("")}</tbody></table></div>`
        : `<p class="muted small">No contacts with an email address match.</p>`;
      const all = $("all");
      if (all) all.onchange = () => { picked = new Set(all.checked ? ok.map((c) => c.id) : []); drawWho(); };
      app.querySelectorAll("[data-pick]").forEach((cb) => cb.onchange = () => { cb.checked ? picked.add(cb.dataset.pick) : picked.delete(cb.dataset.pick); drawWho(); });
      $("p-who").innerHTML = `<option value="">Sample contact</option>` + contacts.filter((c) => picked.has(c.id)).slice(0, 200).map((c) => `<option value="${esc(c.id)}">${esc(name(c))} · ${esc(c.company || c.email)}</option>`).join("");
      drawPreview();
    };
    $("find").onclick = async () => {
      const b = $("find"); b.disabled = true; $("found").textContent = "Searching HubSpot…";
      try {
        const body = mode === "list" ? { list_id: $("f-list").value } : {
          lead_status: [...app.querySelectorAll(".cm-ls input:checked")].map((x) => x.value), city: $("f-city").value, industry: $("f-ind").value, company: $("f-co").value };
        if (mode === "list" && !body.list_id) throw new Error("Pick a list first");
        const r = await api("hubspot?action=contacts", body);
        contacts = r.contacts;
        picked = new Set(contacts.filter((c) => !never.has(c.email.toLowerCase())).map((c) => c.id));
        drawWho();
        if (r.capped) ctx.toast("Showing the first 1,000 contacts. Narrow the filters to see the rest.", true);
      } catch (e) { $("found").textContent = ""; ctx.fail(e); }
      b.disabled = false;
    };
    $("save").onclick = async () => {
      const t = tpl(), nm = $("c-name").value.trim() || t.subject.trim();
      if (!t.subject.trim() || !t.body.trim()) return ctx.toast("Write a subject and an email first", true);
      if (!picked.size) return ctx.toast("Find contacts and pick at least one", true);
      if (!confirm(`Save "${nm}" for ${picked.size} contact${picked.size === 1 ? "" : "s"}? Nothing is sent yet.`)) return;
      const audience = mode === "list" ? { list_id: $("f-list").value, list: $("f-list").selectedOptions[0].text } : {
        lead_status: [...app.querySelectorAll(".cm-ls input:checked")].map((x) => x.value), city: $("f-city").value, industry: $("f-ind").value, company: $("f-co").value };
      const { data: c, error } = await sb.from("campaigns").insert({ name: nm, ...t, audience, daily_cap: +$("c-cap").value || 40, spacing_min: +$("c-space").value || 8 }).select().single();
      if (error) return ctx.fail(error);
      const rows = contacts.filter((x) => picked.has(x.id)).map((x) => ({ campaign_id: c.id, contact_id: x.id, email: x.email.trim(),
        firstname: x.firstname || null, lastname: x.lastname || null, company: x.company || null, city: x.city || null, jobtitle: x.jobtitle || null }));
      const seen = new Set(), uniq = rows.filter((r) => !seen.has(r.email.toLowerCase()) && seen.add(r.email.toLowerCase()));
      for (let i = 0; i < uniq.length; i += 500) {
        const { error: e2 } = await sb.from("campaign_sends").insert(uniq.slice(i, i + 500));
        if (e2) return ctx.fail(e2);
      }
      ctx.toast("Campaign saved"); location.hash = "#/campaigns/" + c.id;
    };
    drawPreview();
  }

  // ---------- one campaign: stats, today's batch, recipients ----------
  async function detailView(id) {
    const { sb, app, esc } = ctx;
    app.innerHTML = `<p class="muted pad">Loading…</p>`;
    const [{ data: c, error }, { data: rows }] = await Promise.all([
      sb.from("campaigns").select("*").eq("id", id).single(),
      sb.from("campaign_sends").select("*").eq("campaign_id", id).order("created_at", { ascending: true }), loadConfig()]);
    if (error || !c) return ctx.fail(error || new Error("Campaign not found"));
    const sent = rows.filter((r) => r.sent_at && ["scheduled", "sent", "bounced"].includes(r.status));
    const n = (f) => rows.filter(f).length;
    const queued = n((r) => r.status === "queued");
    const tile = (label, v, sub) => `<div class="stat"><span>${label}</span><b>${v}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    const stPill = (r) => r.unsubscribed_at ? `<span class="pill st-disqualified">Unsubscribed</span>` : r.bounced_at ? `<span class="pill st-donotcall">Bounced</span>`
      : `<span class="pill cm-rs-${esc(r.status)}">${esc({ queued: "Waiting", scheduled: "Scheduled", sent: "Delivered", failed: "Failed", skipped: "Skipped" }[r.status] || r.status)}</span>`;
    app.innerHTML = `
      <div class="crumbs"><a href="#/campaigns">Campaigns</a> <span>›</span> ${esc(c.name)}</div>
      <div class="page-head"><div><h2 class="h">${esc(c.name)}</h2><p class="muted small" style="margin:2px 0 0">${esc(c.subject)}</p></div>
        <div class="page-tools"><button type="button" class="btn ghost" id="dry">Dry run today's batch</button><button type="button" class="btn" id="go">Send today's batch</button></div></div>
      ${config && !config.live ? `<p class="cm-warn">Dry run only: nothing is sent. Sending turns on when <code>CAMPAIGNS_LIVE</code> is set to <code>true</code> in Vercel.</p>` : configErr ? `<p class="cm-warn">${esc(configErr)}</p>` : ""}
      <section class="stats">
        ${tile("Recipients", rows.length, `${queued} waiting`)}${tile("Sent", sent.length, `${c.daily_cap}/day max · ${c.spacing_min} min apart`)}
        ${tile("Opened", n((r) => r.opened_at), pct(n((r) => r.opened_at), sent.length))}${tile("Clicked", n((r) => r.clicked_at), pct(n((r) => r.clicked_at), sent.length))}
        ${tile("Replied", n((r) => r.replied_at), pct(n((r) => r.replied_at), sent.length))}${tile("Bounced", n((r) => r.bounced_at))}${tile("Unsubscribed", n((r) => r.unsubscribed_at))}
      </section>
      <div id="batch"></div>
      <div class="card table-wrap"><table class="tbl">
        <thead><tr><th>Contact</th><th>Email</th><th>Status</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Replied</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${esc(name(r))}<div class="muted small">${esc(r.company || "")}</div></td><td>${esc(r.email)}${r.error ? `<div class="small" style="color:#B91C1C">${esc(r.error)}</div>` : ""}</td>
          <td>${stPill(r)}</td><td class="small">${r.sent_at ? ctx.fmtTime(r.sent_at) : "—"}</td>
          <td class="small">${r.opened_at ? ctx.fmtTime(r.opened_at) : "—"}</td><td class="small">${r.clicked_at ? ctx.fmtTime(r.clicked_at) : "—"}</td>
          <td class="small">${r.replied_at ? ctx.fmtTime(r.replied_at) : r.sent_at ? `<button type="button" class="btn ghost small" data-replied="${r.id}">Mark replied</button>` : "—"}</td></tr>`).join("")}</tbody>
      </table></div>
      <details class="card pad"><summary><b>Email content</b></summary>${previewFrame(R.render(c, rows[0] || {}, renderOpts()))}
        ${sent.length ? "" : `<div class="row-btns" style="margin-top:12px"><span class="muted small">Nothing has been sent from this campaign yet.</span><button type="button" class="btn danger small" id="del">Delete campaign</button></div>`}</details>`;
    const del = document.getElementById("del");
    if (del) del.onclick = async () => {
      if (!confirm(`Delete "${c.name}"? Nothing was sent, so nobody is affected.`)) return;
      const { error: e1 } = await sb.from("campaigns").delete().eq("id", id);
      if (e1) return ctx.fail(e1);
      ctx.toast("Campaign deleted"); location.hash = "#/campaigns";
    };
    app.querySelectorAll("[data-replied]").forEach((b) => b.onclick = async () => {
      const { error: e1 } = await sb.from("campaign_sends").update({ replied_at: new Date().toISOString() }).eq("id", b.dataset.replied);
      if (e1) return ctx.fail(e1);
      detailView(id);
    });
    const out = document.getElementById("batch");
    document.getElementById("dry").onclick = async () => {
      out.innerHTML = `<p class="muted pad">Building today's batch…</p>`;
      try {
        const r = await api("campaign-send", { campaign_id: id, dry_run: true });
        const mails = r.results.filter((x) => x.html);
        out.innerHTML = `<section class="card pad cm-batch"><div class="meets-head"><h3>Dry run: today's batch</h3><button type="button" class="btn ghost small" id="dry-close">Close</button></div>
          <p class="muted small">Nothing was sent. ${mails.length ? `Today this would send <b>${mails.length}</b> email${mails.length === 1 ? "" : "s"}, ${c.spacing_min} minutes apart, starting about ${ctx.fmtTime(mails[0].at)}.` : r.queued_left ? `Today's limit of ${r.daily_cap} is used up (${r.sent_today} sent today). The rest go out tomorrow.` : "Everyone in this campaign has been emailed."}
          ${r.results.filter((x) => x.skipped).length ? ` ${r.results.filter((x) => x.skipped).length} skipped (unsubscribed or bounced).` : ""}</p>
          ${mails.map((m, i) => `<details ${i ? "" : "open"}><summary><b>${esc(m.email)}</b> <span class="muted small">· ${ctx.fmtTime(m.at)} · ${esc(m.subject)}</span></summary>${previewFrame(m)}</details>`).join("")}</section>`;
        document.getElementById("dry-close").onclick = () => { out.innerHTML = ""; };
      } catch (e) { out.innerHTML = ""; ctx.fail(e); }
    };
    document.getElementById("go").onclick = async () => {
      if (!config) return ctx.toast(configErr || "Campaign settings didn't load", true);
      if (!config.live) return ctx.toast("Dry run only. Set CAMPAIGNS_LIVE=true in Vercel to really send.", true);
      if (!queued) return ctx.toast("Everyone in this campaign has been emailed.");
      if (!confirm(`Send today's batch of "${c.name}" from ${config.from}? Up to ${c.daily_cap} emails a day across all campaigns, ${c.spacing_min} minutes apart. This really emails people.`)) return;
      const go = document.getElementById("go"); go.disabled = true;
      let total = 0, errors = 0;
      try {
        for (;;) {
          out.innerHTML = `<p class="muted pad">Scheduling… ${total} so far</p>`;
          const r = await api("campaign-send", { campaign_id: id, dry_run: false });
          total += r.results.filter((x) => x.sent).length; errors += r.results.filter((x) => x.error).length;
          if (!r.results.length || r.done || r.remaining_today <= 0) break;
        }
        ctx.toast(`${total} email${total === 1 ? "" : "s"} scheduled for today${errors ? `, ${errors} failed` : ""}`);
      } catch (e) { ctx.fail(e); }
      detailView(id);
    };
  }

  window.AWDCampaigns = {
    view(route, helpers) {
      ctx = helpers;
      const sub = route.replace(/^\/campaigns\/?/, "");
      if (!sub) return listView();
      if (sub === "new") return newView();
      return detailView(sub);
    }
  };
})();
