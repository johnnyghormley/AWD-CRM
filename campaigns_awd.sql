-- Campaigns-Me: AWD drip campaigns to CRM leads (next to Campaigns-Dad, I Know Warehouses' HubSpot campaigns).
-- Run once in Supabase → SQL Editor, after campaigns.sql. Safe to re-run.

-- Which business a campaign belongs to: 'ikw' (Campaigns-Dad, HubSpot contacts) or 'awd' (Campaigns-Me, CRM leads).
alter table public.campaigns add column if not exists brand text not null default 'ikw';
-- Drip emails after the first one: [{ "subject": "...", "body": "...", "delay_days": 3 }, ...]
-- Each one goes out delay_days after the previous email to that person, unless they replied, unsubscribed,
-- bounced, or their lead was marked Won / Not Interested / Do Not Call / Disqualified.
alter table public.campaigns add column if not exists steps jsonb not null default '[]';

-- Which email of the drip a send row is (1 = the first email), and the CRM lead it went to (AWD campaigns).
alter table public.campaign_sends add column if not exists step int not null default 1;
alter table public.campaign_sends add column if not exists lead_id uuid references public.leads(id) on delete set null;

-- One row per recipient per drip email (was one row per recipient).
alter table public.campaign_sends drop constraint if exists campaign_sends_campaign_id_email_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_sends_campaign_email_step_key') then
    alter table public.campaign_sends add constraint campaign_sends_campaign_email_step_key unique (campaign_id, email, step);
  end if;
end $$;
create index if not exists campaigns_brand on public.campaigns (brand);
