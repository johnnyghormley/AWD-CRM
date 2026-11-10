// AWD CRM: Analytics tab (admin only, 2026-11-10).
// Website: AWD's own visit counter (site_visits, filled by tracking.js on affordablewebdesigns.vercel.app).
// Form requests: the inquiries table ("How did you hear about us?").
// Google Business Profile + LinkedIn: weekly numbers typed in here (channel_stats), until Google's API is approved.
(function () {
  const RANGES = [[7, "7 days"], [30, "30 days"], [90, "90 days"]];
  const GOOGLE = [["views", "Profile views"], ["searches", "Searches"], ["calls", "Calls"], ["website", "Website clicks"]];
  const LINKEDIN = [["followers", "Total followers"], ["new_followers", "New followers"], ["impressions", "Post impressions"],
    ["page_views", "Page views"], ["engagements", "Reactions, comments & reposts"], ["clicks", "Clicks"]];
  const SRC = { maps: "Google Maps (Business Profile)", google: "Google search", googlead: "Google Ads", facebook: "Facebook",
    fbad: "Facebook/Instagram ads", linkedin: "LinkedIn", nextdoor: "Nextdoor", referral: "Friend or referral",
    call: "Johnny called, texted or emailed", person: "Met Johnny in person", instagram: "Instagram", ig: "Instagram" };
  let days = 30;

  const fmt = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("en-US"));
  const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const shortDay = (k) => new Date(k + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mondayOf = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dayKey(x); };

  // Where a visit came from: the ?src= tag first, then ad tags, then the referring site.
  function sourceOf(v) {
    const s = (v.source || "").toLowerCase();
    if (s) return SRC[s] || SRC[s.split("/")[0]] || s;
    const r = (v.referrer || "").toLowerCase();
    if (!r) return "Direct / typed in";
    if (/(^|\.)google\./.test(r)) return "Google search";
    if (/bing\.|duckduckgo\.|yahoo\.|ecosia\./.test(r)) return "Other search engines";
    if (/facebook\.|fb\.me|fb\.com/.test(r)) return "Facebook";
    if (/instagram\./.test(r)) return "Instagram";
    if (/linkedin\.|lnkd\.in/.test(r)) return "LinkedIn";
    if (/(^|\.)t\.co$|twitter\.|(^|\.)x\.com$/.test(r)) return "X (Twitter)";
    if (/nextdoor\./.test(r)) return "Nextdoor";
    return r.replace(/^www\./, "");
  }
  const pageName = (p) => ({ "/": "Home page", "/free-design/": "Ad landing page (/free-design)", "/free-design": "Ad landing page (/free-design)", "/privacy.html": "Privacy page" }[p] || p);

  async function fetchAll(sb, table, cols, since) {
    const out = [];
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).gte("created_at", since).order("created_at").range(from, from + 999);
      if (error) return { error };
      out.push(...data);
      if (data.length < 1000) break;
    }
    return { data: out };
  }

  // One horizontal "share" bar per row: single hue, length = share of the biggest row.
  const shareRows = (rows, total, esc) => rows.length ? `<table class="an-table"><tbody>${rows.map(([k, n], i) => `
      <tr><td>${esc(k)}</td><td class="an-bar-cell"><span class="an-share" style="width:${Math.max(2, (n / rows[0][1]) * 100)}%"></span></td>
      <td class="num"><b>${fmt(n)}</b></td><td class="num muted">${total ? Math.round((n / total) * 100) : 0}%</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted small">Nothing yet in this time range.</p>`;
  const countBy = (list, f) => Object.entries(list.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);

  // Daily visitors: single-series bar chart (SVG), hover tooltip, table view underneath.
  function dailyChart(series, esc) {
    const W = 720, H = 200, padL = 34, padB = 22, padT = 10, n = series.length;
    const max = Math.max(1, ...series.map((d) => d.n));
    const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
    const bw = (W - padL) / n, gap = Math.min(4, bw * 0.25), w = Math.max(1, bw - gap);
    const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
    const r = Math.min(4, w / 2);
    const bars = series.map((d, i) => {
      const x = padL + i * bw + gap / 2, top = y(d.n), base = y(0);
      const bar = d.n ? (base - top > r
        ? `<path class="an-col" d="M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z"/>`
        : `<rect class="an-col" x="${x}" y="${top}" width="${w}" height="${base - top}"/>`) : "";
      return `${bar}<rect class="an-hit" x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" data-i="${i}"/>`;
    }).join("");
    const grid = [0, nice / 2, nice].map((v) => `<line class="an-grid" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="an-axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join("");
    const ticks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i)
      .map((i) => `<text class="an-axis" x="${padL + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${shortDay(series[i].day)}</text>`).join("");
    return `<div class="an-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Website visitors per day">${grid}${bars}${ticks}</svg>
      <div class="an-tip" hidden></div></div>
      <details class="an-details"><summary class="small">Show as a table</summary>
        <table class="an-table"><thead><tr><th>Day</th><th class="num">Visitors</th><th class="num">Page views</th></tr></thead><tbody>
        ${series.slice().reverse().map((d) => `<tr><td>${esc(shortDay(d.day))}</td><td class="num">${fmt(d.n)}</td><td class="num">${fmt(d.views)}</td></tr>`).join("")}</tbody></table></details>`;
  }

  function channelCard(key, title, metrics, rows, esc, howTo) {
    const mine = rows.filter((r) => r.channel === key).sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
    const last = mine[0], prev = mine[1];
    const tiles = metrics.map(([k, label]) => {
      const v = last && last.metrics[k], p = prev && prev.metrics[k];
      const ch = v != null && p != null && p !== "" ? v - p : null;
      return `<div class="stat"><span>${esc(label)}</span><b>${fmt(v)}</b>${ch != null ? `<div class="an-change small">${ch > 0 ? "▲ +" : ch < 0 ? "▼ " : ""}${fmt(ch)} vs week before</div>` : ""}</div>`;
    }).join("");
    const lastMon = mondayOf(new Date(Date.now() - 7 * 864e5));
    return `<section class="card pad an-sec">
      <div class="an-head"><h3>${title}</h3><span class="muted small">${last ? `Week of ${esc(shortDay(last.week_start))}` : "No numbers yet"}</span></div>
      <div class="stats">${tiles}</div>
      ${mine.length > 1 ? `<details class="an-details"><summary class="small">Earlier weeks</summary><table class="an-table"><thead><tr><th>Week of</th>${metrics.map(([, l]) => `<th class="num">${esc(l)}</th>`).join("")}</tr></thead><tbody>
        ${mine.slice(0, 12).map((r) => `<tr><td>${esc(shortDay(r.week_start))}</td>${metrics.map(([k]) => `<td class="num">${fmt(r.metrics[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></details>` : ""}
      <details class="an-details"><summary class="small"><b>＋ Add or fix a week's numbers</b></summary>
        <p class="muted small">${howTo}</p>
        <form class="an-form" data-ch="${key}">
          <label>Week starting (Monday)<input type="date" name="week_start" value="${lastMon}" required></label>
          ${metrics.map(([k, l]) => `<label>${esc(l)}<input type="number" min="0" step="1" name="${k}" inputmode="numeric"></label>`).join("")}
          <button class="btn" type="submit">Save week</button>
        </form></details>
    </section>`;
  }

  async function view({ sb, app, esc, toast, fail }) {
    const since = new Date(Date.now() - (days - 1) * 864e5); since.setHours(0, 0, 0, 0);
    const [visitsRes, inqRes, chRes] = await Promise.all([
      fetchAll(sb, "site_visits", "created_at, path, referrer, source, visitor_id, device, event", since.toISOString()),
      fetchAll(sb, "inquiries", "created_at, source", since.toISOString()),
      sb.from("channel_stats").select("week_start, channel, metrics").order("week_start", { ascending: false }).limit(60)
    ]);
    const missing = [visitsRes.error, chRes.error].some((e) => e && /site_visits|channel_stats|PGRST205|42P01/.test((e.code || "") + (e.message || "")));
    if (missing) {
      app.innerHTML = `<div class="page-head"><h2 class="h">Analytics</h2></div><section class="card pad"><h3>One-time setup</h3>
        <p>Paste <code>analytics.sql</code> into Supabase → SQL Editor → Run. Then this page fills in.</p></section>`;
      return;
    }
    if (visitsRes.error) return fail(visitsRes.error);
    const visits = visitsRes.data, views = visits.filter((v) => (v.event || "view") === "view"), calls = visits.filter((v) => v.event === "call");
    const inq = inqRes.error ? [] : inqRes.data;
    const visitorIds = new Set(views.map((v) => v.visitor_id || v.created_at));
    // First visit per visitor decides their source (so one person reading 3 pages counts once).
    const firstVisit = {};
    views.forEach((v) => { const k = v.visitor_id || v.created_at; if (!firstVisit[k]) firstVisit[k] = v; });
    const firsts = Object.values(firstVisit);
    const series = [];
    for (let i = 0; i < days; i++) {
      const day = dayKey(new Date(since.getTime() + i * 864e5 + 12 * 36e5));
      const dv = views.filter((v) => dayKey(v.created_at) === day);
      series.push({ day, n: new Set(dv.map((v) => v.visitor_id || v.created_at)).size, views: dv.length });
    }
    const rate = visitorIds.size ? ((inq.length / visitorIds.size) * 100).toFixed(1) + "%" : "—";
    const channels = chRes.data || [];

    app.innerHTML = `
      <div class="page-head"><h2 class="h">Analytics</h2>
        <div class="page-tools an-range" role="group" aria-label="Time range">${RANGES.map(([d, l]) => `<button type="button" class="btn ${d === days ? "" : "ghost"} small" data-days="${d}">${l}</button>`).join("")}</div></div>
      <p class="muted small tab-hint">Website numbers fill in on their own (counting started 2026-11-10). Google profile and LinkedIn numbers are added once a week below. Admins only.</p>

      <section class="card pad an-sec">
        <div class="an-head"><h3>🌐 Website traffic</h3><a class="small" href="https://affordablewebdesigns.vercel.app" target="_blank" rel="noopener">affordablewebdesigns.vercel.app</a></div>
        <div class="stats">
          <div class="stat"><span>Visitors</span><b>${fmt(visitorIds.size)}</b></div>
          <div class="stat"><span>Page views</span><b>${fmt(views.length)}</b></div>
          <div class="stat"><span>Free-design requests</span><b>${fmt(inq.length)}</b></div>
          <div class="stat"><span>Request rate</span><b>${rate}</b><div class="muted small">requests ÷ visitors</div></div>
          <div class="stat"><span>Phone taps</span><b>${fmt(calls.length)}</b></div>
        </div>
        <h4 class="an-sub">Visitors per day</h4>
        ${dailyChart(series, esc)}
      </section>

      <div class="an-cols">
        <section class="card pad an-sec"><h3>Where visitors came from</h3>${shareRows(countBy(firsts, sourceOf), firsts.length, esc)}</section>
        <section class="card pad an-sec"><h3>Free-design requests by source</h3><p class="muted small">From the form's “How did you hear about us?”</p>${shareRows(countBy(inq, (q) => q.source || "Didn't say"), inq.length, esc)}</section>
        <section class="card pad an-sec"><h3>Top pages</h3>${shareRows(countBy(views, (v) => pageName(v.path || "/")).slice(0, 8), views.length, esc)}</section>
        <section class="card pad an-sec"><h3>Phone vs computer</h3>${shareRows(countBy(firsts, (v) => (v.device === "phone" ? "Phone or tablet" : "Computer")), firsts.length, esc)}</section>
      </div>

      ${channelCard("google", "📍 Google Business Profile", GOOGLE, channels, esc,
        "Where to find them: search “Affordable Web Designs” on Google while signed in → Performance (or business.google.com → Performance). Pick the week, then copy each number.")}
      ${channelCard("linkedin", "💼 LinkedIn page", LINKEDIN, channels, esc,
        "Where to find them: your LinkedIn company page → Analytics (Content, Visitors and Followers). Set the date range to the week, then copy each number.")}`;

    app.querySelectorAll("[data-days]").forEach((b) => (b.onclick = () => { days = +b.dataset.days; view({ sb, app, esc, toast, fail }); }));

    // Hover tooltip on the daily chart.
    const chart = app.querySelector(".an-chart"), tip = chart && chart.querySelector(".an-tip");
    if (chart) {
      chart.querySelectorAll(".an-hit").forEach((h) => {
        h.onmouseenter = h.onclick = () => {
          const d = series[+h.dataset.i];
          tip.innerHTML = `<b>${esc(shortDay(d.day))}</b><br>${fmt(d.n)} visitor${d.n === 1 ? "" : "s"} · ${fmt(d.views)} page view${d.views === 1 ? "" : "s"}`;
          tip.hidden = false;
          const box = chart.getBoundingClientRect(), hb = h.getBoundingClientRect();
          tip.style.left = Math.min(box.width - tip.offsetWidth, Math.max(0, hb.left - box.left + hb.width / 2 - tip.offsetWidth / 2)) + "px";
          chart.querySelectorAll(".an-hit").forEach((x) => x.classList.toggle("on", x === h));
        };
      });
      chart.onmouseleave = () => { tip.hidden = true; chart.querySelectorAll(".an-hit.on").forEach((x) => x.classList.remove("on")); };
    }

    // Save a week of Google / LinkedIn numbers (one row per channel per week; saving again replaces it).
    app.querySelectorAll(".an-form").forEach((f) => (f.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(f), ch = f.dataset.ch, metrics = {};
      (ch === "google" ? GOOGLE : LINKEDIN).forEach(([k]) => { const v = fd.get(k); if (v !== "" && v != null) metrics[k] = Number(v); });
      if (!Object.keys(metrics).length) return toast("Type at least one number", true);
      const week_start = mondayOf(new Date(fd.get("week_start") + "T12:00:00"));
      const { error } = await sb.from("channel_stats").upsert({ week_start, channel: ch, metrics }, { onConflict: "week_start,channel" });
      if (error) return fail(error);
      toast(`Saved the week of ${shortDay(week_start)}`); view({ sb, app, esc, toast, fail });
    }));
  }

  window.AWDAnalytics = { view };
})();
