-- Email campaigns to HubSpot contacts (Campaigns tab). Run once in Supabase → SQL Editor.
-- Safe to re-run.

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text,
  body text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  audience jsonb,                       -- the filters used to pick the contacts
  daily_cap int not null default 40,    -- most emails sent per day (all campaigns together)
  spacing_min int not null default 8,   -- minutes between emails in a day's batch
  status text not null default 'draft', -- draft, sending, done
  created_at timestamptz not null default now()
);

-- One row per recipient. status: queued, scheduled, sent, bounced, failed, skipped
create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id text,                      -- HubSpot contact id
  email text not null,
  firstname text, lastname text, company text, city text, jobtitle text,
  status text not null default 'queued',
  resend_id text unique,
  unsub_token uuid not null default gen_random_uuid() unique,
  sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz, bounced_at timestamptz,
  replied_at timestamptz, unsubscribed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists campaign_sends_campaign on public.campaign_sends (campaign_id, status);
create index if not exists campaign_sends_sent_at on public.campaign_sends (sent_at);

-- Never email these again (unsubscribes, hard bounces, spam complaints). Emails stored lowercase.
create table if not exists public.email_unsubscribes (
  email text primary key,
  source text,                          -- unsubscribe link, bounce, complaint, manual
  created_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_sends enable row level security;
alter table public.email_unsubscribes enable row level security;
drop policy if exists "signed in only" on public.email_templates;
drop policy if exists "signed in only" on public.campaigns;
drop policy if exists "signed in only" on public.campaign_sends;
drop policy if exists "signed in only" on public.email_unsubscribes;
create policy "signed in only" on public.email_templates for all to authenticated using (true) with check (true);
create policy "signed in only" on public.campaigns for all to authenticated using (true) with check (true);
create policy "signed in only" on public.campaign_sends for all to authenticated using (true) with check (true);
create policy "signed in only" on public.email_unsubscribes for all to authenticated using (true) with check (true);

-- The unsubscribe link (no login): records the unsubscribe for the recipient holding this token only.
create or replace function public.campaign_unsubscribe(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s public.campaign_sends;
begin
  select * into s from public.campaign_sends where unsub_token = p_token;
  if not found then return null; end if;
  insert into public.email_unsubscribes (email, source) values (lower(s.email), 'unsubscribe link') on conflict (email) do nothing;
  update public.campaign_sends set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = s.id;
  return json_build_object('email', s.email, 'contact_id', s.contact_id, 'first', s.unsubscribed_at is null);
end $$;

-- Email tracking from Resend's webhook (no login): updates only the send with this Resend id.
create or replace function public.campaign_track(p_resend_id text, p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.campaign_sends;
begin
  select * into s from public.campaign_sends where resend_id = p_resend_id;
  if not found then return; end if;
  if p_event = 'email.delivered' then update public.campaign_sends set status = 'sent' where id = s.id and status = 'scheduled';
  elsif p_event = 'email.opened' then update public.campaign_sends set opened_at = coalesce(opened_at, now()) where id = s.id;
  elsif p_event = 'email.clicked' then update public.campaign_sends set clicked_at = coalesce(clicked_at, now()), opened_at = coalesce(opened_at, now()) where id = s.id;
  elsif p_event = 'email.bounced' then
    update public.campaign_sends set status = 'bounced', bounced_at = coalesce(bounced_at, now()) where id = s.id;
    insert into public.email_unsubscribes (email, source) values (lower(s.email), 'bounce') on conflict (email) do nothing;
  elsif p_event = 'email.complained' then
    update public.campaign_sends set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = s.id;
    insert into public.email_unsubscribes (email, source) values (lower(s.email), 'spam complaint') on conflict (email) do nothing;
  elsif p_event = 'email.failed' then update public.campaign_sends set status = 'failed', error = 'Resend: failed' where id = s.id;
  end if;
end $$;

revoke all on function public.campaign_unsubscribe(uuid) from public;
revoke all on function public.campaign_track(text, text) from public;
grant execute on function public.campaign_unsubscribe(uuid) to anon, authenticated;
grant execute on function public.campaign_track(text, text) to anon, authenticated;
