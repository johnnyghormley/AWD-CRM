-- Booked meetings with leads (added 2026-10-23), shown on the lead page and the Calendar tab.
-- Paste into Supabase (AWD CRM project) → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 30,
  kind text not null default 'Phone call',        -- Phone call, Video call, In person
  location text,                                  -- address, video link or phone number
  note text,
  status text not null default 'scheduled'        -- scheduled, done, canceled
);
create index if not exists meetings_starts_idx on public.meetings(starts_at);
create index if not exists meetings_lead_idx on public.meetings(lead_id);

-- Same rule as the rest of the CRM: only signed-in users can read or change anything.
alter table public.meetings enable row level security;
drop policy if exists "signed in only" on public.meetings;
create policy "signed in only" on public.meetings for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';

-- Check: should show meetings | 0 the first time
select 'meetings' as table_name, count(*) from public.meetings;
