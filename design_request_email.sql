-- AWD CRM: email Johnny (johnny.ghormley@gmail.com) every time a free design is queued for Dex
-- (a new row in public.design_requests, from anyone: Johnny, an employee like Alex, or a script). Added 2026-11-10.
-- Same setup as inquiry_email.sql: a trigger calls the Resend API through pg_net, using the Resend key
-- already saved in Supabase Vault as 'resend_api_key'. If sending fails, the request is still saved.
-- Paste this whole file into Supabase -> SQL Editor -> Run. Safe to run more than once.
-- Needs inquiry_email.sql run first (pg_net and the awd_html() helper).

create or replace function public.notify_design_request() returns trigger
language plpgsql security definer set search_path = public, extensions, vault, auth as $$
declare
  api_key text;
  who text;
  lead_url text;
  row_html text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null then
    return new;
  end if;

  -- Who queued it: the signed-in CRM user, or a script/agent (secret key, no user).
  select coalesce(cu.email, u.email) into who
    from auth.users u left join public.crm_users cu on cu.user_id = u.id
    where u.id = auth.uid();
  lead_url := substring(coalesce(new.style, '') from '(https://awd-crm\.vercel\.app/#/lead/[0-9a-fA-F-]+)');

  row_html :=
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Business</td><td style="padding:6px 0"><b>' || awd_html(new.business) || '</b></td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Queued by</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(who), ''), 'an agent or script') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Contact</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.contact), ''), '—') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Phone</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.phone), ''), '—') || '</td></tr>' ||
    '<tr><td style="padding:6px 12px 6px 0;color:#6B7280">Industry</td><td style="padding:6px 0">' || coalesce(nullif(awd_html(new.industry), ''), '—') || '</td></tr>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := json_build_object(
      'from', 'AWD CRM <onboarding@resend.dev>',
      'to', json_build_array('johnny.ghormley@gmail.com'),
      'subject', 'Design queued for Dex: ' || left(coalesce(new.business, ''), 80) || coalesce(' (by ' || left(who, 60) || ')', ''),
      'html',
        '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1F2937">' ||
        '<h2 style="margin:0 0 4px">New free design queued for Dex</h2>' ||
        '<p style="margin:0 0 14px;color:#6B7280">To start it, tell Claude “Dex, check the queue”.</p>' ||
        '<table style="border-collapse:collapse">' || row_html || '</table>' ||
        '<p style="margin:18px 0 0"><a href="https://awd-crm.vercel.app/#/designs" style="background:#FACC15;color:#1F2937;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Open Designs in the CRM</a>' ||
        coalesce('&nbsp; <a href="' || lead_url || '" style="color:#1F2937">Open the lead</a>', '') || '</p>' ||
        '</div>'
    )::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json')
  );
  return new;
exception when others then
  return new;  -- never block queuing a design because of the email
end;
$$;

revoke all on function public.notify_design_request() from public, anon, authenticated;

drop trigger if exists design_requests_email_johnny on public.design_requests;
create trigger design_requests_email_johnny after insert on public.design_requests
  for each row execute function public.notify_design_request();
