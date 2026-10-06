// Abby system panel for the Today screen: a rotating neural core, a signal trace,
// a system log built from real CRM data, and pipeline metrics.
window.AbbyRunner = (() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 864e5;
  const ts = (d) => new Date(d).toLocaleTimeString("en-US", { hour12: false });
  const stamp = (d) => {
    const t = new Date(d), now = new Date();
    return t.toDateString() === now.toDateString() ? ts(t) : t.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }) + " " + ts(t).slice(0, 5);
  };

  function stats(leads) {
    const now = Date.now();
    const by = (s) => leads.filter((l) => l.call_status === s).length;
    const today = new Date().toLocaleDateString("en-CA");
    return {
      total: leads.length,
      day: leads.filter((l) => now - new Date(l.created_at) < DAY).length,
      week: leads.filter((l) => now - new Date(l.created_at) < 7 * DAY).length,
      qualified: leads.filter((l) => l.lead_status === "Qualified").length,
      missing: leads.filter((l) => l.lead_status === "Missing Info").length,
      fresh: by("New"), design: by("Design Sent"), won: by("Won"),
      due: leads.filter((l) => l.follow_up_date && l.follow_up_date <= today && !["Won", "Not Interested", "Do Not Call"].includes(l.call_status)).length,
      active: leads.some((l) => now - new Date(l.created_at) < DAY),
    };
  }

  function html(leads) {
    const s = stats(leads);
    const pct = s.total ? Math.round((s.qualified / s.total) * 100) : 0;
    const bar = (label, n) => `<div class="m-bar"><span>${label}</span><i><em style="width:${s.total ? Math.max(2, (n / s.total) * 100) : 0}%"></em></i><b>${n}</b></div>`;
    return `
    <section class="ai-panel" id="abby-scene">
      <header class="ai-head">
        <span class="ai-dot ${s.active ? "on" : ""}"></span>
        <b>ABBY</b><span class="ai-sub">LEAD INTELLIGENCE</span>
        <span class="ai-state">${s.active ? "ACTIVE" : "STANDBY"}</span>
        <span class="ai-clock" id="ai-clock"></span>
      </header>
      <div class="ai-body">
        <div class="ai-core"><canvas id="ai-core" aria-hidden="true"></canvas><div class="ai-core-label">CORE<br><b>${s.total}</b><small>RECORDS</small></div></div>
        <div class="ai-mid">
          <canvas id="ai-wave" class="ai-wave" aria-hidden="true"></canvas>
          <div class="ai-log" id="ai-log" aria-live="off"></div>
        </div>
        <div class="ai-metrics">
          <div class="m-row"><div><span>ACQUIRED 24H</span><b>${s.day}</b></div><div><span>7 DAYS</span><b>${s.week}</b></div></div>
          <div class="m-row"><div><span>QUALIFIED</span><b>${pct}<small>%</small></b></div><div><span>DUE NOW</span><b class="${s.due ? "warn" : ""}">${s.due}</b></div></div>
          ${bar("NEW", s.fresh)}${bar("DESIGN SENT", s.design)}${bar("WON", s.won)}
        </div>
      </div>
    </section>`;
  }

  function logLines(leads) {
    const s = stats(leads);
    const recent = leads.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8).reverse();
    const lines = [
      [Date.now(), "SYS", `lead index loaded · ${s.total} records`],
      [Date.now(), "SYS", `targets · plumbing / hvac / insulation · bay area houston`],
      ...recent.map((l) => [l.created_at, "ACQ", `${l.business_name}${l.trade ? " · " + l.trade : ""}${l.city ? " · " + l.city : ""}${l.owner_name ? " · owner " + l.owner_name : ""}`]),
      [Date.now(), "PIPE", `${s.fresh} new · ${s.design} design sent · ${s.won} won`],
      [Date.now(), s.due ? "ALRT" : "SYS", s.due ? `${s.due} follow-up${s.due > 1 ? "s" : ""} due` : "no follow-ups due"],
      [Date.now(), "SYS", s.active ? "acquisition stream active" : "standing by for next research batch"],
    ];
    return lines;
  }

  function start(leads) {
    const scene = document.getElementById("abby-scene");
    if (!scene) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alive = () => document.body.contains(scene);

    // clock
    const clock = document.getElementById("ai-clock");
    const tick = () => { if (!alive()) return clearInterval(ct); clock.textContent = ts(Date.now()); };
    const ct = setInterval(tick, 1000); tick();

    // log: print lines one by one, then keep cycling the acquisitions
    const log = document.getElementById("ai-log");
    const lines = logLines(leads);
    let li = 0;
    const print = () => {
      if (!alive()) return clearInterval(lt);
      const [t, tag, msg] = lines[li++ % lines.length];
      const row = document.createElement("div");
      row.className = "ai-line t-" + tag.toLowerCase();
      row.innerHTML = `<span class="ai-ts">${stamp(t)}</span><span class="ai-tag">${tag}</span><span class="ai-msg">${esc(msg)}</span>`;
      log.appendChild(row);
      while (log.children.length > 6) log.removeChild(log.firstChild);
    };
    if (reduce) lines.slice(-6).forEach(() => print());
    const lt = setInterval(print, reduce ? 999999 : 1400); print();

    // canvases
    const core = document.getElementById("ai-core"), wave = document.getElementById("ai-wave");
    const fit = (c) => { const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return [x, r.width, r.height]; };
    let [cx, cw, chh] = fit(core), [wx, ww, wh] = fit(wave);
    const onResize = () => { [cx, cw, chh] = fit(core); [wx, ww, wh] = fit(wave); };
    window.addEventListener("resize", onResize);

    // fibonacci sphere
    const N = 140, pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    const links = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]);
      if (d < 0.3) links.push([i, j]);
    }
    const intensity = Math.min(1, 0.35 + leads.length / 40);

    function drawCore(t) {
      const R = Math.min(cw, chh) * 0.36, ox = cw / 2, oy = chh / 2;
      cx.clearRect(0, 0, cw, chh);
      const a = t * 0.00025, tilt = 0.45, ca = Math.cos(a), sa = Math.sin(a), ct2 = Math.cos(tilt), st = Math.sin(tilt);
      const P = pts.map(([x, y, z]) => {
        const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
        const y1 = y * ct2 - z1 * st, z2 = y * st + z1 * ct2;
        return [ox + x1 * R, oy + y1 * R, z2];
      });
      // glow
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002);
      const g = cx.createRadialGradient(ox, oy, 0, ox, oy, R * 1.25);
      g.addColorStop(0, `rgba(250,204,21,${0.14 + 0.1 * pulse * intensity})`); g.addColorStop(1, "rgba(250,204,21,0)");
      cx.fillStyle = g; cx.beginPath(); cx.arc(ox, oy, R * 1.25, 0, 7); cx.fill();
      // links
      cx.lineWidth = 0.6;
      for (const [i, j] of links) {
        const z = (P[i][2] + P[j][2]) / 2;
        cx.strokeStyle = `rgba(209,213,219,${0.04 + 0.22 * ((z + 1) / 2)})`;
        cx.beginPath(); cx.moveTo(P[i][0], P[i][1]); cx.lineTo(P[j][0], P[j][1]); cx.stroke();
      }
      // nodes
      P.forEach(([x, y, z], i) => {
        const hot = i % 17 === Math.floor(t / 400) % 17;
        cx.fillStyle = hot ? "rgba(250,204,21,.95)" : `rgba(243,244,246,${0.25 + 0.75 * ((z + 1) / 2)})`;
        cx.beginPath(); cx.arc(x, y, hot ? 2.4 : 1 + (z + 1) * 0.6, 0, 7); cx.fill();
      });
      // orbit rings
      cx.lineWidth = 1;
      [[1.32, 0.28, 0.0006, "rgba(250,204,21,.55)"], [1.48, 0.62, -0.0004, "rgba(156,163,175,.35)"]].forEach(([k, sq, sp, col]) => {
        cx.save(); cx.translate(ox, oy); cx.rotate(t * sp); cx.scale(1, sq);
        cx.strokeStyle = col; cx.setLineDash([R * 0.5, R * 0.18, 3, R * 0.18]);
        cx.beginPath(); cx.arc(0, 0, R * k, 0, 7); cx.stroke(); cx.restore();
      });
      cx.setLineDash([]);
    }

    function drawWave(t) {
      wx.clearRect(0, 0, ww, wh);
      const mid = wh / 2;
      wx.strokeStyle = "rgba(255,255,255,.06)"; wx.lineWidth = 1;
      for (let x = 0; x < ww; x += 24) { wx.beginPath(); wx.moveTo(x, 0); wx.lineTo(x, wh); wx.stroke(); }
      wx.beginPath(); wx.moveTo(0, mid); wx.lineTo(ww, mid); wx.stroke();
      [[1, "rgba(250,204,21,.95)", 1.6], [0.55, "rgba(209,213,219,.5)", 1]].forEach(([amp, col, lw]) => {
        wx.strokeStyle = col; wx.lineWidth = lw; wx.beginPath();
        for (let x = 0; x <= ww; x += 2) {
          const p = x / ww;
          const env = Math.sin(Math.PI * p);
          const y = mid + env * amp * (wh * 0.32) * intensity * (Math.sin(p * 18 - t * 0.004) * 0.6 + Math.sin(p * 41 + t * 0.007) * 0.3 + Math.sin(p * 7 - t * 0.002) * 0.4);
          x ? wx.lineTo(x, y) : wx.moveTo(x, y);
        }
        wx.stroke();
      });
    }

    function frame(t) {
      if (!alive()) return window.removeEventListener("resize", onResize);
      drawCore(t); drawWave(t);
      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return { html, start };
})();
