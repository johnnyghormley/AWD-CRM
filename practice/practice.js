(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cfgSB = window.AWD_CONFIG || {};
const sb = supabase.createClient(cfgSB.SUPABASE_URL, cfgSB.SUPABASE_ANON_KEY);

// =====================================================================
// Scripts. AWD = the v2 scripts in the vault (affordable web designs/Call Script - List A / List B).
// IKW = starter script (I Know Warehouses has no written call script yet; edit here when it does).
// =====================================================================
const AWD = {
  goal: "Get a yes to building a FREE website design and collect what's needed to build it (text or email to send it, main services, area served) plus a follow-up call booked ~2 days out. Don't sell the $200; the design sells it.",
  types: {
    A: {
      label: "List A · no website",
      offer: "Package A: free homepage design first, no cost or obligation. If they like it: $200 for the site + $25 setup (web address registered in their name). Then $50/month: hosting, web address, an app to manage the site, and they call Johnathon directly if anything goes wrong.",
      opener: "Hey [name], this is [you] with Affordable Web Designs, here in Bay Area Houston. I'll be quick. Did I catch you at an OK time?",
      reason: "When I searched for [business], I couldn't find a website. People look you up on their phone before they call. Right now they find just a Google listing or a Facebook page.",
      ask: "I'll build you a free homepage design: your name, your services, your area, a tap-to-call button. No cost, no obligation. If you like it, it's $200 plus a $25 setup, and the web address is in your name. Then $50 a month. Want me to put one together for you?",
      objections: [
        ["I get all my work from word of mouth.", "That's the best kind. But when someone gets your name from a neighbor, the first thing they do is look you up. A site makes sure they find you, not the next guy. And the design's free."],
        ["I've got a Facebook page.", "Great, keep it. A lot of people don't use Facebook, and Google ranks a real site higher. I'll link your Facebook right on it."],
        ["I don't have the money right now.", "The design is free, so there's nothing to decide today. If you like it, it's $225 to get going, about one service call, and no long contract."],
        ["How much is it?", "$200 for the site and $25 setup, then $50 a month for hosting and support. But I build the design first for free so you can see if it's worth it."],
        ["$50 a month is a lot.", "It covers everything: hosting, your web address, changes when you need them, and you call me directly. One extra job a month more than pays for it."],
        ["What's the catch? Is this a scam?", "Fair question. No catch, nothing to pay unless you like it. The web address is registered in your name, so you own it."],
        ["I'm too busy to deal with a website.", "That's why I do it all for you. I just need 2 minutes now, and you look at the design when it's ready."],
        ["Just send me some info.", "Even better, I'll send you the actual design so you can see it. Text or email?"],
        ["Not interested.", "No problem at all. Thanks for your time. Mind if I check back in a few months?"],
      ],
    },
    B: {
      label: "List B · has a website",
      offer: "Package B: free side-by-side redesign that keeps their look, no cost or obligation. If they like it: $200 one time to switch; they keep their same web address and email. Then $50/month: hosting, an app to manage the site, and Johnathon's direct line.",
      opener: "Hey [name], this is [you] with Affordable Web Designs, here in Bay Area Houston. I'll be quick. Did I catch you at an OK time?",
      reason: "I pulled up your site on my phone. You've got good info on there. [One specific issue: small text on a phone / no tap-to-call / looks dated]. Most people looking for [trade] are on their phone.",
      ask: "I'll take what's on your current site and build you a free redesign: same info, your same look and feel, just modern, fast and easy on a phone. Put them side by side. If you like mine, it's $200 one time to switch and you keep your web address. Then $50 a month. Want me to put one together?",
      objections: [
        ["I already have a website.", "Totally, and I'm not saying throw it away. I'll build a free version side by side. If yours is better, you've lost nothing."],
        ["My website works fine.", "Good to hear. Have you looked at it on your phone lately? That's where most customers see it. Let me show you a version built for phones, free."],
        ["My nephew / a company handles my website.", "That's great. This doesn't step on anyone. It's a free idea you can compare, and you can even show it to them."],
        ["I just paid for my website.", "Makes sense. Keep it if it's working. If it's not bringing in calls, the redesign is free to look at, and switching is $200 one time."],
        ["What happens to my domain and email?", "You keep your same web address, in your name. Your email stays exactly how it is. I just point the address at the new site."],
        ["How much?", "$200 one time to switch, then $50 a month for hosting and support. But I build the redesign first, free."],
        ["$50 a month is a lot. / I pay less now.", "What you pay now probably covers hosting only. Mine includes hosting, changes, an app to manage the site, and my direct number."],
        ["What's the catch?", "No catch. Nothing to pay unless you like it, and you keep your web address either way."],
        ["Just send me some info.", "Even better, I'll send you the actual redesign. Text or email?"],
        ["Not interested.", "No problem, thanks for your time. Mind if I check back in a few months?"],
      ],
    },
  },
  gate: "I put together something for [business], a free website design. Just takes a minute. Is he/she in? (If not: best time to call back, and a direct number.)",
};

const IKW = {
  goal: "Book a 15-minute meeting (a specific day and time) between the owner/decision maker and [agent], the commercial real estate agent, and confirm whether they own or lease the building plus the best email/mailing address. Never pressure a sale; the meeting is the win.",
  types: {
    owner: {
      label: "Owner-occupier",
      who: "You OWN the warehouse/industrial building and your own business operates out of it.",
      opener: "Hi, is this [name]? This is [you] with I Know Warehouses. We're a local commercial real estate team that focuses on industrial property right here in Deer Park. Did I catch you at an OK time?",
      reason: "I'm reaching out to owners of warehouse and industrial buildings around [street/area]. Industrial space here has been in demand, and a lot of owners don't know what their building would sell or lease for today.",
      ask: "[Agent], our commercial real estate agent, can put together a no-cost, no-obligation look at what your property is worth in today's market, whether you're thinking of selling, leasing, or just want to know. Would you be open to a 15-minute meeting with him next week?",
    },
    investor: {
      label: "Investor landlord",
      who: "You OWN the building as an investment and lease it to a tenant business. You care about rent, vacancy, cap rate and taxes.",
      opener: "Hi, is this [name]? This is [you] with I Know Warehouses. We're a local commercial real estate team that focuses on industrial property in Deer Park. Did I catch you at an OK time?",
      reason: "I'm calling owners of industrial buildings around [street/area]. With demand where it is, a lot of landlords are checking whether their rent and value still match the market.",
      ask: "[Agent], our commercial real estate agent, can give you a no-cost read on what the building would sell or lease for today, and what that means for your next lease renewal. Would a 15-minute meeting next week work?",
    },
    tenant: {
      label: "Tenant",
      who: "You LEASE the building your business operates out of; you don't own it. Your lease has some time left on it.",
      opener: "Hi, is this [name]? This is [you] with I Know Warehouses. We're a local commercial real estate team focused on industrial space in Deer Park. Did I catch you at an OK time?",
      reason: "I'm reaching out to businesses in warehouse space around [street/area]. Industrial rents have moved a lot, and businesses coming up on a renewal often don't know their options.",
      ask: "[Agent], our commercial real estate agent, helps tenants compare what's out there before a renewal, at no cost to you. When's your lease up? Would a quick 15-minute meeting with him make sense?",
    },
  },
  objections: [
    ["I'm not looking to sell.", "Totally understand, most owners we talk to aren't. The meeting is just so you know your number; a lot of owners like having it for refinancing, planning, or if an offer ever comes in. Would 15 minutes next week work?"],
    ["I already have a broker / realtor.", "That's great, no conflict at all. If it'd help, [agent] is happy to be a second opinion on value. If not, mind if we keep in touch in case anything changes?"],
    ["How did you get my number?", "From public property and business records. We only call owners of industrial buildings here in our area. Is now an OK time for a quick question?"],
    ["Just send me something.", "Happy to. What's the best email or mailing address? And so it's actually useful, do you own the building or lease it?"],
    ["What's in it for you? What does it cost?", "Talking costs you nothing. We only get paid if you decide to sell or lease through us, so the meeting is just information."],
    ["I lease, I don't own it.", "Good to know. When is your lease up? [Agent] helps tenants compare options before a renewal, and that's free to you."],
    ["I'm too busy right now.", "No problem. When's a better time for a 2-minute call, or would you rather I set a 15-minute meeting for a day that works for you?"],
    ["Not interested.", "Understood, thanks for your time. Would you mind if we sent you a postcard now and then with what buildings are selling for around you?"],
  ],
  gate: "I'm calling for the owner of the building about the property itself. Who handles real estate decisions for the company, and when's a good time to reach them?",
};

// ---------- fictional people (never real leads) ----------
const MALE = ["Mike", "Rick", "Danny", "Carlos", "Tony", "Ray", "Jesse", "Wade", "Hector", "Dale", "Gary", "Frank", "Lou"];
const FEMALE = ["Linda", "Brenda", "Gloria", "Terri", "Sheila", "Donna", "Maria", "Pam", "Debbie", "Carol"];
const LAST = ["Hollis", "Navarro", "Pruitt", "Delgado", "Kemper", "Boudreaux", "Garza", "Whitfield", "Landry", "Castillo", "Mercer", "Tran", "Schultz"];
const AWD_CITIES = ["Pasadena", "Deer Park", "La Porte", "Seabrook", "South Houston", "Dickinson"];
const TRADES = { Plumbing: ["{L} Plumbing", "Bayside Plumbing", "{C} Rooter & Plumbing"], HVAC: ["{L} Air & Heat", "Coastal Comfort AC", "{C} Heating & Cooling"], Electrical: ["{L} Electric", "Bay Area Electrical Services"], Roofing: ["{L} Roofing", "Gulf Coast Roof Pros"], Insulation: ["{L} Insulation", "Bay Area Spray Foam"], Fencing: ["{L} Fence Co.", "{C} Fence & Gate"] };
const IKW_BIZ = ["{L} Valve & Supply", "Gulf Coast Industrial Coatings", "{L} Machine & Fab", "Bayport Pipe & Fittings", "Channel Industrial Services", "{L} Hydraulics", "Ship Channel Logistics", "{L} Welding & Fabrication"];
const IKW_STREETS = ["Center St", "Georgia Ave", "Pasadena Blvd", "E 13th St", "Industrial Dr", "X St", "San Augustine St"];

// =====================================================================
// state
// =====================================================================
let session = null, prospect = null, cfg = null, turns = [], ended = true, busy = false, timerH = null, started = 0;
let drillGrades = [], drillObjections = [];

const val = (name) => (document.querySelector(`input[name="${name}"]:checked`) || {}).value;
const bizData = () => (val("biz") === "ikw" ? IKW : AWD);
const objectionsFor = (biz) => (biz === "ikw" ? IKW.objections : AWD.types[val("who") || "A"].objections);

function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 3500); }
function setStatus(text, live) { $("status").textContent = text; $("status").className = "pill" + (live ? " live" : ""); }
function store(k, v) { try { localStorage.setItem("robert-" + k, JSON.stringify(v)); } catch (e) {} }
function load(k, d) { try { const v = localStorage.getItem("robert-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }

// ---------- setup form ----------
function renderWho() {
  const biz = val("biz"), seg = $("who-seg"), keep = val("who");
  const types = biz === "ikw" ? IKW.types : AWD.types;
  $("who-label").textContent = biz === "ikw" ? "Who picks up" : "Who you're calling";
  seg.innerHTML = Object.entries(types).map(([k, t], i) => `<label><input type="radio" name="who" id="w-${k}" value="${k}" ${keep === k || (!types[keep] && i === 0) ? "checked" : ""}><span>${esc(t.label)}</span></label>`).join("");
  seg.querySelectorAll("input").forEach((r) => r.addEventListener("change", () => { renderFocus(); renderSheet(); }));
  $("agent-field").hidden = biz !== "ikw";
  renderFocus(); renderSheet();
}
function renderFocus() {
  const sel = $("focus"), keep = sel.value;
  sel.innerHTML = `<option value="">Random mix</option><option value="__gate">Someone else answers (gatekeeper)</option>` + objectionsFor(val("biz")).map((o) => `<option>${esc(o[0])}</option>`).join("");
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function fill(s) {
  return s.replaceAll("[you]", $("caller").value.trim() || "Johnathon").replaceAll("[Agent]", agentName()).replaceAll("[agent]", agentName());
}
const agentName = () => $("agent").value.trim() || "our agent";
function renderSheet() {
  const biz = val("biz"), d = bizData(), t = d.types[val("who")] || Object.values(d.types)[0];
  $("sheet-title").textContent = (biz === "ikw" ? "I Know Warehouses · " : "AWD · ") + t.label;
  const obj = biz === "ikw" ? IKW.objections : t.objections;
  $("sheet").innerHTML =
    `<h3>Goal</h3><p class="muted" style="margin:0">${esc(fill(d.goal))}</p>` +
    `<h3>Opener</h3><q>${esc(fill(t.opener))}</q><h3>Reason for the call</h3><q>${esc(fill(t.reason))}</q>` +
    `<h3>The ask</h3><q>${esc(fill(t.ask))}</q>` +
    `<h3>Objections</h3>` + obj.map((o) => `<div class="obj"><b>“${esc(o[0])}”</b><q>${esc(fill(o[1]))}</q></div>`).join("") +
    `<h3>If someone else answers</h3><q>${esc(fill(d.gate))}</q>` +
    (biz === "ikw" ? `<p class="muted" style="font-size:12px;margin-top:12px">Starter script (no written I Know Warehouses script yet). Tell Claude what to change.</p>` : "");
}

// ---------- history ----------
function renderHist() {
  const h = load("hist", []);
  if (h.length) $("hist").innerHTML = h.map((x) => `<div><span>${esc(x.date)} · ${esc(x.label)}</span><b>${esc(x.score)}/10</b></div>`).join("");
}
function saveHist(e) { const h = load("hist", []); h.unshift(e); store("hist", h.slice(0, 15)); renderHist(); }

// =====================================================================
// server calls (api/robert.js)
// =====================================================================
async function api(kind, system, messages, onText) {
  const { data } = await sb.auth.getSession();
  if (!data.session) throw { code: "signin" };
  const r = await fetch("/api/robert", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + data.session.access_token }, body: JSON.stringify({ kind, system, messages }) });
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw { code: j.error || "upstream", detail: j.detail }; }
  if (kind !== "turn") return r.json();
  const reader = r.body.getReader(), dec = new TextDecoder(); let text = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; text += dec.decode(value, { stream: true }); onText && onText(text); }
  if (text.includes("[[ERROR]]")) throw { code: "upstream", text: text.replace("[[ERROR]]", "") };
  if (text.includes("[[REFUSED]]")) throw { code: "refused" };
  return text;
}
const ERR = {
  no_key: "Robert isn't connected to Claude yet: the Anthropic API key hasn't been added in Vercel.",
  bad_key: "The Anthropic API key in Vercel was rejected. Check it in the Anthropic Console and Vercel.",
  signin: "Your session expired. Sign in again.",
  rate_limited: "Too many requests or out of API credit. Wait a minute, or check your Anthropic billing.",
  refused: "That line couldn't be answered. Try saying it a different way.",
};
const errText = (e) => ERR[e && e.code] || "Robert didn't come through. Say your line again.";

