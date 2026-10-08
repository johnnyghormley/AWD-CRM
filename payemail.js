// Branded payment email for the "Email it" button on a lead page.
// Builds an HTML email (logo, package box, big Pay button), shows a preview, then copies it as rich text and
// opens a Gmail draft (to + subject filled) from the AWD account. Johnny pastes (Ctrl+V) and sends.
(() => {
  const LOGO = "https://affordablewebdesigns.vercel.app/email/awd-logo.png";
  const SITE = "affordablewebdesigns.vercel.app";
  const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function build({ first, business, pkg }) {
    const lines = pkg.lines || [pkg.detail];
    const next = pkg.monthly
      ? "Once your payment goes through, I'll get your website live and send you the link."
      : "Once your payment goes through, I'll send you your finished website and everything you need to run it.";
    const fine = "You'll pay by card on Stripe's secure checkout and get a receipt by email." + (pkg.monthly ? " You can cancel the monthly plan anytime." : "");
    const html = `
<div style="background:#F3F4F6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#1F2937">
 <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border-collapse:separate">
  <tr><td style="background:#1F2937;padding:18px 24px;border-bottom:4px solid #FACC15">
   <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:12px"><img src="${LOGO}" width="40" height="40" alt="AWD" style="display:block;border:0;border-radius:8px"></td>
    <td style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px">Affordable Web Designs</td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:28px 24px 8px 24px;font-size:16px;line-height:1.55">
   <p style="margin:0 0 14px 0">Hi ${h(first)},</p>
   <p style="margin:0 0 20px 0">Thanks for choosing Affordable Web Designs! Here's your secure payment link${business ? " for <b>" + h(business) + "</b>" : ""}.</p>
   <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#FEF9C3;border-left:4px solid #FACC15;border-radius:8px">
    <tr><td style="padding:14px 16px">
     <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6B7280;font-weight:bold">What you're getting</div>
     <div style="font-size:18px;font-weight:bold;margin:4px 0 8px 0">${h(pkg.label)}</div>
     ${lines.map((l) => `<div style="font-size:15px;margin:3px 0">&#10003;&nbsp; ${h(l)}</div>`).join("")}
    </td></tr>
   </table>
   <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 10px auto">
    <tr><td align="center" style="background:#FACC15;border-radius:10px">
     <a href="${h(pkg.url)}" style="display:inline-block;padding:15px 34px;font-size:17px;font-weight:bold;color:#1F2937;text-decoration:none">Pay securely &rarr;</a>
    </td></tr>
   </table>
   <p style="margin:0 0 22px 0;text-align:center;font-size:13px;color:#6B7280">${h(fine)}<br>Button not working? Use this link: <a href="${h(pkg.url)}" style="color:#1F2937">${h(pkg.url)}</a></p>
   <p style="margin:0 0 6px 0;font-weight:bold">What happens next</p>
   <p style="margin:0 0 20px 0">${h(next)}</p>
   <p style="margin:0 0 22px 0">Questions? Call or text me at <a href="tel:+18325080059" style="color:#1F2937;font-weight:bold">832-508-0059</a>.</p>
   <p style="margin:0 0 4px 0">Thanks,</p>
   <p style="margin:0 0 24px 0"><b>Johnny Ghormley</b><br><span style="color:#6B7280">Affordable Web Designs</span></p>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:14px 24px;font-size:12px;color:#6B7280;text-align:center;border-top:1px solid #E5E7EB">
   Affordable Web Designs &middot; Bay Area Houston, TX &middot; <a href="https://${SITE}" style="color:#6B7280">${SITE}</a> &middot; 832-508-0059
  </td></tr>
 </table>
</div>`;
    const text = [`Hi ${first},`, "", "Thanks for choosing Affordable Web Designs! Here's your secure payment link:", "", pkg.url, "",
      `WHAT YOU'RE GETTING: ${pkg.label}`, ...lines.map((l) => "  • " + l), "", fine, "", "WHAT HAPPENS NEXT: " + next, "",
      "Questions? Call or text me at 832-508-0059.", "", "Johnny Ghormley", "Affordable Web Designs", SITE].join("\n");
    return { html, text };
  }

  function gmailUrl(to, subject, body) {
    const p = { authuser: "affordablewebdesignsawd@gmail.com", view: "cm", fs: "1", to, su: subject };
    if (body) p.body = body;
    return "https://mail.google.com/mail/?" + new URLSearchParams(p).toString();
  }

  // Show the preview; resolves true if the email was handed to Gmail.
  window.AWDPayEmail = function open({ to, first, business, pkg, onSent }) {
    const { html, text } = build({ first, business, pkg });
    const subject = `Your ${business ? business + " " : ""}website: secure payment link`;
    const wrap = document.createElement("div");
    wrap.className = "pe-overlay";
    wrap.innerHTML = `
      <div class="pe-box" role="dialog" aria-modal="true" aria-label="Payment email preview">
        <div class="pe-head"><b>Email preview</b><span class="muted small">To: ${h(to)} · Subject: ${h(subject)}</span></div>
        <div class="pe-preview">${html}</div>
        <div class="pe-actions">
          <button type="button" class="btn" id="pe-go">Copy email &amp; open Gmail</button>
          <button type="button" class="btn ghost" id="pe-plain">Plain text instead</button>
          <button type="button" class="btn ghost" id="pe-cancel">Cancel</button>
        </div>
        <p class="muted small pe-tip">Gmail opens with the address and subject filled in. Click in the message area, press <b>Ctrl+V</b> to paste the email, then <b>Send</b>.</p>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.querySelector("#pe-cancel").onclick = close;
    wrap.querySelector("#pe-plain").onclick = () => {
      window.open(gmailUrl(to, subject, text), "_blank", "noopener");
      onSent && onSent(); close();
    };
    wrap.querySelector("#pe-go").onclick = () => {
      let copied;
      try {
        copied = navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } catch (e) { copied = Promise.reject(e); }
      const win = window.open(gmailUrl(to, subject, ""), "_blank", "noopener");
      copied.then(() => { onSent && onSent(); close(); })
        .catch(() => { if (win) win.close?.(); window.open(gmailUrl(to, subject, text), "_blank", "noopener"); onSent && onSent(); close(); });
    };
  };
})();
