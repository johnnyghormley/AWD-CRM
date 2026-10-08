// Robert (call-practice coach) - server side.
// Holds the Anthropic API key (Vercel env var ANTHROPIC_API_KEY, never sent to the browser) and only
// answers requests from someone signed in to the AWD CRM (Supabase session token in the Authorization header).
import Anthropic from "@anthropic-ai/sdk";

export const config = { maxDuration: 120 };

const SUPABASE_URL = "https://mrklhkseyynmnjzbiokx.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_8SekgbrdzwUzWaMCohwznQ_wPZaOpDo";
const MODEL = "claude-opus-5-5";
// Server-side refusal fallback: if Claude declines a turn, the API retries on a fallback model in the same call.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const GRADE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    outcome: { type: "string" },
    worked: { type: "array", items: { type: "string" } },
    fix: { type: "array", items: { type: "string" } },
    moment: {
      type: "object",
      properties: { they_said: { type: "string" }, you_said: { type: "string" }, try: { type: "string" } },
      required: ["they_said", "you_said", "try"],
      additionalProperties: false,
    },
    drill_next: { type: "string" },
  },
  required: ["score", "outcome", "worked", "fix", "moment", "drill_next"],
  additionalProperties: false,
};

const DRILL_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    feedback: { type: "string" },
    try: { type: "string" },
    next: { type: "string" },
    next_objection: { type: "string" },
  },
  required: ["score", "feedback", "try", "next", "next_objection"],
  additionalProperties: false,
};

async function signedIn(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return false;
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_PUBLIC_KEY, Authorization: h } });
  return r.ok;
}

function cleanMessages(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > 120) return null;
  const out = [];
  for (const m of list) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, 6000);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

function textOf(message) {
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "no_key" });
  if (!(await signedIn(req))) return res.status(401).json({ error: "signin" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { kind } = body;
  const system = typeof body.system === "string" ? body.system.slice(0, 40000) : "";
  const messages = cleanMessages(body.messages);
  if (!system || !messages || !["turn", "grade", "drill"].includes(kind)) {
    return res.status(400).json({ error: "bad_request" });
  }

  try {
    if (kind === "turn") {
      // The prospect's next line, streamed as plain text so the app can start speaking sentence by sentence.
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 4000,
        system,
        messages,
        output_config: { effort: "low" },
        ...FALLBACK,
      });
      stream.on("text", (t) => res.write(t));
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") res.write("\n[[REFUSED]]");
      return res.end();
    }

    // Grading a whole call, or one drill answer: structured JSON.
    const message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages,
      output_config: { effort: kind === "grade" ? "medium" : "low", format: { type: "json_schema", schema: kind === "grade" ? GRADE_SCHEMA : DRILL_SCHEMA } },
      ...FALLBACK,
    });
    if (message.stop_reason === "refusal") return res.status(422).json({ error: "refused" });
    return res.status(200).json(JSON.parse(textOf(message)));
  } catch (e) {
    const status = e instanceof Anthropic.APIError && e.status ? e.status : 500;
    const code = status === 429 ? "rate_limited" : status === 401 ? "bad_key" : status === 400 ? "api_400" : "upstream";
    console.error("robert", status, e && e.message);
    if (res.headersSent) { res.write("\n[[ERROR]]"); return res.end(); }
    return res.status(status === 401 ? 502 : status).json({ error: code, detail: String((e && e.message) || "").slice(0, 300) });
  }
}
