-- AWD CRM (2026-11-10): employees (e.g. Alex) can queue Dex for a free design from a lead page
-- and see whether a design is already queued for that business.
-- They still can't see the built designs, the designs screenshots bucket or the Designs tab
-- (the "admins only" policy from roles.sql stays on design_requests; these policies are added on top).
-- Employees can't edit or delete requests. Run once in Supabase -> SQL Editor.

drop policy if exists "employees can queue dex" on public.design_requests;
create policy "employees can queue dex" on public.design_requests
  for insert to authenticated with check (true);

drop policy if exists "employees can see dex queue" on public.design_requests;
create policy "employees can see dex queue" on public.design_requests
  for select to authenticated using (true);
