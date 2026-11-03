// Campaigns tab ↔ HubSpot (I Know Warehouses portal). Signed-in CRM users only.
//   GET  /api/hubspot?action=config   → which settings are in place (never the secret values)
//   GET  /api/hubspot?action=options  → Lead Status choices
//   GET  /api/hubspot?action=lists    → contact lists
//   POST /api/hubspot?action=contacts → contacts with an email address, by filters or by list
const { settings, send, requireUser, hubspot, readJson } = require("./_lib");

const PROPS = ["email", "firstname", "lastname", "company", "city", "jobtitle", "industry", "hs_lead_status"];
const MAX = 1000;
// HubSpot's built-in sample contacts are never real prospects.
const sample = (p) => /@hubspot\.com$/i.test(p.email || "") || /\(sample contact\)/i.test(p.lastname || "");
const shape = (c) => ({ id: c.id, ...Object.fromEntries(PROPS.map((k) => [k, c.properties[k] || ""])) });

async function byFilters(f) {
  const filters = [{ propertyName: "email", operator: "HAS_PROPERTY" }];
  if (f.lead_status && f.lead_status.length) filters.push({ propertyName: "hs_lead_status", operator: "IN", values: f.lead_status });
  if (f.city) filters.push({ propertyName: "city", operator: "EQ", value: f.city.trim() });
  if (f.industry) filters.push({ propertyName: "industry", operator: "CONTAINS_TOKEN", value: `*${f.industry.trim()}*` });
  if (f.company) filters.push({ propertyName: "company", operator: "CONTAINS_TOKEN", value: `*${f.company.trim()}*` });
  const out = [];
  let after;
  do {
    const r = await hubspot("/crm/v3/objects/contacts/search", { method: "POST", body: {
      filterGroups: [{ filters }], properties: PROPS, limit: 100, after,
      sorts: [{ propertyName: "createdate", direction: "ASCENDING" }] } });
    out.push(...r.results);
    after = r.paging && r.paging.next && r.paging.next.after;
  } while (after && out.length < MAX);
  return out;
}

async function byList(listId) {
  const ids = [];
  let after;
  do {
    const r = await hubspot(`/crm/v3/lists/${encodeURIComponent(listId)}/memberships?limit=250${after ? "&after=" + after : ""}`);
    ids.push(...r.results.map((m) => m.recordId));
    after = r.paging && r.paging.next && r.paging.next.after;
  } while (after && ids.length < MAX);
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await hubspot("/crm/v3/objects/contacts/batch/read", { method: "POST", body: { properties: PROPS, inputs: ids.slice(i, i + 100).map((id) => ({ id })) } });
    out.push(...r.results.filter((c) => c.properties.email));
  }
  return out;
}

module.exports = async (req, res) => {
  if (!(await requireUser(req, res))) return;
  const action = (req.query && req.query.action) || new URL(req.url, "http://x").searchParams.get("action");
  try {
    if (action === "config") {
      const s = settings();
      return send(res, 200, { business: s.business, from: s.from, replyTo: s.replyTo, address: s.address, live: s.live, hubspot: s.hubspot, resend: s.resend, webhook: s.webhook });
    }
    if (action === "options") {
      const p = await hubspot("/crm/v3/properties/contacts/hs_lead_status");
      return send(res, 200, { lead_status: (p.options || []).filter((o) => !o.hidden).map((o) => ({ value: o.value, label: o.label })) });
    }
    if (action === "lists") {
      const r = await hubspot("/crm/v3/lists/search", { method: "POST", body: { query: "", count: 100, offset: 0 } });
      return send(res, 200, { lists: (r.lists || []).filter((l) => l.objectTypeId === "0-1").map((l) => ({ id: l.listId, name: l.name, size: l.additionalProperties && l.additionalProperties.hs_list_size })) });
    }
    if (action === "contacts" && req.method === "POST") {
      const f = await readJson(req);
      const raw = f.list_id ? await byList(f.list_id) : await byFilters(f);
      const contacts = raw.map(shape).filter((c) => c.email && !sample(c));
      return send(res, 200, { contacts, capped: raw.length >= MAX });
    }
    send(res, 400, { error: "Unknown action" });
  } catch (e) {
    send(res, e.status === 401 || e.status === 403 ? 502 : 500, { error: e.message });
  }
};