// =====================================================================
// voice: speech out (sentence by sentence) and speech in (Web Speech API)
// =====================================================================
const synth = window.speechSynthesis;
let voices = [], speakQueue = 0, onSpeechDone = null;
function loadVoices() { voices = synth ? synth.getVoices().filter((v) => /^en(-|_)US/i.test(v.lang) || /^en/i.test(v.lang)) : []; }
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
const FEMALE_V = /(female|zira|aria|jenny|samantha|susan|michelle|ava|emma|sara|libby|ana)/i;
const MALE_V = /(male|guy|david|mark|christopher|eric|steffan|roger|davis|tony|brian|andrew|alex|fred|daniel)/i;
function voiceFor(gender) {
  if (!voices.length) loadVoices();
  const nat = voices.filter((v) => /natural|online|neural/i.test(v.name));
  const pool = nat.length ? nat : voices;
  return pool.find((v) => (gender === "f" ? FEMALE_V : MALE_V).test(v.name)) || pool[0] || null;
}
function speak(text) {
  if (!$("voice-out").checked || !synth) return;
  const clean = text.replace(/\[[^\]]*\]/g, "").trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  const v = voiceFor(prospect.gender); if (v) u.voice = v;
  u.rate = 1.05; u.pitch = prospect.gender === "f" ? 1.05 : 0.95;
  speakQueue++; micMode("speaking");
  u.onend = u.onerror = () => { speakQueue = Math.max(0, speakQueue - 1); if (!speakQueue && onSpeechDone) { const f = onSpeechDone; onSpeechDone = null; f(); } };
  synth.speak(u);
}
function whenSpoken(fn) { if (!$("voice-out").checked || !synth || !speakQueue) fn(); else onSpeechDone = fn; }
function stopSpeaking() { speakQueue = 0; onSpeechDone = null; try { synth && synth.cancel(); } catch (e) {} }

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, heard = "", silenceH = null;
function micMode(m) {
  const mic = $("mic"); mic.classList.toggle("listening", m === "listening"); mic.classList.toggle("speaking", m === "speaking");
  $("mic-state").textContent = { listening: "Listening… just talk. Pause and it sends.", speaking: prospect ? prospect.first + " is talking… (tap the mic to cut in)" : "", thinking: prospect ? prospect.first + " is thinking…" : "", idle: SR ? "Tap the mic and start talking" : "Voice input needs Chrome or Edge. Type your line below.", off: "Call ended" }[m] || "";
}
function startListening() {
  if (!SR || ended || busy || listening) return;
  stopSpeaking();
  rec = new SR(); rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
  heard = ""; $("caption").textContent = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) heard += (heard ? " " : "") + r[0].transcript.trim(); else interim += r[0].transcript;
    }
    $("caption").textContent = (heard + " " + interim).trim();
    clearTimeout(silenceH);
    silenceH = setTimeout(() => { if (heard.trim()) stopListening(true); }, 1400);
  };
  rec.onerror = (ev) => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { toast("Microphone blocked. Allow it in the browser's address bar (site settings), or type your lines."); $("handsfree").checked = false; }
  };
  rec.onend = () => {
    listening = false;
    if (!ended && !busy && heard.trim() === "" && $("handsfree").checked && document.visibilityState === "visible") { setTimeout(startListening, 200); return; }
    if (!busy) micMode("idle");
  };
  try { rec.start(); listening = true; micMode("listening"); } catch (e) { listening = false; }
}
function stopListening(send) {
  clearTimeout(silenceH);
  const text = heard.trim(); heard = "";
  if (rec) { rec.onend = () => { listening = false; }; try { rec.stop(); } catch (e) {} }
  listening = false;
  $("caption").textContent = "";
  if (send && text) submitLine(text); else micMode("idle");
}
function afterProspectSpoke() {
  if (ended) return;
  whenSpoken(() => { micMode("idle"); if ($("handsfree").checked) startListening(); else $("typed").focus(); });
}

