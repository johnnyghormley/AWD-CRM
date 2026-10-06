// Abby, the lead-finding agent, running across the Today screen and tossing lead cards into the pile.
// Just for fun. Uses real lead names when there are any.
window.AbbyRunner = (() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ABBY_SVG = `
  <svg class="abby" viewBox="0 0 120 170" aria-hidden="true">
    <g class="abby-body">
      <g class="leg leg-back"><rect x="53" y="98" width="11" height="40" rx="5" fill="#111827"/><rect x="49" y="134" width="20" height="9" rx="4" fill="#F97316"/></g>
      <g class="arm arm-back"><rect x="54" y="66" width="9" height="32" rx="4.5" fill="#E8B48A"/></g>
      <g class="ponytail"><path d="M44 30 C30 30 24 44 28 56 C34 48 40 44 46 42 Z" fill="#3B2314"/></g>
      <rect x="44" y="60" width="32" height="44" rx="10" fill="#FACC15"/>
      <path d="M52 74 L60 90 L68 74 M55 84 H65" fill="none" stroke="#1F2937" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="38" r="17" fill="#F2C39B"/>
      <path d="M43 36 C43 20 77 18 77 36 C70 30 60 27 50 30 C47 31 45 33 43 36 Z" fill="#3B2314"/>
      <circle cx="66" cy="38" r="2.2" fill="#1F2937"/>
      <path d="M63 46 Q67 49 71 45" fill="none" stroke="#1F2937" stroke-width="2" stroke-linecap="round"/>
      <circle cx="70" cy="43" r="3" fill="#F59E8B" opacity=".6"/>
      <g class="leg leg-front"><rect x="56" y="98" width="11" height="40" rx="5" fill="#1F2937"/><rect x="52" y="134" width="20" height="9" rx="4" fill="#F97316"/></g>
      <g class="arm arm-front"><rect x="57" y="66" width="9" height="32" rx="4.5" fill="#F2C39B"/>
        <g class="glass"><circle cx="62" cy="104" r="8" fill="#DBEAFE" stroke="#1F2937" stroke-width="3"/><rect x="60" y="94" width="4" height="6" fill="#1F2937"/></g>
      </g>
    </g>
  </svg>`;

  const HOUSE = (c) => `<svg viewBox="0 0 60 50"><path d="M5 25 L30 5 L55 25" fill="${c}"/><rect x="10" y="24" width="40" height="26" fill="#fff" stroke="#CBD5E1"/><rect x="26" y="34" width="9" height="16" fill="${c}"/><rect x="14" y="30" width="8" height="7" fill="#BFDBFE"/><rect x="39" y="30" width="8" height="7" fill="#BFDBFE"/></svg>`;

  function html(leads) {
    const now = Date.now(), day = 864e5;
    const todayCount = leads.filter((l) => now - new Date(l.created_at) < day).length;
    const weekCount = leads.filter((l) => now - new Date(l.created_at) < 7 * day).length;
    const houses = ["#1F2937", "#B45309", "#0F766E", "#7C2D12", "#1D4ED8", "#374151"];
    const row = houses.concat(houses).map((c) => `<span class="house">${HOUSE(c)}</span>`).join("");
    return `
    <section class="abby-scene" id="abby-scene" title="Click Abby to make her sprint">
      <div class="sky"><span class="sun"></span><span class="cloud c1"></span><span class="cloud c2"></span></div>
      <div class="houses"><div class="houses-track">${row}${row}</div></div>
      <div class="road"></div>
      <div class="abby-wrap" id="abby-btn" role="button" tabindex="0" aria-label="Abby. Click to make her sprint">${ABBY_SVG}<div class="bubble" id="abby-bubble">On the hunt for leads…</div></div>
      <div class="cards" id="abby-cards"></div>
      <div class="pile" aria-hidden="true"><span></span><span></span><span></span><b id="abby-pile">${leads.length}</b><small>leads</small></div>
      <div class="abby-stats"><b>Abby</b> · found <b>${todayCount}</b> today · <b>${weekCount}</b> this week</div>
    </section>`;
  }

  function start(leads) {
    const scene = document.getElementById("abby-scene");
    if (!scene) return;
    const cards = document.getElementById("abby-cards");
    const bubble = document.getElementById("abby-bubble");
    const recent = leads.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 12);
    const names = recent.length ? recent.map((l) => [l.business_name, [l.trade, l.city].filter(Boolean).join(" · ")])
      : [["Plumber?", "Pasadena"], ["HVAC?", "Deer Park"], ["Insulation?", "La Porte"]];
    const lines = recent.length
      ? ["On the hunt for leads…", "Found an owner's number!", "This one has no website 👀", "Checking Google Maps…", "Another one for the pile!", "Website from 2012? Lead!"]
      : ["Warming up…", "Waiting for my next batch!", "Point me at some plumbers 🔧", "Ready when you are!"];
    let i = 0, j = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function toss() {
      if (!document.body.contains(scene)) return clearInterval(t1), clearInterval(t2);
      const [name, sub] = names[i++ % names.length];
      const c = document.createElement("div");
      c.className = "lead-card";
      c.innerHTML = `<b>${esc(name)}</b><small>${esc(sub)}</small>`;
      cards.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
    function talk() {
      if (!document.body.contains(scene)) return;
      bubble.textContent = lines[j++ % lines.length];
      bubble.classList.remove("pop"); void bubble.offsetWidth; bubble.classList.add("pop");
    }
    let t1 = setInterval(toss, reduce ? 6000 : 2200), t2 = setInterval(talk, 4200);
    toss();

    const sprint = () => {
      scene.classList.add("sprint");
      bubble.textContent = "Sprinting! 🏃‍♀️💨";
      for (let k = 0; k < 3; k++) setTimeout(toss, k * 350);
      clearTimeout(scene._s);
      scene._s = setTimeout(() => scene.classList.remove("sprint"), 3000);
    };
    const btn = document.getElementById("abby-btn");
    btn.addEventListener("click", sprint);
    btn.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), sprint()));
  }

  return { html, start };
})();
