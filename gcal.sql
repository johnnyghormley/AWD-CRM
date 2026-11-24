-- Google Calendar two-way sync (2026-11-24). Run once in Supabase (AWD CRM project) → SQL Editor → New query → Run.
-- Safe to run more than once. Doesn't change any existing lead or meeting data (it only adds columns and a trigger).
-- Needs roles.sql to have been run (uses is_crm_admin()).

-- 1) The connected Google account (Johnny's personal Gmail). One row only.
--    The refresh token is stored encrypted (AES-256-GCM, key derived from GOOGLE_CLIENT_SECRET in Vercel).
--    Row-level security ON with NO policies and no grants: the browser can never read it. Only the api/gcal/* server
--    functions can, with the Supabase secret key (SUPABASE_SECRET_KEY in Vercel).
create table if not exists public.gcal_connection (
  id int primary key default 1 check (id = 1),
  account_email text,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_pull_at timestamptz,          -- when Google was last asked for changes
  last_sync_at timestamptz,
  last_error text
);
alter table public.gcal_connection enable row level security;
revoke all on public.gcal_connection from anon, authenticated;

-- 2) Sync columns on meetings.
alter table public.meetings add column if not exists google_event_id text;                     -- the Google event
alter table public.meetings add column if not exists google_dirty boolean not null default true; -- changed in the CRM, not sent to Google yet
alter table public.meetings add column if not exists google_synced_at timestamptz;              -- last write by the sync
alter table public.meetings add column if not exists google_error text;                         -- why it couldn't be sent (null = fine)
alter table public.meetings add column if not exists meeting_url text;                          -- from meeting_links.sql, in case it wasn't run
create unique index if not exists meetings_google_event_idx on public.meetings(google_event_id);
-- Existing meetings: nothing to send yet (connecting Google marks the upcoming ones to go out).
update public.meetings set google_dirty = false where google_synced_at is null and google_event_id is null and created_at < now() - interval '1 minute';

-- Events made in Google may not belong to any lead.
alter table public.meetings alter column lead_id drop not null;

-- 3) Any change made in the CRM (not by the sync) marks the meeting to be sent to Google.
--    The sync always sets google_synced_at when it writes, which is how its own writes are told apart.
create or replace function public.meetings_google_dirty() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.google_synced_at is null then new.google_dirty := true; end if;
  elsif new.google_synced_at is not distinct from old.google_synced_at
    and (new.starts_at, new.duration_min, new.kind, new.location, new.note, new.status, new.lead_id, new.meeting_url)
        is distinct from (old.starts_at, old.duration_min, old.kind, old.location, old.note, old.status, old.lead_id, old.meeting_url) then
    new.google_dirty := true;
  end if;
  return new;
end $$;
drop trigger if exists meetings_google_dirty on public.meetings;
create trigger meetings_google_dirty before insert or update on public.meetings for each row execute function public.meetings_google_dirty();

-- 4) Google events not linked to a lead are Johnny's own: only admins see them. Everything else is as before.
drop policy if exists "signed in only" on public.meetings;
create policy "signed in only" on public.meetings for all to authenticated
  using (lead_id is not null or public.is_crm_admin()) with check (lead_id is not null or public.is_crm_admin());

notify pgrst, 'reload schema';

-- Check: should show gcal_connection | 0, then 5 column names
select 'gcal_connection' as table_name, count(*) from public.gcal_connection;
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'meetings'
  and column_name in ('google_event_id', 'google_dirty', 'google_synced_at', 'google_error', 'meeting_url');
