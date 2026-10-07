-- AWD CRM: website inquiries (the "Get your free design" form on affordablewebdesigns.vercel.app).
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  business text not null,
  phone text not null,
  email text,
  trade text,
  website text,
  message text,
  status text not null default 'New',            -- New / Added to leads / Dismissed
  lead_id uuid references public.leads(id) on delete set null
);

create index if not exists inquiries_created_idx on public.inquiries(created_at desc);

alter table public.inquiries enable row level security;
drop policy if exists "signed in only" on public.inquiries;
drop policy if exists "website can submit" on public.inquiries;

-- Johnathon (signed in) can read and manage everything.
create policy "signed in only" on public.inquiries for all to authenticated using (true) with check (true);

-- The public website can only ADD a new inquiry. It can't read, change or delete anything,
-- can't set the status or link a lead, and field lengths are capped to stop junk.
create policy "website can submit" on public.inquiries for insert to anon with check (
  status = 'New' and lead_id is null
  and length(name) between 1 and 120 and length(business) between 1 and 160 and length(phone) between 7 and 40
  and coalesce(length(email), 0) <= 200 and coalesce(length(trade), 0) <= 60
  and coalesce(length(website), 0) <= 300 and coalesce(length(message), 0) <= 2000
);

grant insert on public.inquiries to anon;
revoke select, update, delete on public.inquiries from anon;
grant all on public.inquiries to authenticated;
