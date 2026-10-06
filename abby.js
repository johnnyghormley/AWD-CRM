// Abby, AWD's lead-finding AI, as a running hologram in a HUD scene on the Today screen.
// Just for fun. Uses real lead names when there are any.
window.AbbyRunner = (() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const F = 'fill="rgba(34,211,238,.16)" stroke="#67E8F9" stroke-width="2"';

  const ABBY_SVG = `
  <svg class="abby" viewBox="0 0 120 170" aria-hidden="true">
    <g class="abby-body">
      <g class="leg leg-back"><rect x="53" y="98" width="11" height="40" rx="5" ${F} opacity=".55"/><rect x="49" y="134" width="20" height="8" rx="4" fill="#FACC15" opacity=".55"/></g>
      <g class="arm arm-back"><rect x="54" y="66" width="9" height="32" rx="4.5" ${F} opacity=".55"/></g>
      <g class="ponytail"><path d="M44 30 C30 30 24 44 28 56 C34 48 40 44 46 42 Z" ${F}/></g>
      <rect x="44" y="60" width="32" height="44" rx="10" ${F}/>
      <path d="M52 76 L60 92 L68 76 M55 86 H65" fill="none" stroke="#FACC15" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M48 66 H72 M48 98 H72" stroke="#67E8F9" stroke-width="1" opacity=".5"/>
      <circle cx="60" cy="38" r="17" ${F}/>
      <path d="M43 36 C43 20 77 18 77 36 C70 30 60 27 50 30 C47 31 45 33 43 36 Z" fill="rgba(103,232,249,.35)"/>
      <rect class="visor" x="54" y="34" width="22" height="6" rx="3" fill="#FACC15"/>
      <path d="M62 47 Q67 50 72 46" fill="none" stroke="#67E8F9" stroke-width="2" stroke-linecap="round"/>
      <g class="leg leg-front"><rect x="56" y="98" width="11" height="40" rx="5" ${F}/><rect x="52" y="134" width="20" height="8" rx="4" fill="#FACC15"/></g>
      <g class="arm arm-front"><rect x="57" y="66" width="9" height="32" rx="4.5" ${F}/>
        <g class="pad"><rect x="54" y="96" width="18" height="12" rx="2" fill="rgba(250,204,21,.25)" stroke="#FACC15" stroke-width="1.5"/><path d="M57 100 H69 M57 104 H65" stroke="#FACC15" stroke-width="1.2"/></g>
      </g>
    </g>
  </svg>`;

  const RING = `
  <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="92" fill="none" stroke="#22D3EE" stroke-width="1" opacity=".35"/>
    <circle class="spin" cx="100" cy="100" r="84" fill="none" stroke="#22D3EE" stroke-width="3" stroke-dasharray="40 18 6 18" opacity=".8"/>
    <circle class="spin-r" cx="100" cy="100" r="74" fill="none" stroke="#FACC15" stroke-width="2" stroke-dasharray="90 380" opacity=".9"/>
    <path d="M100 2 V14 M100 186 V198 M2 100 H14 M186 100 H198" stroke="#67E8F9" stroke-width="2"/>
  </svg>`;

  const building = (w, h) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect x="1" y="1" width="${w - 2}" height="${h - 1}" fill="rgba(34,211,238,.05)" stroke="rgba(103,232,249,.45)"/>${Array.from({ length: Math.floor((h - 10) / 12) }, (_, r) => Array.from({ length: Math.floor((w - 8) / 10) }, (_, c) => `<rect x="${6 + c * 10}" y="${8 + r * 12}" width="4" height="5" fill="${(r * 7 + c * 3) % 5 ? "rgba(103,232,249,.25)" : "rgba(250,204,21,.7)"}"/>`).join("")).join("")}</svg>`;

  function html(leads) {
    const now = Date.now(), day = 864e5;
    const todayCount = leads.filter((l) => now - new Date(l.created_at) < day).length;
    const weekCount = leads.filter((l) => now - new Date(l.created_at) < 7 * day).length;
    const sizes = [[34, 60], [26, 38], [44, 74], [30, 50], [22, 30], [40, 64], [28, 44], [36, 56]];
    const row = sizes.map(([w, h]) => `<span class="bldg">${building(w, h)}</span>`).join("");
    return `
    <section class="abby-scene" id="abby-scene">
      <div class="hud-grid"></div>
      <div class="city"><div class="city-track">${row}${row}${row}${row}</div></div>
      <div class="floor"></div>
      <div class="scan"></div>
      <div class="hud-top">
        <span class="dot"></span><b>A.B.B.Y</b><span class="sep">//</span>LEAD ENGINE <span class="ok">ONLINE</span>
        <span class="hud-stats">TODAY <b>${todayCount}</b> · WEEK <b>${weekCount}</b></span>
      </div>
      <div class="abby-wrap" id="abby-btn" role="button" tabindex="0" aria-label="Abby. Click to boost">${RING}${ABBY_SVG}</div>
      <div class="log" id="abby-log"><span class="caret">›</span> <span id="abby-line">initializing lead scan…</span></div>
      <div class="cards" id="abby-cards"></div>
      <div class="gauge" aria-hidden="true">
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(103,232,249,.25)" stroke-width="6"/><circle class="spin" cx="50" cy="50" r="44" fill="none" stroke="#22D3EE" stroke-width="6" stroke-dasharray="60 216" stroke-linecap="round"/><circle cx="50" cy="50" r="34" fill="none" stroke="rgba(250,204,21,.5)" stroke-width="1" stroke-dasharray="2 4"/></svg>
        <b id="abby-pile">${leads.length}</b><small>LEADS ACQUIRED</small>
      </div>
      <div class="hud-corner tl"></div><div class="hud-corner tr"></div><div class="hud-corner bl"></div><div class="hud-corner br"></div>
    </section>`;
  }

  function start(leads) {
    const scene = document.getElementById("abby-scene");
    if (!scene) return;
    const cards = document.getElementById("abby-cards");
    const line = document.getElementById("abby-line");
    const recent = leads.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
    const names = recent.length ? recent.map((l) => [l.business_name, [l.trade, l.city].filter(Boolean).join(" · "), l.owner_name])
      : [["SCANNING…", "Plumbing · Pasadena"], ["SCANNING…", "HVAC · Deer Park"], ["SCANNING…", "Insulation · La Porte"]];
    const lines = recent.length
      ? ["sweeping google maps · bay area houston", "owner match found · confidence high", "website check: no domain detected", "cross-referencing tx license records", "website age > 10 yrs · flagged", "lead acquired · added to pipeline"]
      : ["lead engine idle · awaiting next batch", "targets loaded: plumbing · hvac · insulation", "standing by for orders, johnathon", "systems nominal"];
    let i = 0, j = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alive = () => document.body.contains(scene);

    function type(text) {
      clearInterval(line._t);
      let k = 0;
      line.textContent = "";
      line._t = setInterval(() => {
        if (!alive() || k > text.length) return clearInterval(line._t);
        line.textContent = text.slice(0, k++);
      }, reduce ? 0 : 28);
    }
    function toss() {
      if (!alive()) return clearInterval(t1), clearInterval(t2);
      const [name, sub, owner] = names[i++ % names.length];
      const c = document.createElement("div");
      c.className = "lead-card";
      c.innerHTML = `<i>LEAD ${String(i).padStart(3, "0")}</i><b>${esc(name)}</b><small>${esc(sub)}${owner ? " · " + esc(owner) : ""}</small>`;
      cards.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
    function talk() { if (alive()) type(lines[j++ % lines.length]); }
    let t1 = setInterval(toss, reduce ? 6000 : 2200), t2 = setInterval(talk, 4200);
    toss(); talk();

    const boost = () => {
      scene.classList.add("sprint");
      type("boost engaged · max scan speed");
      for (let k = 0; k < 3; k++) setTimeout(toss, k * 350);
      clearTimeout(scene._s);
      scene._s = setTimeout(() => scene.classList.remove("sprint"), 3000);
    };
    const btn = document.getElementById("abby-btn");
    btn.addEventListener("click", boost);
    btn.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), boost()));
  }

  return { html, start };
})();
