-- CRM roles: admin vs employee (2026-11-08). Run once in Supabase → SQL Editor, after the other .sql files. Safe to re-run.
--
-- admin    = Johnathon. Sees everything.
-- employee = everyone else who can sign in. Sees and works the leads (Tasks, Calendar, Deals, Pipeline, Disqualified,
--            Called, Only email, Missing info, Ready, All leads, Search, Today, Inquired, Script, Add lead, Import)
--            but NOT Campaigns-Me, Campaigns-Dad or Designs. The database blocks those tables for employees too,
--            so hiding the buttons isn't the only protection.
-- Anyone without a row here counts as an employee (never as an admin).
-- The scheduled agents (Ivy, Rob, Dex scripts) use the secret key, which skips these rules, so they keep working.

create table if not exists public.crm_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

-- true when the signed-in person is an admin. security definer so it can read crm_users under its own rules.
create or replace function public.is_crm_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_users where user_id = auth.uid() and role = 'admin')
$$;
revoke all on function public.is_crm_admin() from public;
grant execute on function public.is_crm_admin() to authenticated;

alter table public.crm_users enable row level security;
drop policy if exists "see own role, admins see all" on public.crm_users;
drop policy if exists "admins change roles" on public.crm_users;
create policy "see own role, admins see all" on public.crm_users for select to authenticated
  using (user_id = auth.uid() or public.is_crm_admin());
create policy "admins change roles" on public.crm_users for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());

-- Every new login (invited from Supabase or with sync/crm_invite.py) gets an employee row automatically.
create or replace function public.crm_users_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.crm_users (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists crm_users_on_signup on auth.users;
create trigger crm_users_on_signup after insert on auth.users for each row execute function public.crm_users_on_signup();

-- Existing logins: Johnathon is the admin; anyone else already there becomes an employee.
insert into public.crm_users (user_id, email, role)
  select id, email, case when lower(email) = 'johnny.ghormley@gmail.com' then 'admin' else 'employee' end from auth.users
  on conflict (user_id) do nothing;
update public.crm_users set role = 'admin' where lower(email) = 'johnny.ghormley@gmail.com';

-- Admin-only tables: Campaigns-Me / Campaigns-Dad (campaigns.sql) and Designs (designs.sql).
do $$
declare t text;
begin
  foreach t in array array['campaigns', 'campaign_sends', 'email_templates', 'email_unsubscribes', 'designs', 'design_requests'] loop
    execute format('drop policy if exists "signed in only" on public.%I', t);
    execute format('drop policy if exists "admins only" on public.%I', t);
    execute format('create policy "admins only" on public.%I for all to authenticated using (public.is_crm_admin()) with check (public.is_crm_admin())', t);
  end loop;
end $$;

-- Design screenshots and request photos (the private "designs" storage bucket): admins only.
drop policy if exists "designs bucket signed in" on storage.objects;
drop policy if exists "designs bucket admins" on storage.objects;
create policy "designs bucket admins" on storage.objects for all to authenticated
  using (bucket_id = 'designs' and public.is_crm_admin()) with check (bucket_id = 'designs' and public.is_crm_admin());

-- Unchanged: leads, activities, meetings, deals, inquiries stay open to every signed-in person (admin and employee).
