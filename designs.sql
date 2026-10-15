-- Dex Design Desk (the /designs/ app) database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Safe to run more than once.

-- Every design Dex builds, and what the client pays.
create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business text not null,
  owner text,
  status text not null default 'building',        -- building, sent, approved, paid, live, archived
  pkg text default 'new_website',                  -- new_website, website_upgrade, website_only, website_only_domain, referral, custom
  upfront numeric,                                 -- dollars charged up front
  monthly numeric,                                 -- dollars per month (0 = none)
  preview text,                                    -- private AWD preview link
  live text,                                       -- client's live site
  notes text,
  thumb text                                       -- screenshot path in the "designs" storage bucket
);

-- Designs queued for Dex to build ("Dex, check the queue").
create table if not exists public.design_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  business text not null,
  contact text,
  phone text,
  email text,
  industry text,
  links text,
  style text,
  photos text[] not null default '{}',             -- photo paths in the "designs" storage bucket
  status text not null default 'queued'            -- queued, in_progress, done
);

drop trigger if exists designs_touch on public.designs;
create trigger designs_touch before update on public.designs for each row execute function public.touch_updated_at();

-- Security: same as the CRM. Only signed-in users can read or change anything.
alter table public.designs enable row level security;
alter table public.design_requests enable row level security;
drop policy if exists "signed in only" on public.designs;
drop policy if exists "signed in only" on public.design_requests;
create policy "signed in only" on public.designs for all to authenticated using (true) with check (true);
create policy "signed in only" on public.design_requests for all to authenticated using (true) with check (true);

-- Private file storage for screenshots and request photos (max 10 MB, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('designs', 'designs', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "designs bucket signed in" on storage.objects;
create policy "designs bucket signed in" on storage.objects for all to authenticated
  using (bucket_id = 'designs') with check (bucket_id = 'designs');
