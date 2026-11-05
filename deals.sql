-- Deals (added 2026-11-05): current ongoing deals, shown on the Sales → Deals tab and started from a lead page.
-- Paste into Supabase (AWD CRM project) → SQL Editor → New query → Run. Safe to run more than once.
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage text not null default 'Meeting set',      -- Meeting set, Design shown, Payment link sent, Won, Lost
  package text,                                   -- e.g. New Website, Website Upgrade
  upfront numeric not null default 199,           -- one-time amount ($)
  monthly numeric not null default 29,            -- monthly amount ($)
  next_step text,
  close_date date,                                -- expected close
  note text,
  closed_at timestamptz                           -- set when Won or Lost
);
create index if not exists deals_lead_idx on public.deals(lead_id);
create index if not exists deals_stage_idx on public.deals(stage);

-- Same rule as the rest of the CRM: only signed-in users can read or change anything.
alter table public.deals enable row level security;
drop policy if exists "signed in only" on public.deals;
create policy "signed in only" on public.deals for all to authenticated using (true) with check (true);
notify pgrst, 'reload schema';

-- Check: should show deals | 0 the first time
select 'deals' as table_name, count(*) from public.deals;
