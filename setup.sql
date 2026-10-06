-- AWD CRM database setup. Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run once on a new project.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_status text default 'Qualified',          -- Qualified / Missing Info (from Abby)
  list text,                                     -- A (no website) / B (has website)
  business_name text not null,
  trade text,
  city text,
  business_address text,
  business_phone text,
  owner_name text,
  owner_title text,
  owner_phone text,
  owner_phone_type text,                         -- Direct / Main line
  owner_email text,
  owner_email_status text,                       -- Verified / Inferred / Not found
  website text,
  domain_owned text,
  website_status text,                           -- None / Domain inactive / Outdated / Fair
  website_notes text,
  google_rating numeric,
  review_count integer,
  linkedin text,
  facebook text,
  rapport_note text,
  missing text,
  sources text,
  date_researched date,
  call_status text not null default 'New',       -- New, Called, Callback, Design Sent, Follow Up, Won, Not Interested, Do Not Call
  next_step text,
  follow_up_date date,
  package text                                   -- A / B (what they bought or were pitched)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null default 'Call',             -- Call, Text, Email, Design sent, Note
  outcome text,                                  -- e.g. No answer, Voicemail, Talked, Interested
  note text
);

create index if not exists activities_lead_idx on public.activities(lead_id, created_at desc);
create index if not exists leads_follow_up_idx on public.leads(follow_up_date);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

-- Security: only signed-in users can read or change anything. Nobody else (including the public website key) can.
alter table public.leads enable row level security;
alter table public.activities enable row level security;
drop policy if exists "signed in only" on public.leads;
drop policy if exists "signed in only" on public.activities;
create policy "signed in only" on public.leads for all to authenticated using (true) with check (true);
create policy "signed in only" on public.activities for all to authenticated using (true) with check (true);
