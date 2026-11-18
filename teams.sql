-- Microsoft Teams links for CRM meetings (2026-11-18). Run once in Supabase (AWD CRM project) → SQL Editor → New query → Run.
-- Safe to run more than once. Doesn't change any existing lead or meeting data.

-- 1) The connected Microsoft 365 account (AWD's own business account). One row only.
--    The refresh token is stored encrypted (AES-256-GCM, key derived from MS_CLIENT_SECRET in Vercel).
--    Row-level security is ON with NO policies, and anon/authenticated have no grants: the browser can never read it,
--    signed in or not. Only the server functions in api/ms/ can, using the Supabase secret key (SUPABASE_SECRET_KEY in Vercel).
create table if not exists public.ms_connection (
  id int primary key default 1 check (id = 1),
  account_email text,
  account_name text,
  refresh_token_enc text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ms_connection enable row level security;
revoke all on public.ms_connection from anon, authenticated;

-- 2) The Teams link and Outlook event for each meeting.
alter table public.meetings add column if not exists teams_join_url text;   -- Join link from Microsoft
alter table public.meetings add column if not exists ms_event_id text;      -- Outlook calendar event id (to move or cancel it)
alter table public.meetings add column if not exists teams_error text;      -- why the link couldn't be made (null = fine)

notify pgrst, 'reload schema';

-- Check: should show ms_connection | 0, then the three new meetings columns
select 'ms_connection' as table_name, count(*) from public.ms_connection;
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'meetings' and column_name in ('teams_join_url', 'ms_event_id', 'teams_error');
