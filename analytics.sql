-- AWD CRM Analytics tab (2026-11-10). Run once in Supabase -> SQL Editor. Safe to run more than once.
--
-- 1. site_visits: one row per page view on the AWD website (affordablewebdesigns.vercel.app), sent by a
--    small script on the site. No names, emails or IP addresses are stored: just the page, where the visitor
--    came from, a random visitor id kept in their browser, and phone vs computer.
--    Anyone may ADD a row (the website is public); only admins can READ them.
-- 2. channel_stats: one row per week per channel ("google" = Google Business Profile, "linkedin" = LinkedIn page),
--    typed in on the Analytics tab from each site's own insights page. Admins only.

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text,
  referrer text,
  source text,
  visitor_id text,
  device text,
  event text default 'view'
);
alter table public.site_visits add column if not exists event text default 'view';
create index if not exists site_visits_created_at on public.site_visits (created_at desc);

alter table public.site_visits enable row level security;
drop policy if exists "website can add visits" on public.site_visits;
create policy "website can add visits" on public.site_visits for insert to anon, authenticated
  with check (length(coalesce(path, '')) <= 300 and length(coalesce(referrer, '')) <= 300
              and length(coalesce(source, '')) <= 100 and length(coalesce(visitor_id, '')) <= 64
              and length(coalesce(device, '')) <= 20
              and coalesce(event, 'view') in ('view', 'call'));
drop policy if exists "admins read visits" on public.site_visits;
create policy "admins read visits" on public.site_visits for select to authenticated using (public.is_crm_admin());
grant insert on public.site_visits to anon, authenticated;
grant select on public.site_visits to authenticated;

create table if not exists public.channel_stats (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  week_start date not null,
  channel text not null check (channel in ('google', 'linkedin')),
  metrics jsonb not null default '{}'::jsonb,
  unique (week_start, channel)
);
alter table public.channel_stats enable row level security;
drop policy if exists "admins only" on public.channel_stats;
create policy "admins only" on public.channel_stats for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());
grant select, insert, update, delete on public.channel_stats to authenticated;