// =====================================================================
// transcript
// =====================================================================
function addLine(kind, text) {
  const d = document.createElement("div"); d.className = "line " + kind;
  const label = kind === "you" ? "You" : kind === "them" ? prospect.speaker : "";
  d.innerHTML = (label ? `<small>${esc(label)}</small>` : "") + "<p></p>";
  d.querySelector("p").textContent = text;
  $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight; return d;
}
function typing() { const d = document.createElement("div"); d.className = "line them"; d.innerHTML = `<small>${esc(prospect.speaker)}</small><span class="dots"><i></i><i></i><i></i></span>`; $("log").appendChild(d); $("log").scrollTop = $("log").scrollHeight; return d; }
function tick() { const t = Math.floor((Date.now() - started) / 1000); $("timer").textContent = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); }

// =====================================================================
// prompts
// =====================================================================
function personaPrompt() {
  const p = prospect, you = cfg.caller;
  const mood = {
    Easy: "You're friendly and have a minute. Raise one mild objection, then agree if the caller is clear and polite.",
    Normal: "You're busy and a bit skeptical of sales calls. Raise two or three objections naturally. Agree only if the caller handles them well, keeps it short, and makes the next step easy.",
    Tough: "You're short-tempered, interrupted mid-task, and get a lot of sales calls. Push back hard (three or four objections) and test whether this is legit. If the caller rambles, gets pushy, or can't answer, say you're busy and hang up. Only agree if they're concise, calm and handle every objection.",
  }[cfg.diff];
  let who, offer;
  if (cfg.biz === "awd") {
    const site = cfg.who === "A"
      ? "You do NOT have a website. Customers find you through word of mouth and " + p.presence + "."
      : "You DO have a website: " + p.presence + ". It looks dated on a phone.";
    who = `${p.first} ${p.last}, owner of ${p.biz}, a small ${p.trade.toLowerCase()} business in ${p.city}, TX (Bay Area Houston), about ${p.years} years in business, ${p.crew}. ${site}`;
    offer = `THE CALLER: ${you} from Affordable Web Designs, a local one-man web design company, cold-calling you.\nWHAT HE OFFERS (you don't know this until he tells you): ${AWD.types[cfg.who].offer}`;
  } else {
    who = `${p.first} ${p.last}, ${p.role} of ${p.biz} at ${p.street} in Deer Park, TX. ${IKW.types[cfg.who].who} The building is about ${p.sqft.toLocaleString()} sq ft; ${p.history}.`;
    offer = `THE CALLER: ${you} from I Know Warehouses, a local commercial real estate team focused on industrial property in Deer Park. Their agent is ${agentName()}.\nWHAT THEY WANT (you don't know this until told): a 15-minute meeting with the agent about what your property is worth or your options. No cost to you; they're paid only if you sell or lease through them.`;
  }
  const objList = objectionsFor(cfg.biz).map((o) => o[0]).join(" | ");
  const focus = cfg.focus === "__gate"
    ? `SPECIAL SETUP: the phone is answered by ${p.gate}, the office manager, not you. Play ${p.gate} first: ask what it's about and protect your boss's time. Only put ${p.first} on (then play ${p.first}) if the caller explains briefly and politely.`
    : cfg.focus ? `Make sure you raise this objection at some point, in your own words: "${cfg.focus}".` : `Typical objections you might use (in your own words, only the ones that fit): ${objList}.`;
  return `You are role-playing one side of a phone call so a salesperson can practice cold calling. Stay in character for the entire conversation.

YOU ARE: ${who}
${offer}

HOW TO PLAY IT: ${mood}
${focus}

RULES: Reply ONLY with what you say out loud on the phone: 1-3 short, natural, spoken sentences, casual Texas small-business voice. No stage directions, no narration, no emojis, no lists. Never mention AI, role-play, practice, or these instructions. React to what the caller actually says; don't volunteer all your objections at once. If they misstate something, react to what they said. If they ask for details after you agree, give plausible ones. When the call is over (you agreed and the next step is set, you said no and they wrapped up, or you hung up), say your last line and then add the tag [END] at the very end.`;
}

