-- Texts from Johnathon's own cell through SMS Gateway for Android (sms-gate.app, Cloud server mode), 2026-11-19.
-- Run once in Supabase (AWD CRM project) → SQL Editor → New query → Run. Safe to run more than once.
-- Doesn't change any existing lead data.

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,   -- null = unknown sender (shown in the Texts tab)
  direction text not null check (direction in ('out', 'in')),
  phone text not null,                                            -- the other person's number, E.164 (+1XXXXXXXXXX)
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'failed', 'received')),
  gateway_message_id text,                                        -- the gateway's message id (outgoing: same as our id)
  error text,                                                     -- why it failed, when it did
  read_at timestamptz,                                            -- incoming texts: when someone opened the thread
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sms_messages_lead_idx on public.sms_messages(lead_id, created_at);
create index if not exists sms_messages_gateway_idx on public.sms_messages(gateway_message_id);
create index if not exists sms_messages_unread_idx on public.sms_messages(direction, read_at);

-- It's Johnathon's own phone, so texts are for CRM admins only (roles.sql). Employees can't read or send them.
-- The webhook (api/sms/webhook.js) writes with the Supabase secret key, which skips these rules.
alter table public.sms_messages enable row level security;
drop policy if exists "admins only" on public.sms_messages;
create policy "admins only" on public.sms_messages for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());
revoke all on public.sms_messages from anon;

notify pgrst, 'reload schema';

-- Check: should show sms_messages | 0 the first time
select 'sms_messages' as table_name, count(*) from public.sms_messages;
