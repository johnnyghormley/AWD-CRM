// Dex system panel for the top of the Designs page (same look as Abby's panel on Today):
// a turning wireframe page being built, a render trace, a system log built from real
// design data, and pipeline metrics.
window.DexRunner = (() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = 864e5;
  const ts = (d) => new Date(d).toLocaleTimeString("en-US", { hour12: false });
  const stamp = (d) => {
    const t = new Date(d), now = new Date();
    return t.toDateString() === now.toDateString() ? ts(t) : t.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }) + " " + ts(t).slice(0, 5);
  };
  const path = (u) => { try { const x = new URL(u); return x.pathname.replace(/\/$/, ""); } catch { return ""; } };

  function stats(designs, reqs) {
    const now = Date.now();
    const open = designs.filter((d) => d.status !== "archived");
    const by = (...s) => open.filter((d) => s.includes(d.status)).length;
    return {
      total: open.length,
      day: open.filter((d) => now - new Date(d.created_at) < DAY).length,
      week: open.filter((d) => now - new Date(d.created_at) < 7 * DAY).length,
      queue: reqs.filter((r) => r.status !== "done").length,
      failed: reqs.filter((r) => r.status === "build_failed").length,
      building: reqs.some((r) => ["in_progress", "build_requested"].includes(r.status)),
      unsent: by("building"), sent: by("sent"), won: by("approved", "paid"), live: by("live"),
    };
  }

  function html(designs, reqs) {
    const s = stats(designs, reqs);
    const on = s.building || s.day > 0;
    const bar = (label, n) => `<div class="m-bar"><span>${label}</span><i><em style="width:${s.total ? Math.max(2, (n / s.total) * 100) : 0}%"></em></i><b>${n}</b></div>`;
    return `
    <section class="ai-panel" id="dex-scene">
      <header class="ai-head">
        <span class="ai-dot ${on ? "on" : ""}"></span>
        <b>DEX</b><span class="ai-sub">DESIGN STUDIO</span>
        <span class="ai-state">${s.building ? "BUILDING" : on ? "ACTIVE" : "STANDBY"}</span>
        <span class="ai-clock" id="dx-clock"></span>
      </header>
      <div class="ai-body">
        <div class="ai-core"><canvas id="dx-core" aria-hidden="true"></canvas><div class="ai-core-label dx-label"><b>${s.total}</b><small>DESIGNS BUILT</small></div></div>
        <div class="ai-mid">
          <canvas id="dx-wave" class="ai-wave" aria-hidden="true"></canvas>
          <div class="ai-log" id="dx-log" aria-live="off"></div>
        </div>
        <div class="ai-metrics">
          <div class="m-row"><div><span>BUILT 24H</span><b>${s.day}</b></div><div><span>7 DAYS</span><b>${s.week}</b></div></div>
          <div class="m-row"><div><span>IN QUEUE</span><b class="${s.failed ? "warn" : ""}">${s.queue}</b></div><div><span>NOT SENT</span><b class="${s.unsent ? "warn" : ""}">${s.unsent}</b></div></div>
          ${bar("SENT", s.sent)}${bar("APPROVED", s.won)}${bar("LIVE", s.live)}
        </div>
      </div>
    </section>`;
  }

  function logLines(designs, reqs) {
    const s = stats(designs, reqs);
    const recent = designs.filter((d) => d.status !== "archived").slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8).reverse();
    const lbl = { building: "built, not sent", sent: "sent", approved: "approved", paid: "paid", live: "live" };
    const open = reqs.filter((r) => r.status !== "done");
    return [
      [Date.now(), "SYS", `design index loaded · ${s.total} designs`],
      [Date.now(), "SYS", `studio · one-page sites · bay area houston`],
      ...recent.map((d) => [d.created_at, "BLD", `${d.business} · ${lbl[d.status] || d.status}${path(d.preview) ? " · " + path(d.preview) : ""}`]),
      ...open.slice(0, 4).map((r) => [r.created_at, r.status === "build_failed" ? "ALRT" : "QUE", `${r.business} · ${r.status === "build_failed" ? "build didn't finish" : r.status === "in_progress" ? "building now" : r.status === "build_requested" ? "build requested" : "queued"}`]),
      [Date.now(), "PIPE", `${s.unsent} not sent · ${s.sent} sent · ${s.won} approved · ${s.live} live`],
      [Date.now(), s.unsent ? "ALRT" : "SYS", s.unsent ? `${s.unsent} design${s.unsent > 1 ? "s" : ""} waiting to be sent` : "every design has been sent"],
      [Date.now(), "SYS", s.building ? "render pipeline active" : "standing by for the next build"],
    ];
  }

  function start(designs, reqs) {
    const scene = document.getElementById("dex-scene");
    if (!scene) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alive = () => document.body.contains(scene);

    // clock
    const clock = document.getElementById("dx-clock");
    const tick = () => { if (!alive()) return clearInterval(ct); clock.textContent = ts(Date.now()); };
    const ct = setInterval(tick, 1000); tick();

    // log: print lines one by one, then keep cycling
    const log = document.getElementById("dx-log");
    const lines = logLines(designs, reqs);
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
    const core = document.getElementById("dx-core"), wave = document.getElementById("dx-wave");
    const fit = (c) => { const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1; c.width = r.width * d; c.height = r.height * d; const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return [x, r.width, r.height]; };
    let [cx, cw, chh] = fit(core), [wx, ww, wh] = fit(wave);
    const onResize = () => { [cx, cw, chh] = fit(core); [wx, ww, wh] = fit(wave); };
    window.addEventListener("resize", onResize);

    // wireframe homepage: blocks in page units (x, y, w, h) on a 1 x 1.3 page
    const BLOCKS = [
      [0.06, 0.04, 0.88, 0.07, 1], // header
      [0.06, 0.15, 0.55, 0.06, 2], [0.06, 0.24, 0.4, 0.04, 0], [0.06, 0.31, 0.22, 0.05, 1], // hero text + button
      [0.66, 0.15, 0.28, 0.21, 0], // hero image
      [0.06, 0.44, 0.27, 0.2, 0], [0.365, 0.44, 0.27, 0.2, 0], [0.67, 0.44, 0.27, 0.2, 0], // services
      [0.06, 0.72, 0.88, 0.04, 0], [0.06, 0.79, 0.6, 0.04, 0], // about
      [0.06, 0.9, 0.42, 0.28, 0], [0.52, 0.9, 0.42, 0.28, 2], // contact + map
      [0.06, 1.22, 0.88, 0.04, 1], // footer
    ];
    const intensity = Math.min(1, 0.35 + designs.length / 20);
    const CYCLE = 7000;

    function drawCore(t) {
      const ox = cw / 2, oy = chh * 0.42, H = Math.min(cw, chh) * 0.62, W = H / 1.3;
      cx.clearRect(0, 0, cw, chh);
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002);
      const g = cx.createRadialGradient(ox, oy, 0, ox, oy, H * 0.8);
      g.addColorStop(0, `rgba(250,204,21,${0.12 + 0.1 * pulse * intensity})`); g.addColorStop(1, "rgba(250,204,21,0)");
      cx.fillStyle = g; cx.beginPath(); cx.arc(ox, oy, H * 0.8, 0, 7); cx.fill();

      // page turns gently in 3D (y-axis), with two ghost layers behind it
      const a = Math.sin(t * 0.0005) * 0.55, ca = Math.cos(a), sa = Math.sin(a), persp = 2.6;
      const proj = (px, py, z) => {
        const x = (px - 0.5) * W, y = (py - 0.65) * W, x1 = x * ca, z1 = x * sa + z;
        const k = persp / (persp + z1 / W);
        return [ox + x1 * k, oy + y * k];
      };
      const quad = (x, y, w, h, z) => { const p = [proj(x, y, z), proj(x + w, y, z), proj(x + w, y + h, z), proj(x, y + h, z)]; cx.beginPath(); cx.moveTo(...p[0]); p.slice(1).forEach((q) => cx.lineTo(...q)); cx.closePath(); };
      [[0.16, 0.12], [0.08, 0.22]].forEach(([dz, al]) => { quad(0, 0, 1, 1.3, dz * W); cx.strokeStyle = `rgba(156,163,175,${al})`; cx.lineWidth = 1; cx.stroke(); });
      quad(0, 0, 1, 1.3, 0); cx.fillStyle = "rgba(17,24,39,.55)"; cx.fill(); cx.strokeStyle = "rgba(209,213,219,.55)"; cx.lineWidth = 1.2; cx.stroke();

      // blocks appear one by one, then the page holds and restarts
      const ph = (t % CYCLE) / CYCLE, shown = Math.min(BLOCKS.length, Math.floor(ph / 0.7 * BLOCKS.length) + 1);
      BLOCKS.slice(0, reduce ? BLOCKS.length : shown).forEach(([x, y, w, h, kind], i) => {
        const fresh = !reduce && i === shown - 1 && ph < 0.7;
        quad(x, y / 1.0, w, h, 0);
        if (kind === 1) { cx.fillStyle = fresh ? "rgba(250,204,21,.9)" : "rgba(250,204,21,.55)"; cx.fill(); }
        else if (kind === 2) { cx.fillStyle = "rgba(243,244,246,.22)"; cx.fill(); }
        cx.strokeStyle = fresh ? "rgba(250,204,21,.95)" : "rgba(209,213,219,.45)"; cx.lineWidth = fresh ? 1.4 : 0.8; cx.stroke();
      });
      // scan line
      if (!reduce) {
        const sy = (ph < 0.7 ? ph / 0.7 : 1) * 1.3;
        const [l1, l2] = [proj(0, sy, 0), proj(1, sy, 0)];
        cx.strokeStyle = `rgba(250,204,21,${ph < 0.7 ? 0.8 : 0.8 * (1 - (ph - 0.7) / 0.3)})`; cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(...l1); cx.lineTo(...l2); cx.stroke();
      }
      // orbit rings
      const R = Math.min(cw, chh) * 0.36;
      cx.lineWidth = 1;
      [[1.32, 0.28, 0.0006, "rgba(250,204,21,.45)"], [1.48, 0.62, -0.0004, "rgba(156,163,175,.3)"]].forEach(([k, sq, sp, col]) => {
        cx.save(); cx.translate(ox, oy); cx.rotate(t * sp); cx.scale(1, sq);
        cx.strokeStyle = col; cx.setLineDash([R * 0.5, R * 0.18, 3, R * 0.18]);
        cx.beginPath(); cx.arc(0, 0, R * k, 0, 7); cx.stroke(); cx.restore();
      });
      cx.setLineDash([]);
    }

    // render trace: a row of bars, like a build meter sweeping across
    function drawWave(t) {
      wx.clearRect(0, 0, ww, wh);
      wx.strokeStyle = "rgba(255,255,255,.06)"; wx.lineWidth = 1;
      for (let x = 0; x < ww; x += 24) { wx.beginPath(); wx.moveTo(x, 0); wx.lineTo(x, wh); wx.stroke(); }
      const n = Math.floor(ww / 6), head = ((t * 0.00012) % 1.2) * n;
      for (let i = 0; i < n; i++) {
        const p = i / n, d = head - i;
        const h = (0.25 + 0.75 * Math.abs(Math.sin(p * 23 + t * 0.003) * 0.6 + Math.sin(p * 9 - t * 0.0015) * 0.4)) * intensity;
        const lit = d >= 0 && d < 14;
        wx.fillStyle = lit ? `rgba(250,204,21,${0.95 - d / 16})` : d >= 14 ? "rgba(209,213,219,.35)" : "rgba(209,213,219,.12)";
        const bh = Math.max(2, h * (wh - 12));
        wx.fillRect(i * 6 + 1, wh - 6 - bh, 3, bh);
      }
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