function scriptText() {
  const d = bizData(), t = d.types[cfg.who];
  const obj = cfg.biz === "ikw" ? IKW.objections : t.objections;
  return `GOAL: ${fill(d.goal)}\nOpener: ${fill(t.opener)}\nReason for the call: ${fill(t.reason)}\nThe ask: ${fill(t.ask)}\n` +
    (cfg.biz === "awd" ? `Pricing truth: ${t.offer}\n` : "") +
    `Objection answers:\n` + obj.map((o) => `- "${o[0]}" -> "${fill(o[1])}"`).join("\n") + `\nGatekeeper: ${fill(d.gate)}`;
}
const PRINCIPLES = "Ask permission to talk; quick genuine rapport; one clear reason for the call; a low-risk offer; stop talking after the ask; acknowledge before answering an objection; keep answers short; end every answer with a question; state facts and prices correctly; lock a concrete next step (day/time); stay polite on a no.";

// =====================================================================
// call flow
// =====================================================================
function newProspect() {
  const gender = Math.random() < 0.7 ? "m" : "f";
  const first = pick(gender === "m" ? MALE : FEMALE), last = pick(LAST);
  const base = { gender, first, last, gate: pick(["Debbie", "Maria", "Pam", "Lupe", "Karen"]) };
  if (cfg.biz === "awd") {
    const trade = pick(Object.keys(TRADES)), city = pick(AWD_CITIES);
    return { ...base, trade, city, biz: pick(TRADES[trade]).replace("{L}", last).replace("{C}", city), years: pick([6, 9, 12, 17, 22, 30]),
      crew: pick(["just you and two guys", "you and a crew of five", "a family crew of four", "you and your son"]),
      presence: cfg.who === "A" ? pick(["a Facebook page your spouse set up", "your Google listing with a few dozen reviews"]) : pick(["your nephew built it around 2016 and it's never been updated", "you pay a big web company $30 a month for it", "a friend built it on Wix years ago"]),
      line: `${city} · ${trade} · AWD ${cfg.who === "A" ? "List A" : "List B"}` };
  }
  const biz = pick(IKW_BIZ).replace("{L}", last);
  return { ...base, trade: "industrial", biz, street: Math.floor(1000 + Math.random() * 3800) + " " + pick(IKW_STREETS),
    role: cfg.who === "tenant" ? "operations manager and decision maker" : "owner", sqft: pick([8000, 12000, 18500, 24000, 40000]),
    history: cfg.who === "tenant" ? pick(["your lease is up in about 14 months", "your lease renews next spring", "you've been there 6 years on a 5-year lease with an extension"]) : pick(["you bought it in 2009", "your family has owned it since the 90s", "you bought it 7 years ago"]),
    line: `Deer Park · ${IKW.types[cfg.who].label} · I Know Warehouses` };
}

