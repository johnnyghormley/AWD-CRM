-- AWD CRM: email Johnny (johnny.ghormley@gmail.com) every time the website's "Get your free design" form
-- saves a new inquiry. Added 2026-10-09. Needs inquiry_source.sql run first (the `source` column).
--
-- How it works: a trigger on public.inquiries calls the Resend email API through pg_net (Supabase's built-in
-- HTTP extension). It runs inside the database, so it works no matter what the visitor's browser does.
-- If sending ever fails, the inquiry is still saved; the email is just skipped.
--
-- BEFORE running this file (Johnny does these himself; the key never goes in chat or the vault):
--   1. Create a free Resend account at https://resend.com, signed up with johnny.ghormley@gmail.com
--      (the free test sender can only deliver to the account's own email address).
--   2. In Resend → API Keys → Create API key (permission: Sending access). Copy it.
--   3. In Supabase → SQL Editor → New query, run this ONE line with the key pasted in, then delete the text:
--        select vault.create_secret('PASTE_RESEND_KEY_HERE', 'resend_api_key');
-- THEN paste this whole file into a new query and Run. Safe to run more than once.

create extension if not exists pg_net with schema extensions;

create or replace function public.awd_html(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function public.notify_new_inquiry() returns trigger
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  api_key text;
  body text;
  row_html text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null then
    return new;  -- no key saved yet: skip the email, keep the inquiry
  end if;

  row_html :=
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Name</td><td style="padding:6px 0"><b>' || awd_html(new.name) || '</b></td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Business</td><td style="padding:6px 0"><b>' || awd_html(new.business) || '</b></td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Phone</td><td style="padding:6px 0"><a href="tel:' || regexp_replace(coalesce(new.phone, ''), '[^0-9+]', '', 'g') || '">' || awd_html(new.phone) || '</a></td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Type of business</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.trade), ''), '—') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Email</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.email), ''), '—') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Heard about us</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.source), ''), '—') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Current website</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.website), ''), 'none') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280;vertical-align:top">Message</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.message), ''), '—') || '</td></tr>';

  body := json_build_object(
    'from', 'AWD Website <onboarding@resend.dev>',
    'to', json_build_array('johnny.ghormley@gmail.com'),
    'subject', 'New free design request: ' || left(coalesce(new.business, ''), 80) || ' (' || left(coalesce(new.name, ''), 60) || ')',
    'html',
      '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1F2937">' ||
      '<h2 style="margin:0 0 4px">New free design request</h2>' ||
      '<p style="margin:0 0 14px;color:#6B7280">From the form on affordablewebdesigns.vercel.app. You promised a callback within 1 business day.</p>' ||
      '<table style="border-collapse:collapse">' || row_html || '</table>' ||
      '<p style="margin:18px 0 0"><a href="https://awd-crm.vercel.app/#/inquired" style="background:#FACC15;color:#1F2937;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Open in the CRM (Inquired)</a></p>' ||
      '</div>'
  )::text;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := body::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json')
  );
  return new;
exception when others then
  return new;  -- never block saving an inquiry because of the email
end;
$$;

revoke all on function public.notify_new_inquiry() from public, anon, authenticated;

drop trigger if exists inquiries_email_johnny on public.inquiries;
create trigger inquiries_email_johnny after insert on public.inquiries
  for each row execute function public.notify_new_inquiry();
