-- AWD CRM: "How did you hear about us?" on the website form (added 2026-10-09).
-- Adds a `source` column to inquiries and lets the website fill it in (capped at 60 characters).
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run more than once.

alter table public.inquiries add column if not exists source text;

drop policy if exists "website can submit" on public.inquiries;
create policy "website can submit" on public.inquiries for insert to anon with check (
  status = 'New' and lead_id is null
  and length(name) between 1 and 120 and length(business) between 1 and 160 and length(phone) between 7 and 40
  and coalesce(length(email), 0) <= 200 and coalesce(length(trade), 0) <= 60
  and coalesce(length(website), 0) <= 300 and coalesce(length(message), 0) <= 2000
  and coalesce(length(source), 0) <= 60
);