async function startCall() {
  cfg = { biz: val("biz"), who: val("who"), mode: val("mode"), diff: val("diff"), focus: $("focus").value, caller: $("caller").value.trim() || "Johnathon" };
  store("settings", { biz: cfg.biz, who: cfg.who, mode: cfg.mode, diff: cfg.diff, caller: cfg.caller, agent: $("agent").value, voice: $("voice-out").checked, hands: $("handsfree").checked });
  prospect = newProspect(); prospect.speaker = cfg.focus === "__gate" ? prospect.gate : prospect.first;
  turns = []; drillGrades = []; drillObjections = []; ended = false; busy = false;
  $("log").innerHTML = ""; $("review").hidden = true; $("setup").hidden = true; $("call").hidden = false;
  $("av").textContent = (prospect.first[0] + prospect.last[0]).toUpperCase();
  $("who-name").textContent = prospect.first + " " + prospect.last;
  $("who-biz").textContent = prospect.biz + " · " + prospect.line + (cfg.mode === "drill" ? " · drill" : "");
  $("hangup").textContent = cfg.mode === "drill" ? "End drill" : "Hang up";
  started = Date.now(); tick(); clearInterval(timerH); timerH = setInterval(tick, 1000);
  setStatus(cfg.mode === "drill" ? "Drill" : "On call", true);
  $("mic").disabled = !SR;

  if (cfg.mode === "drill") {
    const pool = objectionsFor(cfg.biz).map((o) => o[0]);
    const first = cfg.focus && cfg.focus !== "__gate" ? cfg.focus : pick(pool);
    drillObjections.push(first);
    addLine("sys", "Drill: Robert throws objections at you. Answer like you're on the phone; every answer gets graded.");
    addLine("them", first); speak(first); afterProspectSpoke(); return;
  }
  const hello = cfg.focus === "__gate" ? `${prospect.biz}, this is ${prospect.gate}.` : pick([`${prospect.biz}, this is ${prospect.first}.`, `Yeah, this is ${prospect.first}.`, `Hello? ${prospect.first} speaking.`]);
  addLine("sys", "Ring ring… they picked up.");
  turns.push({ role: "user", content: "(The phone rings and you pick it up.)" });
  turns.push({ role: "assistant", content: hello });
  addLine("them", hello); speak(hello); afterProspectSpoke();
}

