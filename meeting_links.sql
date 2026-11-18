-- Meeting links (2026-11-18). Run once in Supabase (AWD CRM project) → SQL Editor → New query → Run. Safe to re-run.
-- Adds one column for a meeting's video link (Teams or Google Meet). The lead page and the Calendar show it as
-- Join meeting / Copy link. Doesn't change any existing lead or meeting data.
alter table public.meetings add column if not exists meeting_url text;
notify pgrst, 'reload schema';

-- Check: should show meeting_url
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'meetings' and column_name = 'meeting_url';
