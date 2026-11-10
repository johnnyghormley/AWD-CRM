-- AWD CRM Analytics tab: social post stats from Buffer (2026-11-10). Run once in Supabase -> SQL Editor.
-- One row per post Buffer sent to the AWD LinkedIn page, Facebook page or Instagram account, with its stats.
-- Filled by CRM App/sync/social_sync.py (secret key). Admins only can read it.

create table if not exists public.social_posts (
  id text primary key,                 -- Buffer post id
  channel text not null,               -- linkedin | facebook | instagram
  sent_at timestamptz,
  text text,
  link text,
  metrics jsonb not null default '{}'::jsonb,   -- e.g. {"Impressions": 77, "Reactions": 1, "Clicks": 1}
  metrics_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists social_posts_sent_at on public.social_posts (sent_at desc);
alter table public.social_posts enable row level security;
drop policy if exists "admins only" on public.social_posts;
create policy "admins only" on public.social_posts for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());
grant select on public.social_posts to authenticated;