function submitLine(text) {
  if (busy || ended) return;
  stopSpeaking();
  if (cfg.mode === "drill") drillTurn(text); else callTurn(text);
}

async function callTurn(text) {
  busy = true; micMode("thinking");
  addLine("you", text);
  turns.push({ role: "user", content: text });
  const t = typing();
  let spokenUpTo = 0, shown = "";
  const flushSpeech = (full, final) => {
    const clean = full.replace(/\[END\]/g, "");
    // speak each finished sentence as soon as it streams in
    const re = /[^.!?]+[.!?]+["')\]]*\s*/g; re.lastIndex = spokenUpTo; let m;
    while ((m = re.exec(clean))) { speak(m[0]); spokenUpTo = re.lastIndex; }
    if (final && spokenUpTo < clean.length) { speak(clean.slice(spokenUpTo)); spokenUpTo = clean.length; }
  };
  try {
    const reply = await api("turn", personaPrompt(), turns, (full) => {
      shown = full.replace(/\[END\]/g, "").trim();
      if (t.querySelector(".dots")) t.innerHTML = `<small>${esc(prospect.speaker)}</small><p></p>`;
      t.querySelector("p").textContent = shown; $("log").scrollTop = $("log").scrollHeight;
      flushSpeech(full, false);
    });
    const over = /\[END\]/.test(reply), clean = reply.replace(/\[END\]/g, "").trim();
    if (!t.querySelector("p")) t.innerHTML = `<small>${esc(prospect.speaker)}</small><p></p>`;
    t.querySelector("p").textContent = clean;
    flushSpeech(reply, true);
    turns.push({ role: "assistant", content: clean });
    busy = false;
    if (over) { whenSpoken(() => { addLine("sys", prospect.first + " ended the call."); finishCall(); }); return; }
    afterProspectSpoke();
  } catch (e) {
    t.remove(); turns.pop(); busy = false;
    addLine("sys", errText(e)); micMode("idle");
    if (e.code === "no_key" || e.code === "bad_key" || e.code === "signin") { ended = true; clearInterval(timerH); setStatus("Not connected", false); }
  }
}

async function drillTurn(answer) {
  busy = true; micMode("thinking");
  const objection = drillObjections[drillObjections.length - 1];
  addLine("you", answer);
  const t = typing();
  const pool = objectionsFor(cfg.biz).map((o) => o[0]).filter((o) => !drillObjections.includes(o));
  const scripted = (objectionsFor(cfg.biz).find((o) => o[0] === objection) || [])[1];
  const system = `You are Robert, a blunt but encouraging cold-call coach, and you also voice the prospect. Business: ${cfg.biz === "awd" ? "Affordable Web Designs (websites for trades businesses)" : "I Know Warehouses (commercial real estate, industrial property in Deer Park, TX)"}. Prospect: ${prospect.first}, ${prospect.biz}. Difficulty: ${cfg.diff}.
SCRIPT:\n${scriptText()}\nPRINCIPLES: ${PRINCIPLES}
Grade the caller's answer to the objection for a real phone call (a different wording than the script is fine if it works). Then, in character as the prospect, either push back once more on the same point (if the answer was weak) or raise a new objection${pool.length ? " from: " + pool.join(" | ") : ""}.
Return: score 1-5; feedback = one or two plain sentences on what worked and what to fix; try = a better line under 40 words in the caller's voice; next = the prospect's next spoken line; next_objection = which objection the next line is (or "follow-up").`;
  try {
    const r = await api("drill", system, [{ role: "user", content: `Prospect said: "${objection}"\nCaller answered: "${answer}"\nScript's answer for reference: "${fill(scripted || "(none)")}"` }]);
    t.remove(); busy = false;
    const score = Math.max(1, Math.min(5, parseInt(r.score, 10) || 3)); drillGrades.push(score);
    const g = document.createElement("div"); g.className = "grade";
    g.innerHTML = `<b>${"★★★★★".slice(0, score)}<span style="opacity:.3">${"★★★★★".slice(score)}</span> ${score}/5</b> ${esc(r.feedback)}` + (r.try ? `<div class="try"><b>Try:</b> “${esc(r.try)}”</div>` : "");
    $("log").appendChild(g);
    const next = String(r.next || "").trim() || pick(pool.length ? pool : ["Anything else?"]);
    drillObjections.push(r.next_objection && r.next_objection !== "follow-up" ? String(r.next_objection) : objection);
    addLine("them", next); speak(next); afterProspectSpoke();
  } catch (e) {
    t.remove(); busy = false; addLine("sys", errText(e)); micMode("idle");
    if (e.code === "no_key" || e.code === "bad_key" || e.code === "signin") ended = true;
  }
}

async function finishCall() {
  if (!$("review").hidden) return;
  ended = true; clearInterval(timerH); stopSpeaking(); if (listening) stopListening(false);
  micMode("off"); setStatus("Call ended", false);
  const dur = $("timer").textContent, rv = $("review"); rv.hidden = false;
  const label = (cfg.biz === "awd" ? "AWD " : "IKW ") + (cfg.mode === "drill" ? "drill" : "call") + " · " + cfg.diff;
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (cfg.mode === "drill") {
    const n = drillGrades.length, avg = n ? drillGrades.reduce((a, b) => a + b, 0) / n : 0, s10 = Math.round(avg * 2);
    rv.innerHTML = `<h2>Drill summary</h2><div class="scorebox"><div class="score">${s10}</div><div><div class="outcome">${n} objection${n === 1 ? "" : "s"} answered · average ${avg.toFixed(1)}/5</div><p class="muted" style="margin:4px 0 0">Scroll up to reread each "Try" line.</p></div></div>` + actions();
    if (n) saveHist({ date, label, score: s10 });
    wire(); return;
  }
  if (turns.length < 4) { rv.innerHTML = `<h2>Call too short to grade</h2><p class="muted">Say a few lines before hanging up and Robert will review the call.</p>` + actions(); wire(); return; }
  rv.innerHTML = `<h2>Robert is reviewing the call…</h2><p class="muted">About 10-30 seconds.</p><span class="dots"><i></i><i></i><i></i></span>`;
  rv.scrollIntoView({ behavior: "smooth", block: "start" });
  const transcript = turns.slice(1).map((t) => (t.role === "user" ? "CALLER: " : `PROSPECT (${prospect.first}): `) + t.content).join("\n").slice(-30000);
  const system = `You are Robert, a direct, practical sales coach. Grade this cold-call practice against the caller's script and the principles. Quote the caller's actual words; be specific and brief; no fluff.
SCRIPT:\n${scriptText()}\nPRINCIPLES: ${PRINCIPLES}
SETUP: prospect ${prospect.first} ${prospect.last}, ${prospect.biz} (${prospect.line}), difficulty ${cfg.diff}, call length ${dur}.
Return: score 1-10; outcome = one short line (did they reach the goal / a next step?); worked = up to 3 short points; fix = up to 3 short points, most important first; moment = the prospect's toughest line, what the caller said back, and a stronger answer under 45 words in the caller's voice; drill_next = which objection to practice next.`;
  try {
    const r = await api("grade", system, [{ role: "user", content: "TRANSCRIPT:\n" + transcript }]);
    const sc = Math.max(1, Math.min(10, parseInt(r.score, 10) || 5));
    const li = (a) => (Array.isArray(a) ? a : []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li>-</li>";
    const m = r.moment || {};
    rv.innerHTML = `<h2>Robert's coaching</h2><div class="scorebox"><div class="score" aria-label="Score ${sc} out of 10">${sc}</div><div style="min-width:0"><div class="outcome">${esc(r.outcome)}</div><p class="muted" style="margin:4px 0 0">${esc(prospect.biz)} · ${esc(cfg.diff)} · ${dur}</p></div></div>` +
      `<div class="cols"><div><span class="tag good">What worked</span><ul>${li(r.worked)}</ul></div><div><span class="tag fix">Fix next time</span><ul>${li(r.fix)}</ul></div></div>` +
      (m.they_said ? `<div class="rewrite"><p><b>${esc(prospect.first)}:</b> “${esc(m.they_said)}”</p><p><b>You said:</b> “${esc(m.you_said)}”</p><p style="margin-top:8px"><b>Try this:</b> “${esc(m.try)}”</p></div>` : "") +
      (r.drill_next ? `<p class="muted" style="margin-top:12px">Practice next: <b>${esc(r.drill_next)}</b></p>` : "") + actions();
    saveHist({ date, label, score: sc });
  } catch (e) {
    rv.innerHTML = `<h2>The review didn't come through</h2><p class="muted">${esc(errText(e))}</p><div class="actions"><button class="btn primary" id="regrade">Try the review again</button><button class="btn ghost" id="setupbtn">Back to setup</button></div>`;
    $("regrade").onclick = () => { rv.hidden = true; finishCall(); };
    $("setupbtn").onclick = backToSetup; return;
  }
  wire();
}
const actions = () => `<div class="actions"><button class="btn primary" id="again">📞 Call someone new</button><button class="btn ghost" id="setupbtn">Change settings</button></div>`;
function wire() { $("again").onclick = startCall; $("setupbtn").onclick = backToSetup; }
function backToSetup() { $("review").hidden = true; $("call").hidden = true; $("setup").hidden = false; setStatus("Ready", false); }

// =====================================================================
// wiring + sign-in
// =====================================================================
document.querySelectorAll('input[name="biz"]').forEach((r) => r.addEventListener("change", renderWho));
["caller", "agent"].forEach((id) => $(id).addEventListener("input", renderSheet));
$("start").onclick = () => {
  if (!SR) toast("Voice input needs Chrome or Edge. You can still type your lines.");
  startCall();
};
$("hangup").onclick = () => { if (!ended) { addLine("sys", "You hung up."); finishCall(); } };
$("mic").onclick = () => { if (listening) stopListening(true); else startListening(); };
$("typebox").onsubmit = (e) => { e.preventDefault(); const v = $("typed").value.trim(); if (!v) return; $("typed").value = ""; if (listening) stopListening(false); submitLine(v); };
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !$("call").hidden && !ended && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") { e.preventDefault(); $("mic").click(); }
});

function applySettings() {
  const s = load("settings", null); if (!s) return;
  const set = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
  set("biz", s.biz); set("mode", s.mode); set("diff", s.diff);
  $("caller").value = s.caller || "Johnathon"; $("agent").value = s.agent || "";
  $("voice-out").checked = s.voice !== false; $("handsfree").checked = s.hands !== false;
  renderWho(); set("who", s.who); renderFocus(); renderSheet();
}

async function boot() {
  session = (await sb.auth.getSession()).data.session;
  $("signout").hidden = !session;
  $("login").hidden = !!session; $("app").hidden = !session;
  if (session) { renderWho(); applySettings(); renderHist(); }
}
$("login").onsubmit = async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  if (error) return toast(error.message);
  boot();
};
$("signout").onclick = async () => { await sb.auth.signOut(); boot(); };
boot();

// ---------- installable desktop app ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; $("install").hidden = false; });
$("install").onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("install").hidden = true; };
window.addEventListener("appinstalled", () => { $("install").hidden = true; toast("Robert installed. Find him in your Start menu or pin him to the taskbar."); });
})();
