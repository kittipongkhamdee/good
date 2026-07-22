-- =============================================
-- ตาเบาวิทยา — Good Deed Point System
-- Migration actually applied to Supabase project "PP5"
-- (zwtulepvmlngcrbcrrki) on top of the school's EXISTING
-- students / profiles tables. Additive only — does not
-- alter or drop any pre-existing table.
--
-- Run this only if setting up a NEW project from scratch.
-- On the live PP5 project this has already been applied.
-- =============================================

-- =============================================
-- 1. New tables
-- =============================================

create table if not exists public.good_deed_types (
  id serial primary key,
  icon text default '💚',
  name text unique not null,
  description text,
  points_min int default 5,
  points_max int default 20,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.rewards (
  id serial primary key,
  icon text default '🎁',
  name text not null,
  description text,
  points_required int not null check (points_required > 0),
  stock int default 0,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- References the school's EXISTING public.students and public.profiles tables
create table if not exists public.point_logs (
  id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid references public.profiles(id) on delete set null,
  deed_type_id int references public.good_deed_types(id) on delete set null,
  points int not null check (points > 0),
  note text,
  created_at timestamptz default now()
);

create table if not exists public.reward_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references public.students(id) on delete cascade,
  reward_id int references public.rewards(id) on delete set null,
  points_used int not null,
  status text default 'approved' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now()
);

create index if not exists idx_point_logs_student on public.point_logs(student_id);
create index if not exists idx_point_logs_teacher on public.point_logs(teacher_id);
create index if not exists idx_point_logs_created on public.point_logs(created_at desc);
create index if not exists idx_reward_requests_student on public.reward_requests(student_id);

-- =============================================
-- 2. Aggregated points + badge per student (read-only, computed)
-- =============================================

create or replace view public.student_points as
select
  s.id as student_id,
  s.student_code,
  s.student_name,
  s.prefix,
  s.grade_level,
  s.room,
  coalesce(sum(pl.points),0)::int as total_points,
  case
    when coalesce(sum(pl.points),0) >= 5000 then 'คนดีต้นแบบ'
    when coalesce(sum(pl.points),0) >= 1000 then 'คนดีระดับสูง'
    when coalesce(sum(pl.points),0) >= 500 then 'คนดีระดับกลาง'
    when coalesce(sum(pl.points),0) >= 100 then 'คนดีระดับต้น'
    else 'ผู้เริ่มต้น'
  end as badge_level
from public.students s
left join public.point_logs pl on pl.student_id = s.id
group by s.id, s.student_code, s.student_name, s.prefix, s.grade_level, s.room;

-- Runs with the querying user's own RLS instead of the view owner's (Postgres 15+).
-- Safe here since all anon-facing reads go through the SECURITY DEFINER RPCs below,
-- and staff reads already have a permissive "authenticated" policy on students.
alter view public.student_points set (security_invoker = true);

-- =============================================
-- 3. Row Level Security
-- =============================================

alter table public.good_deed_types enable row level security;
alter table public.rewards enable row level security;
alter table public.point_logs enable row level security;
alter table public.reward_requests enable row level security;

-- Write access to these 4 Good Deed tables is granted to any signed-in staff
-- member (teacher or admin) — teachers have full parity with Admin in this app,
-- by request. This intentionally does NOT reuse is_admin() for these checks,
-- so it has zero effect on any other table/policy in the school's database.
create policy "deed_types_read" on public.good_deed_types for select using (true);
create policy "deed_types_staff_write" on public.good_deed_types
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "rewards_read" on public.rewards for select using (true);
create policy "rewards_staff_write" on public.rewards
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "point_logs_read_staff" on public.point_logs for select using (auth.role() = 'authenticated');
create policy "point_logs_insert_teacher" on public.point_logs for insert
  with check (auth.role() = 'authenticated' and (teacher_id = auth.uid() or is_admin()));
create policy "point_logs_staff_all" on public.point_logs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "reward_requests_read_staff" on public.reward_requests for select using (auth.role() = 'authenticated');
create policy "reward_requests_staff_all" on public.reward_requests
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =============================================
-- 4. RPC functions
-- =============================================

-- Student "login": lookup by student_code only, no password. Returns limited public fields.
create or replace function public.get_student_summary(p_student_code text)
returns table (
  student_id uuid,
  student_code text,
  student_name text,
  prefix text,
  grade_level text,
  room text,
  total_points int,
  badge_level text,
  rank bigint,
  redeem_count bigint,
  total_deeds bigint
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      sp.*,
      row_number() over (order by sp.total_points desc, sp.student_name) as rnk
    from public.student_points sp
  )
  select
    r.student_id, r.student_code, r.student_name, r.prefix, r.grade_level, r.room,
    r.total_points, r.badge_level, r.rnk,
    (select count(*) from public.reward_requests rr where rr.student_id = r.student_id) as redeem_count,
    (select count(*) from public.point_logs pl where pl.student_id = r.student_id) as total_deeds
  from ranked r
  where r.student_code = p_student_code;
$$;
grant execute on function public.get_student_summary(text) to anon, authenticated;

-- Student's own point history
create or replace function public.get_student_history(p_student_code text, p_limit int default 20)
returns table (
  id uuid,
  deed_name text,
  deed_icon text,
  teacher_name text,
  points int,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select pl.id, gdt.name, gdt.icon, pr.full_name, pl.points, pl.created_at
  from public.point_logs pl
  join public.students s on s.id = pl.student_id
  left join public.good_deed_types gdt on gdt.id = pl.deed_type_id
  left join public.profiles pr on pr.id = pl.teacher_id
  where s.student_code = p_student_code
  order by pl.created_at desc
  limit p_limit;
$$;
grant execute on function public.get_student_history(text,int) to anon, authenticated;

-- Leaderboard: top N students school-wide (safe public fields only)
create or replace function public.get_leaderboard(p_limit int default 10)
returns table (
  rank bigint,
  student_name text,
  prefix text,
  grade_level text,
  room text,
  total_points int
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (order by total_points desc, student_name) as rank,
    student_name, prefix, grade_level, room, total_points
  from public.student_points
  order by total_points desc, student_name
  limit p_limit;
$$;
grant execute on function public.get_leaderboard(int) to anon, authenticated;

-- Student's own redemption history
create or replace function public.get_student_redemptions(p_student_code text)
returns table (
  id uuid,
  reward_name text,
  reward_icon text,
  points_used int,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select rr.id, rw.name, rw.icon, rr.points_used, rr.status, rr.created_at
  from public.reward_requests rr
  join public.students s on s.id = rr.student_id
  left join public.rewards rw on rw.id = rr.reward_id
  where s.student_code = p_student_code
  order by rr.created_at desc;
$$;
grant execute on function public.get_student_redemptions(text) to anon, authenticated;

-- Teacher awards points. Requires a real authenticated session (auth.uid()); teacher_id is
-- never client-supplied, and only the `authenticated` role may call this (not anon).
create or replace function public.add_point_log(p_student_code text, p_deed_type_id int, p_points int, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  select id into v_student_id from public.students where student_code = p_student_code;
  if v_student_id is null then
    raise exception 'ไม่พบนักเรียนรหัส %', p_student_code;
  end if;

  insert into public.point_logs(student_id, teacher_id, deed_type_id, points, note)
  values (v_student_id, auth.uid(), p_deed_type_id, p_points, p_note);
end;
$$;
revoke execute on function public.add_point_log(text,int,int,text) from public;
revoke execute on function public.add_point_log(text,int,int,text) from anon;
grant execute on function public.add_point_log(text,int,int,text) to authenticated;

-- Student redeems a reward by student_code (no password flow)
create or replace function public.redeem_reward(p_student_code text, p_reward_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_total_points int;
  v_reward_points int;
  v_stock int;
begin
  select id into v_student_id from public.students where student_code = p_student_code;
  if v_student_id is null then
    raise exception 'ไม่พบนักเรียน';
  end if;

  select total_points into v_total_points from public.student_points where student_id = v_student_id;

  select points_required, stock into v_reward_points, v_stock
  from public.rewards where id = p_reward_id and active = true;
  if v_reward_points is null then
    raise exception 'ไม่พบรางวัลหรือปิดใช้งานแล้ว';
  end if;
  if v_stock <= 0 then
    raise exception 'สินค้าหมด';
  end if;
  if v_total_points < v_reward_points then
    raise exception 'คะแนนไม่เพียงพอ';
  end if;

  update public.rewards set stock = stock - 1 where id = p_reward_id;
  insert into public.reward_requests(student_id, reward_id, points_used, status)
  values (v_student_id, p_reward_id, v_reward_points, 'approved');
end;
$$;
grant execute on function public.redeem_reward(text,int) to anon, authenticated;

-- =============================================
-- 5. Seed default deed types + rewards (safe, additive)
-- =============================================

insert into public.good_deed_types (icon, name, description, points_min, points_max) values
  ('🧹', 'เก็บขยะ', 'เก็บขยะในบริเวณโรงเรียน', 5, 15),
  ('👩‍🏫', 'ช่วยครู', 'ช่วยครูจัดการงานต่างๆ', 10, 20),
  ('🤝', 'ช่วยเพื่อน', 'ช่วยเพื่อนด้านการเรียนหรืองาน', 10, 20),
  ('🌿', 'จิตอาสา', 'กิจกรรมจิตอาสาต่างๆ', 15, 30),
  ('🎪', 'ร่วมกิจกรรม', 'เข้าร่วมกิจกรรมของโรงเรียน', 20, 50),
  ('💝', 'บริจาคสิ่งของ', 'บริจาคสิ่งของให้โรงเรียนหรือสังคม', 25, 50)
on conflict (name) do nothing;

insert into public.rewards (icon, name, description, points_required, stock) values
  ('📚', 'สมุดบันทึก', 'สมุดบันทึกคุณภาพดี', 100, 12),
  ('🎒', 'กระเป๋านักเรียน', 'กระเป๋านักเรียนโรงเรียน', 500, 3),
  ('🖊️', 'ชุดเครื่องเขียน', 'ชุดอุปกรณ์เครื่องเขียนครบชุด', 200, 8),
  ('🏅', 'เหรียญรางวัล', 'เหรียญรางวัลความดี', 300, 5),
  ('🎫', 'บัตรยกเว้นการบ้าน', 'ยกเว้นการบ้านได้ 1 ครั้ง', 150, 2),
  ('🍜', 'คูปองอาหาร', 'คูปองอาหารในโรงเรียน', 80, 20)
on conflict do nothing;

-- =============================================
-- 6. Closed a pre-existing gap: RLS was disabled on 3 unrelated tables
-- =============================================
-- public.uniform_violations, public.uniform_checks, public.uniform_check_violations
-- (the school's dress-code check system, unrelated to Good Deed) had RLS disabled
-- entirely. Enabled RLS with an "allow_all" policy identical to the one already used
-- on public.activities / public.activity_attend, so behavior for the existing
-- uniform-check system is unchanged — this only closes the "RLS disabled" gap.

alter table public.uniform_violations enable row level security;
alter table public.uniform_checks enable row level security;
alter table public.uniform_check_violations enable row level security;

create policy "allow_all" on public.uniform_violations for all using (true) with check (true);
create policy "allow_all" on public.uniform_checks for all using (true) with check (true);
create policy "allow_all" on public.uniform_check_violations for all using (true) with check (true);

-- =============================================
-- 7. Badge tiers — Admin-manageable (replaces the earlier hardcoded 5-tier system)
-- =============================================
create table if not exists public.badge_tiers (
  id serial primary key,
  icon text default '🌿',
  name text not null,
  min_points int not null default 0 check (min_points >= 0),
  color text default '#6b7280',
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.badge_tiers enable row level security;
create policy "badge_tiers_read" on public.badge_tiers for select using (true);
create policy "badge_tiers_staff_write" on public.badge_tiers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into public.badge_tiers (icon, name, min_points, color) values
  ('🌰', 'ผู้เริ่มต้น',    0,    '#6b7280'),
  ('🌱', 'คนดีระดับต้น',   100,  'oklch(0.52 0.17 145)'),
  ('🌿', 'คนดีระดับกลาง', 500,  '#3b82f6'),
  ('🪴', 'คนดีระดับสูง',  1000, '#8b5cf6'),
  ('🌳', 'คนดีต้นแบบ',    5000, '#f59e0b')
on conflict do nothing;

-- 2026-07: icons updated to a seed→tree growth progression (🌰🌱🌿🪴🌳) so a
-- student's Badge visually grows bigger the more points they accumulate.
-- Applied directly to the live PP5 project via Supabase MCP (data-only
-- change, no code/deploy needed) — reflected here so a fresh install matches.

-- =============================================
-- 8. App settings — key/value config (Leaderboard visibility, Top N)
-- =============================================
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;
create policy "app_settings_read" on public.app_settings for select using (true);
create policy "app_settings_staff_write" on public.app_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into public.app_settings (key, value) values
  ('leaderboard_enabled', 'true'),
  ('leaderboard_top_n', '10')
on conflict (key) do nothing;

-- =============================================
-- 9. student_points.badge_level now computed dynamically from badge_tiers
-- (was a hardcoded CASE WHEN — see git history for the previous version)
-- =============================================
create or replace view public.student_points as
with totals as (
  select
    s.id as student_id,
    s.student_code,
    s.student_name,
    s.prefix,
    s.grade_level,
    s.room,
    coalesce(sum(pl.points),0)::int as total_points
  from public.students s
  left join public.point_logs pl on pl.student_id = s.id
  group by s.id, s.student_code, s.student_name, s.prefix, s.grade_level, s.room
)
select
  t.*,
  bt.name as badge_level,
  bt.icon as badge_icon,
  bt.color as badge_color
from totals t
left join lateral (
  select name, icon, color
  from public.badge_tiers
  where active = true and min_points <= t.total_points
  order by min_points desc
  limit 1
) bt on true;

alter view public.student_points set (security_invoker = true);

-- =============================================
-- 10. Leaderboard: ห้อง/ชั้น scope filters + Top N pulled from app_settings
-- =============================================
drop function if exists public.get_leaderboard(int);

create function public.get_leaderboard(p_limit int default null, p_grade_level text default null, p_room text default null)
returns table (
  rank bigint,
  student_name text,
  prefix text,
  grade_level text,
  room text,
  total_points int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
begin
  if p_limit is not null then
    v_limit := p_limit;
  else
    select coalesce((select value::int from public.app_settings where key = 'leaderboard_top_n'), 10) into v_limit;
  end if;

  return query
    select
      row_number() over (order by sp.total_points desc, sp.student_name) as rank,
      sp.student_name, sp.prefix, sp.grade_level, sp.room, sp.total_points
    from public.student_points sp
    where (p_grade_level is null or sp.grade_level = p_grade_level)
      and (p_room is null or sp.room = p_room)
    order by sp.total_points desc, sp.student_name
    limit v_limit;
end;
$$;
grant execute on function public.get_leaderboard(int,text,text) to anon, authenticated;

-- =============================================
-- 11. Teacher menu permissions — Admin controls which of the 3 management
-- screens (ความดี/รางวัล/รายงาน) teachers can see/manage. Blanket setting,
-- applies to all teachers. Admin-only write — teachers must NOT be able to
-- self-grant these (unlike other Good Deed tables where any staff can write).
-- "นักเรียน" is deliberately NOT configurable here: its underlying read
-- access comes from the school's shared students-table policy, used by
-- other systems (grades, attendance, uniform checks) — restricting it would
-- risk breaking those, so it stays always-on for every teacher.
-- =============================================
create table if not exists public.role_permissions (
  screen_key text primary key,
  teacher_enabled boolean not null default true,
  updated_at timestamptz default now()
);

alter table public.role_permissions enable row level security;
create policy "role_permissions_read" on public.role_permissions for select using (true);
create policy "role_permissions_admin_write" on public.role_permissions
  for all using (is_admin()) with check (is_admin());

insert into public.role_permissions (screen_key, teacher_enabled) values
  ('admin-deedtypes', true),
  ('admin-rewards', true),
  ('admin-reports', true)
on conflict (screen_key) do nothing;

create or replace function public.teacher_screen_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select teacher_enabled from public.role_permissions where screen_key = p_key), true);
$$;
revoke execute on function public.teacher_screen_enabled(text) from public;
revoke execute on function public.teacher_screen_enabled(text) from anon;
grant execute on function public.teacher_screen_enabled(text) to authenticated;

-- =============================================
-- 12. Student profile pictures — stored in Supabase Storage
-- (bucket "student-photos", public read, staff-only write). Students log in
-- by student_code only (no Supabase Auth session), so they can't upload
-- their own photo — a teacher/admin manages it from "จัดการนักเรียน".
-- =============================================
alter table public.students add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "student_photos_read" on storage.objects for select
  using (bucket_id = 'student-photos');

create policy "student_photos_staff_insert" on storage.objects for insert
  with check (bucket_id = 'student-photos' and auth.role() = 'authenticated');

create policy "student_photos_staff_update" on storage.objects for update
  using (bucket_id = 'student-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'student-photos' and auth.role() = 'authenticated');

create policy "student_photos_staff_delete" on storage.objects for delete
  using (bucket_id = 'student-photos' and auth.role() = 'authenticated');

-- student_points view now also exposes photo_url (appended at the end —
-- Postgres won't let CREATE OR REPLACE VIEW reorder/insert existing columns)
create or replace view public.student_points as
with totals as (
  select
    s.id as student_id,
    s.student_code,
    s.student_name,
    s.prefix,
    s.grade_level,
    s.room,
    s.photo_url,
    coalesce(sum(pl.points),0)::int as total_points
  from public.students s
  left join public.point_logs pl on pl.student_id = s.id
  group by s.id, s.student_code, s.student_name, s.prefix, s.grade_level, s.room, s.photo_url
)
select
  t.student_id, t.student_code, t.student_name, t.prefix, t.grade_level, t.room, t.total_points,
  bt.name as badge_level,
  bt.icon as badge_icon,
  bt.color as badge_color,
  t.photo_url
from totals t
left join lateral (
  select name, icon, color
  from public.badge_tiers
  where active = true and min_points <= t.total_points
  order by min_points desc
  limit 1
) bt on true;

alter view public.student_points set (security_invoker = true);

-- get_student_summary now also returns photo_url
drop function if exists public.get_student_summary(text);

create function public.get_student_summary(p_student_code text)
returns table (
  student_id uuid,
  student_code text,
  student_name text,
  prefix text,
  grade_level text,
  room text,
  total_points int,
  badge_level text,
  rank bigint,
  redeem_count bigint,
  total_deeds bigint,
  photo_url text
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      sp.*,
      row_number() over (order by sp.total_points desc, sp.student_name) as rnk
    from public.student_points sp
  )
  select
    r.student_id, r.student_code, r.student_name, r.prefix, r.grade_level, r.room,
    r.total_points, r.badge_level, r.rnk,
    (select count(*) from public.reward_requests rr where rr.student_id = r.student_id) as redeem_count,
    (select count(*) from public.point_logs pl where pl.student_id = r.student_id) as total_deeds,
    r.photo_url
  from ranked r
  where r.student_code = p_student_code;
$$;
grant execute on function public.get_student_summary(text) to anon, authenticated;

-- ความดี / รางวัล: gate write access directly (these tables are Good
-- Deed-only, no other school system touches them, so safe to restrict).
drop policy if exists "deed_types_staff_write" on public.good_deed_types;
create policy "deed_types_staff_write" on public.good_deed_types
  for all using (is_admin() or (auth.role() = 'authenticated' and public.teacher_screen_enabled('admin-deedtypes')))
  with check (is_admin() or (auth.role() = 'authenticated' and public.teacher_screen_enabled('admin-deedtypes')));

drop policy if exists "rewards_staff_write" on public.rewards;
create policy "rewards_staff_write" on public.rewards
  for all using (is_admin() or (auth.role() = 'authenticated' and public.teacher_screen_enabled('admin-rewards')))
  with check (is_admin() or (auth.role() = 'authenticated' and public.teacher_screen_enabled('admin-rewards')));

-- รายงาน: point_logs' SELECT policy is shared with the teacher's own
-- always-on "ประวัติ" screen, so it can't be gated directly without breaking
-- that. Instead, reports get a dedicated SECURITY DEFINER RPC that checks
-- the permission itself before returning any aggregate data.
create or replace function public.get_report_summary()
returns table (
  student_count bigint,
  teacher_count bigint,
  total_points bigint,
  log_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  if not (is_admin() or public.teacher_screen_enabled('admin-reports')) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงรายงาน';
  end if;

  return query
    select
      (select count(*) from public.students) as student_count,
      (select count(*) from public.profiles) as teacher_count,
      (select coalesce(sum(points),0) from public.point_logs) as total_points,
      (select count(*) from public.point_logs) as log_count;
end;
$$;
revoke execute on function public.get_report_summary() from public;
revoke execute on function public.get_report_summary() from anon;
grant execute on function public.get_report_summary() to authenticated;

-- =============================================
-- 13. Weekly auto-bonus points from the existing attendance (เข้าแถว, morning
-- session only — the evening check is only taken for a subset of students,
-- not the whole school, so it's not a fair basis) and uniform-check systems.
-- Additive only — reads those tables, doesn't touch them.
--
-- A week only counts once it's actually over (Friday of that week has
-- passed), and thresholds are adaptive to whatever the school actually
-- recorded that week (not hardcoded to 5 days), so real gaps in the source
-- data don't unfairly disqualify students. auto_bonus_log makes awarding
-- idempotent — safe to re-run (used by both the manual backfill and the
-- weekly pg_cron job below).
--
-- Admin can turn either bonus on/off from "ประเภทความดี" (จัดการ) — it's the
-- same `active` flag every other deed type uses; the RPC just checks it via
-- `system_key` before running that section, rather than a separate setting.
-- =============================================
insert into public.good_deed_types (icon, name, description, points_min, points_max) values
  ('🚩', 'เข้าแถวครบทุกครั้ง (รายสัปดาห์)', 'มาเข้าแถวเคารพธงชาติตอนเช้าครบทุกวันตลอดสัปดาห์ (คำนวณอัตโนมัติจากระบบเช็คชื่อกิจกรรม)', 15, 15),
  ('👔', 'แต่งกายเรียบร้อยทุกวัน (รายสัปดาห์)', 'ผ่านการตรวจเครื่องแบบทุกวันตลอดสัปดาห์ (คำนวณอัตโนมัติจากระบบตรวจเครื่องแบบ)', 15, 15)
on conflict (name) do nothing;

alter table public.good_deed_types add column if not exists system_key text unique;
update public.good_deed_types set system_key = 'attendance_week' where name = 'เข้าแถวครบทุกครั้ง (รายสัปดาห์)';
update public.good_deed_types set system_key = 'uniform_week' where name = 'แต่งกายเรียบร้อยทุกวัน (รายสัปดาห์)';

create table if not exists public.auto_bonus_log (
  id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references public.students(id) on delete cascade,
  bonus_key text not null check (bonus_key in ('attendance_week', 'uniform_week')),
  period_start date not null,
  created_at timestamptz default now(),
  unique (student_id, bonus_key, period_start)
);
alter table public.auto_bonus_log enable row level security;
create policy "auto_bonus_log_staff_read" on public.auto_bonus_log for select using (auth.role() = 'authenticated');

create or replace function public.award_weekly_deed_bonuses()
returns table (kind text, awarded_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance_deed_id int;
  v_attendance_active boolean;
  v_uniform_deed_id int;
  v_uniform_active boolean;
  v_attendance_count int := 0;
  v_uniform_count int := 0;
begin
  select id, active into v_attendance_deed_id, v_attendance_active
    from public.good_deed_types where system_key = 'attendance_week';
  select id, active into v_uniform_deed_id, v_uniform_active
    from public.good_deed_types where system_key = 'uniform_week';

  if coalesce(v_attendance_active, false) then
    with class_days as (
      select date_trunc('week', date)::date as week_start, count(distinct date) as n_days
      from public.activity_attend
      where session = 'morning'
      group by date_trunc('week', date)::date
      having count(distinct date) >= 3
         and date_trunc('week', date)::date + 4 < current_date
    ),
    student_weekly as (
      select student_id, date_trunc('week', date)::date as week_start,
             count(*) filter (where status = 'present') as n_present
      from public.activity_attend
      where session = 'morning'
      group by student_id, date_trunc('week', date)::date
    ),
    qualifying as (
      select sw.student_id, cd.week_start
      from student_weekly sw join class_days cd using (week_start)
      where sw.n_present = cd.n_days
    ),
    inserted_log as (
      insert into public.auto_bonus_log (student_id, bonus_key, period_start)
      select student_id, 'attendance_week', week_start from qualifying
      on conflict (student_id, bonus_key, period_start) do nothing
      returning student_id, period_start
    ),
    inserted_points as (
      insert into public.point_logs (student_id, teacher_id, deed_type_id, points, note)
      select student_id, null, v_attendance_deed_id, 15,
             'โบนัสอัตโนมัติ: เข้าแถวครบทุกวัน สัปดาห์ ' || to_char(period_start, 'DD/MM/YYYY')
      from inserted_log
      returning 1
    )
    select count(*) into v_attendance_count from inserted_points;
  end if;

  if coalesce(v_uniform_active, false) then
    with class_days as (
      select date_trunc('week', date)::date as week_start, count(distinct date) as n_days
      from public.uniform_checks
      group by date_trunc('week', date)::date
      having count(distinct date) >= 3
         and date_trunc('week', date)::date + 4 < current_date
    ),
    student_weekly as (
      select student_id, date_trunc('week', date)::date as week_start,
             count(*) filter (where status = 'pass') as n_pass
      from public.uniform_checks
      group by student_id, date_trunc('week', date)::date
    ),
    qualifying as (
      select sw.student_id, cd.week_start
      from student_weekly sw join class_days cd using (week_start)
      where sw.n_pass = cd.n_days
    ),
    inserted_log as (
      insert into public.auto_bonus_log (student_id, bonus_key, period_start)
      select student_id, 'uniform_week', week_start from qualifying
      on conflict (student_id, bonus_key, period_start) do nothing
      returning student_id, period_start
    ),
    inserted_points as (
      insert into public.point_logs (student_id, teacher_id, deed_type_id, points, note)
      select student_id, null, v_uniform_deed_id, 15,
             'โบนัสอัตโนมัติ: แต่งกายเรียบร้อยทุกวัน สัปดาห์ ' || to_char(period_start, 'DD/MM/YYYY')
      from inserted_log
      returning 1
    )
    select count(*) into v_uniform_count from inserted_points;
  end if;

  return query select 'attendance_week'::text, v_attendance_count
  union all
  select 'uniform_week'::text, v_uniform_count;
end;
$$;

revoke execute on function public.award_weekly_deed_bonuses() from public;
revoke execute on function public.award_weekly_deed_bonuses() from anon;
grant execute on function public.award_weekly_deed_bonuses() to authenticated;

-- =============================================
-- 14. Run the bonus check every Monday morning (01:10 UTC = 08:10 Thai time)
-- =============================================
create extension if not exists pg_cron;

select cron.schedule(
  'award-weekly-deed-bonuses',
  '10 1 * * 1',
  $$select public.award_weekly_deed_bonuses();$$
);

-- =============================================
-- 15. Reward pickup/collection tracking — separates "redeemed in the app"
-- from "physically handed the item over", so a teacher can verify at the
-- counter whether a student already collected a given redemption before
-- (redeem_reward already auto-approves instantly; this adds a second,
-- staff-only confirmation step for the physical handover).
-- reward_requests already has a blanket "any authenticated staff" policy,
-- so no new RLS policy is needed for these columns.
-- =============================================
alter table public.reward_requests
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by uuid references public.profiles(id) on delete set null;

insert into public.role_permissions (screen_key, teacher_enabled) values ('admin-reward-pickup', true)
on conflict (screen_key) do nothing;

-- =============================================
-- 16. Reward suggestions — students can suggest rewards they'd like to see
-- on the "แลกรางวัล" screen; shows up for staff on a new "ข้อเสนอแนะ" screen.
-- Students have no Supabase Auth session (login by code only), so inserts
-- only happen through this SECURITY DEFINER RPC, same pattern as
-- redeem_reward / add_point_log.
-- =============================================
create table if not exists public.reward_suggestions (
  id uuid primary key default extensions.uuid_generate_v4(),
  student_id uuid not null references public.students(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  read_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table public.reward_suggestions enable row level security;
create policy "reward_suggestions_staff_read" on public.reward_suggestions for select using (auth.role() = 'authenticated');
create policy "reward_suggestions_staff_update" on public.reward_suggestions for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function public.submit_reward_suggestion(p_student_code text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_msg text;
begin
  v_msg := trim(p_message);
  if v_msg = '' then
    raise exception 'กรุณากรอกข้อความ';
  end if;
  if length(v_msg) > 500 then
    raise exception 'ข้อความยาวเกินไป (ไม่เกิน 500 ตัวอักษร)';
  end if;

  select id into v_student_id from public.students where student_code = p_student_code;
  if v_student_id is null then
    raise exception 'ไม่พบนักเรียนรหัสนี้';
  end if;

  insert into public.reward_suggestions(student_id, message) values (v_student_id, v_msg);
end;
$$;
revoke execute on function public.submit_reward_suggestion(text,text) from public;
grant execute on function public.submit_reward_suggestion(text,text) to anon, authenticated;

insert into public.role_permissions (screen_key, teacher_enabled) values ('admin-suggestions', true)
on conflict (screen_key) do nothing;

-- =============================================
-- 17. School logo — replaces the hardcoded 🌿 emoji everywhere (login page,
-- app header, drawer, share card) once an admin uploads one. Stored the
-- same way as student photos: a public Storage bucket + staff-only write,
-- with the URL kept in app_settings (falls back to 🌿 if not set).
-- =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-assets', 'school-assets', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create policy "school_assets_read" on storage.objects for select
  using (bucket_id = 'school-assets');

create policy "school_assets_staff_insert" on storage.objects for insert
  with check (bucket_id = 'school-assets' and auth.role() = 'authenticated');

create policy "school_assets_staff_update" on storage.objects for update
  using (bucket_id = 'school-assets' and auth.role() = 'authenticated')
  with check (bucket_id = 'school-assets' and auth.role() = 'authenticated');

create policy "school_assets_staff_delete" on storage.objects for delete
  using (bucket_id = 'school-assets' and auth.role() = 'authenticated');

insert into public.app_settings (key, value) values ('school_logo_url', null)
on conflict (key) do nothing;

-- =============================================
-- 18. School name & tagline — admin-editable (settings screen), replaces the
-- hardcoded "ตาเบาวิทยา" / "ระบบสะสมคะแนนความดีนักเรียน" text everywhere
-- (login page, app header, drawer, admin dashboard, share card, document title).
-- =============================================
insert into public.app_settings (key, value) values
  ('school_name', 'ตาเบาวิทยา'),
  ('school_tagline', 'ระบบสะสมคะแนนความดีนักเรียน')
on conflict (key) do nothing;

-- =============================================
-- 19. Point codes — ครูสร้างโค้ด (QR + 6-digit) ให้นักเรียนทั้งห้องสแกนพร้อมกันรับคะแนน
-- โค้ดหมดอายุตามเวลาที่ตั้ง (default 10 นาที) และผูกขอบเขตชั้น/ห้องได้ (null = ไม่จำกัด)
-- ทุกการอ่าน/เขียนผ่าน SECURITY DEFINER RPC เท่านั้น — ไม่มี RLS policy ให้ client
-- คุยกับตารางตรงๆ. ฝั่งนักเรียนสแกนโค้ดอยู่ใน §20 ถัดไป.
-- =============================================
create table if not exists public.point_codes (
  id uuid primary key default extensions.uuid_generate_v4(),
  code text not null unique,
  deed_type_id int references public.good_deed_types(id) on delete set null,
  points int not null check (points > 0),
  grade_level text,
  room text,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table public.point_codes enable row level security;

create or replace function public.create_point_code(
  p_deed_type_id int, p_points int, p_grade_level text default null,
  p_room text default null, p_duration_seconds int default 600
)
returns public.point_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_row public.point_codes;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.point_codes where code = v_code and expires_at > now());
  end loop;

  insert into public.point_codes(code, deed_type_id, points, grade_level, room, created_by, expires_at)
  values (v_code, p_deed_type_id, p_points, p_grade_level, p_room, auth.uid(), now() + make_interval(secs => p_duration_seconds))
  returning * into v_row;

  return v_row;
end;
$$;
revoke execute on function public.create_point_code(int,int,text,text,int) from public;
revoke execute on function public.create_point_code(int,int,text,text,int) from anon;
grant execute on function public.create_point_code(int,int,text,text,int) to authenticated;

create or replace function public.cancel_point_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  update public.point_codes set expires_at = now() where id = p_id and created_by = auth.uid();
end;
$$;
revoke execute on function public.cancel_point_code(uuid) from public;
revoke execute on function public.cancel_point_code(uuid) from anon;
grant execute on function public.cancel_point_code(uuid) to authenticated;

-- =============================================
-- 20. Point code redemption — นักเรียนพลิก QR Code ประจำตัวเป็นกล้อง แล้วสแกนโค้ดของครู
-- (จาก §19) เพื่อรับคะแนนทันที. กันสแกนซ้ำด้วย unique(code_id, student_id), ตรวจสอบ
-- วันหมดอายุ + ขอบเขตชั้น/ห้องฝั่งเซิร์ฟเวอร์ทั้งหมด — นักเรียนไม่มี Supabase Auth session
-- จึงต้องเป็น SECURITY DEFINER + grant ให้ anon เหมือน redeem_reward/add_point_log.
-- =============================================
create table if not exists public.point_code_redemptions (
  id uuid primary key default extensions.uuid_generate_v4(),
  code_id uuid not null references public.point_codes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  redeemed_at timestamptz default now(),
  unique (code_id, student_id)
);
alter table public.point_code_redemptions enable row level security;

create or replace function public.redeem_point_code(p_student_code text, p_code text)
returns table (points int, deed_icon text, deed_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_grade text;
  v_student_room text;
  v_code_id uuid;
  v_deed_type_id int;
  v_points int;
  v_grade_level text;
  v_room text;
  v_expires_at timestamptz;
  v_created_by uuid;
  v_code text;
  v_deed_icon text;
  v_deed_name text;
begin
  select id, grade_level, room into v_student_id, v_student_grade, v_student_room
  from public.students where student_code = p_student_code;
  if v_student_id is null then
    raise exception 'ไม่พบนักเรียนรหัสนี้';
  end if;

  select pc.id, pc.deed_type_id, pc.points, pc.grade_level, pc.room, pc.expires_at, pc.created_by, pc.code,
         gdt.icon, gdt.name
  into v_code_id, v_deed_type_id, v_points, v_grade_level, v_room, v_expires_at, v_created_by, v_code,
       v_deed_icon, v_deed_name
  from public.point_codes pc
  left join public.good_deed_types gdt on gdt.id = pc.deed_type_id
  where pc.code = upper(trim(p_code));

  if v_code_id is null then
    raise exception 'ไม่พบโค้ดนี้ กรุณาตรวจสอบอีกครั้ง';
  end if;
  if v_expires_at <= now() then
    raise exception 'โค้ดหมดเวลาแล้ว';
  end if;
  if v_grade_level is not null and v_grade_level <> v_student_grade then
    raise exception 'โค้ดนี้ไม่ได้ใช้กับชั้นเรียนของคุณ';
  end if;
  if v_room is not null and v_room <> v_student_room then
    raise exception 'โค้ดนี้ไม่ได้ใช้กับห้องเรียนของคุณ';
  end if;
  if exists (select 1 from public.point_code_redemptions where code_id = v_code_id and student_id = v_student_id) then
    raise exception 'คุณรับคะแนนจากโค้ดนี้ไปแล้ว';
  end if;

  insert into public.point_code_redemptions(code_id, student_id) values (v_code_id, v_student_id);
  insert into public.point_logs(student_id, teacher_id, deed_type_id, points, note)
  values (v_student_id, v_created_by, v_deed_type_id, v_points, 'รับผ่านโค้ดกลุ่ม: ' || v_code);

  return query select v_points, v_deed_icon, v_deed_name;
end;
$$;
revoke execute on function public.redeem_point_code(text,text) from public;
grant execute on function public.redeem_point_code(text,text) to anon, authenticated;

-- =============================================
-- 21. Admin visibility into point-code history — §19/§20 locked point_codes/
-- point_code_redemptions to SECURITY DEFINER RPCs only (no client SELECT at all).
-- Adding read-only policies so the new "ประวัติการสร้างโค้ด" admin screen can list
-- past codes (who created them, scope, redemption count) via a normal .select().
-- =============================================
create policy "point_codes_staff_read" on public.point_codes for select
  using (auth.role() = 'authenticated');

create policy "point_code_redemptions_staff_read" on public.point_code_redemptions for select
  using (auth.role() = 'authenticated');

-- =============================================
-- 22. Cancel a mistaken point_logs entry — soft-cancel (cancelled_at/cancelled_by)
-- instead of deleting, so the row stays as an audit trail. Restricted to the
-- teacher who gave the points, or an Admin.
--
-- This also FIXES a pre-existing over-broad policy: "point_logs_staff_all" (for
-- all, using auth.role()='authenticated') let ANY signed-in staff member
-- UPDATE/DELETE any point_logs row. Nothing in the app actually relied on that
-- (SELECT already had its own policy, INSERT goes through the add_point_log RPC)
-- — it's dropped and replaced with a real ownership check.
--
-- Cancelled logs are excluded from student_points/get_student_summary/
-- get_student_history/get_report_summary so they stop counting immediately,
-- but a cancelled row is still visible to staff (point_logs_read_staff is
-- unconditional) so cancellations remain auditable.
-- =============================================
alter table public.point_logs add column if not exists cancelled_at timestamptz;
alter table public.point_logs add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

drop policy if exists "point_logs_staff_all" on public.point_logs;
create policy "point_logs_update_owner_or_admin" on public.point_logs for update
  using (auth.role() = 'authenticated' and (teacher_id = auth.uid() or is_admin()))
  with check (auth.role() = 'authenticated' and (teacher_id = auth.uid() or is_admin()));

create or replace view public.student_points as
with totals as (
  select
    s.id as student_id,
    s.student_code,
    s.student_name,
    s.prefix,
    s.grade_level,
    s.room,
    s.photo_url,
    coalesce(sum(pl.points) filter (where pl.cancelled_at is null),0)::int as total_points
  from public.students s
  left join public.point_logs pl on pl.student_id = s.id
  group by s.id, s.student_code, s.student_name, s.prefix, s.grade_level, s.room, s.photo_url
)
select
  t.student_id, t.student_code, t.student_name, t.prefix, t.grade_level, t.room, t.total_points,
  bt.name as badge_level,
  bt.icon as badge_icon,
  bt.color as badge_color,
  t.photo_url
from totals t
left join lateral (
  select name, icon, color
  from public.badge_tiers
  where active = true and min_points <= t.total_points
  order by min_points desc
  limit 1
) bt on true;

alter view public.student_points set (security_invoker = true);

create or replace function public.get_student_summary(p_student_code text)
returns table (
  student_id uuid, student_code text, student_name text, prefix text, grade_level text, room text,
  total_points int, badge_level text, rank bigint, redeem_count bigint, total_deeds bigint, photo_url text
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select sp.*, row_number() over (order by sp.total_points desc, sp.student_name) as rnk
    from public.student_points sp
  )
  select
    r.student_id, r.student_code, r.student_name, r.prefix, r.grade_level, r.room,
    r.total_points, r.badge_level, r.rnk,
    (select count(*) from public.reward_requests rr where rr.student_id = r.student_id) as redeem_count,
    (select count(*) from public.point_logs pl where pl.student_id = r.student_id and pl.cancelled_at is null) as total_deeds,
    r.photo_url
  from ranked r
  where r.student_code = p_student_code;
$$;
grant execute on function public.get_student_summary(text) to anon, authenticated;

create or replace function public.get_student_history(p_student_code text, p_limit int default 20)
returns table (
  id uuid, deed_name text, deed_icon text, teacher_name text, points int, created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select pl.id, gdt.name, gdt.icon, pr.full_name, pl.points, pl.created_at
  from public.point_logs pl
  join public.students s on s.id = pl.student_id
  left join public.good_deed_types gdt on gdt.id = pl.deed_type_id
  left join public.profiles pr on pr.id = pl.teacher_id
  where s.student_code = p_student_code and pl.cancelled_at is null
  order by pl.created_at desc
  limit p_limit;
$$;
grant execute on function public.get_student_history(text,int) to anon, authenticated;

create or replace function public.get_report_summary()
returns table (student_count bigint, teacher_count bigint, total_points bigint, log_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  if not (is_admin() or public.teacher_screen_enabled('admin-reports')) then
    raise exception 'ไม่มีสิทธิ์เข้าถึงรายงาน';
  end if;
  return query
    select
      (select count(*) from public.students) as student_count,
      (select count(*) from public.profiles) as teacher_count,
      (select coalesce(sum(points),0) from public.point_logs where cancelled_at is null) as total_points,
      (select count(*) from public.point_logs where cancelled_at is null) as log_count;
end;
$$;
revoke execute on function public.get_report_summary() from public;
revoke execute on function public.get_report_summary() from anon;
grant execute on function public.get_report_summary() to authenticated;

-- =============================================
-- 23. Staff profile photo — each teacher/admin uploads their own, shown on the
-- teacher home card. Storage bucket follows the same public-read/staff-write
-- pattern as student-photos/school-assets, but the school's PRE-EXISTING
-- profiles table already has an UPDATE policy scoped to id = auth.uid() —
-- that alone guarantees a teacher can only ever set their own photo_url, so
-- no new policy is needed on public.profiles itself.
-- =============================================
alter table public.profiles add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-photos', 'staff-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "staff_photos_read" on storage.objects for select
  using (bucket_id = 'staff-photos');

create policy "staff_photos_staff_insert" on storage.objects for insert
  with check (bucket_id = 'staff-photos' and auth.role() = 'authenticated');

create policy "staff_photos_staff_update" on storage.objects for update
  using (bucket_id = 'staff-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'staff-photos' and auth.role() = 'authenticated');

create policy "staff_photos_staff_delete" on storage.objects for delete
  using (bucket_id = 'staff-photos' and auth.role() = 'authenticated');

-- =============================================
-- 24. Call for deeds — ครูเรียกหานักเรียนมาช่วยทำความดี (คล้ายเรียกไรเดอร์ส่งอาหาร)
-- Foreground-only: ใช้ Supabase Realtime (postgres_changes) นักเรียนต้องเปิดแอปค้างไว้
-- ถึงจะได้รับการแจ้งเตือน — ยังไม่ใช่ Web Push จริง (นั่นเป็นงานเฟสถัดไป)
-- =============================================
create table if not exists public.deed_calls (
  id uuid primary key default extensions.uuid_generate_v4(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  deed_type_id int references public.good_deed_types(id) on delete set null,
  message text not null default '',
  grade_level text,  -- null = ทั้งโรงเรียน
  room text,         -- null = ทั้งชั้น (ต้องมี grade_level ด้วย)
  slots int not null default 1 check (slots > 0),
  filled_count int not null default 0,
  status text not null default 'open' check (status in ('open','filled','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_deed_calls_status on public.deed_calls(status);
create index if not exists idx_deed_calls_teacher on public.deed_calls(teacher_id);

create table if not exists public.deed_call_responses (
  id uuid primary key default extensions.uuid_generate_v4(),
  call_id uuid not null references public.deed_calls(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  student_name text not null,
  responded_at timestamptz not null default now(),
  unique (call_id, student_id)
);
create index if not exists idx_deed_call_responses_call on public.deed_call_responses(call_id);

alter table public.deed_calls enable row level security;
alter table public.deed_call_responses enable row level security;

-- อ่านได้ทุกคน — ไม่มีข้อมูลลับ (แค่ประเภทความดี/ข้อความ/ขอบเขต) จำเป็นสำหรับ Realtime ไปหานักเรียน (anon)
create policy deed_calls_read on public.deed_calls for select using (true);
create policy deed_call_responses_read on public.deed_call_responses for select using (true);

-- สร้าง/ยกเลิกได้เฉพาะครูเจ้าของงานเรียก (teacher_id ผูกกับ auth.uid() เสมอ)
create policy deed_calls_insert_staff on public.deed_calls for insert to authenticated with check (teacher_id = auth.uid());
create policy deed_calls_update_owner on public.deed_calls for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- ครูสร้างงานเรียก
create or replace function public.create_deed_call(p_deed_type_id int, p_message text, p_grade_level text, p_room text, p_slots int, p_minutes int default 15)
returns public.deed_calls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.deed_calls;
begin
  if auth.uid() is null then
    raise exception 'ต้องเข้าสู่ระบบก่อน';
  end if;
  insert into public.deed_calls(teacher_id, deed_type_id, message, grade_level, room, slots, expires_at)
  values (auth.uid(), p_deed_type_id, p_message, nullif(p_grade_level,''), nullif(p_room,''), p_slots, now() + (p_minutes || ' minutes')::interval)
  returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.create_deed_call(int,text,text,text,int,int) from public;
revoke execute on function public.create_deed_call(int,text,text,text,int,int) from anon;
grant execute on function public.create_deed_call(int,text,text,text,int,int) to authenticated;

-- ครูยกเลิกงานเรียกของตัวเอง
create or replace function public.cancel_deed_call(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน'; end if;
  update public.deed_calls set status = 'cancelled' where id = p_id and teacher_id = auth.uid();
end;
$$;
revoke execute on function public.cancel_deed_call(uuid) from public;
revoke execute on function public.cancel_deed_call(uuid) from anon;
grant execute on function public.cancel_deed_call(uuid) to authenticated;

-- นักเรียนรับงานเรียก — ไม่มี Supabase Auth session จึงเป็น SECURITY DEFINER + grant anon
-- เหมือน redeem_point_code, ล็อกแถวด้วย FOR UPDATE กันแย่งสิทธิ์เกินจำนวน slots ตอนรับพร้อมกัน
create or replace function public.respond_to_deed_call(p_call_id uuid, p_student_code text)
returns table (ok boolean, message text, filled_count int, slots int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_name text;
  v_student_grade text;
  v_student_room text;
  v_call record;
begin
  -- คอลัมน์ต้องผูก alias ตารางให้ชัด (s./dc.) เพราะ "returns table" ประกาศ filled_count/slots
  -- เป็นตัวแปร PL/pgSQL โดยปริยาย ชื่อชนกับคอลัมน์จริงในตาราง ทำให้ error "ambiguous" ถ้าเขียนลอยๆ
  select s.id, s.student_name, s.grade_level, s.room into v_student_id, v_student_name, v_student_grade, v_student_room
  from public.students s where s.student_code = p_student_code;
  if v_student_id is null then
    raise exception 'ไม่พบรหัสนักเรียนนี้';
  end if;

  select * into v_call from public.deed_calls where public.deed_calls.id = p_call_id for update;
  if v_call.id is null then
    raise exception 'ไม่พบงานเรียกนี้';
  end if;
  if v_call.status <> 'open' or v_call.expires_at <= now() then
    return query select false, 'งานนี้ปิดรับแล้วหรือหมดเวลาแล้ว', v_call.filled_count, v_call.slots;
    return;
  end if;
  if v_call.grade_level is not null and v_call.grade_level <> v_student_grade then
    raise exception 'งานนี้ไม่ได้เรียกชั้นเรียนของคุณ';
  end if;
  if v_call.room is not null and v_call.room <> v_student_room then
    raise exception 'งานนี้ไม่ได้เรียกห้องเรียนของคุณ';
  end if;
  if exists (select 1 from public.deed_call_responses r where r.call_id = p_call_id and r.student_id = v_student_id) then
    return query select true, 'คุณรับงานนี้ไปแล้ว', v_call.filled_count, v_call.slots;
    return;
  end if;

  insert into public.deed_call_responses(call_id, student_id, student_name) values (p_call_id, v_student_id, v_student_name);
  update public.deed_calls dc set filled_count = dc.filled_count + 1,
    status = case when dc.filled_count + 1 >= dc.slots then 'filled' else dc.status end
    where dc.id = p_call_id;

  return query select true, 'รับงานสำเร็จ', (v_call.filled_count + 1), v_call.slots;
end;
$$;
revoke execute on function public.respond_to_deed_call(uuid,text) from public;
grant execute on function public.respond_to_deed_call(uuid,text) to anon, authenticated;

-- นักเรียนดึงงานเรียกที่ยังเปิดอยู่และตรงขอบเขตของตัวเอง (ใช้ตอนเปิดแอป ก่อน Realtime จะเริ่มรับ event ใหม่)
create or replace function public.get_active_deed_calls(p_student_code text)
returns table (
  id uuid, deed_type_id int, deed_icon text, deed_name text, message text,
  grade_level text, room text, slots int, filled_count int, expires_at timestamptz, created_at timestamptz,
  teacher_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_grade text;
  v_room text;
begin
  -- ต้องผูก alias s. เพราะ "returns table" ประกาศ id เป็นตัวแปร PL/pgSQL โดยปริยาย ชนกับ students.id
  select s.id, s.grade_level, s.room into v_student_id, v_grade, v_room
  from public.students s where s.student_code = p_student_code;
  if v_student_id is null then
    raise exception 'ไม่พบรหัสนักเรียนนี้';
  end if;

  return query
    select dc.id, dc.deed_type_id, gdt.icon, gdt.name, dc.message,
           dc.grade_level, dc.room, dc.slots, dc.filled_count, dc.expires_at, dc.created_at,
           p.full_name
    from public.deed_calls dc
    left join public.good_deed_types gdt on gdt.id = dc.deed_type_id
    left join public.profiles p on p.id = dc.teacher_id
    where dc.status = 'open' and dc.expires_at > now()
      and (dc.grade_level is null or dc.grade_level = v_grade)
      and (dc.room is null or dc.room = v_room)
      and not exists (select 1 from public.deed_call_responses r where r.call_id = dc.id and r.student_id = v_student_id)
    order by dc.created_at desc;
end;
$$;
revoke execute on function public.get_active_deed_calls(text) from public;
grant execute on function public.get_active_deed_calls(text) to anon, authenticated;

-- เปิด Realtime broadcast ให้สองตารางนี้ (จำเป็นสำหรับแจ้งเตือนแบบเรียลไทม์)
alter publication supabase_realtime add table public.deed_calls;
alter publication supabase_realtime add table public.deed_call_responses;

-- =============================================
-- 25. Student grades (ผลการเรียน) — reads from the subjects/score_summary tables
-- owned by the separate ปพ.5 grade-recording app (pp5-ten.vercel.app), which lives
-- in this SAME Supabase project/database. Those tables are RLS-locked to authenticated
-- teacher sessions only, so students (who have no Supabase Auth session — see §-login-
-- by-student_code pattern used throughout this file) need a SECURITY DEFINER RPC to
-- read their own rows, mirroring get_student_summary/get_student_history above.
-- =============================================
create or replace function public.get_student_grades(p_student_code text)
returns table (
  subject_id uuid,
  subject_code text,
  subject_name text,
  subject_group text,
  credits numeric,
  teacher_name text,
  academic_year text,
  semester int,
  total_score numeric,
  grade numeric,
  special_result text,
  has_score boolean
)
language sql
security definer
set search_path = public
as $$
  select
    sub.id, sub.subject_code, sub.subject_name, sub.subject_group, sub.credits,
    sub.teacher_name, sub.academic_year, sub.semester,
    ss.total_score, ss.grade, ss.special_result,
    (ss.id is not null) as has_score
  from public.students s
  join public.subjects sub on sub.grade_level = s.grade_level and sub.room = s.room
  left join public.score_summary ss on ss.subject_id = sub.id and ss.student_id = s.id
  where s.student_code = p_student_code
  order by sub.academic_year desc, sub.semester desc, sub.subject_name;
$$;
grant execute on function public.get_student_grades(text) to anon, authenticated;

-- คะแนนย่อยรายหน่วย (score_units) ของนักเรียนคนหนึ่งในวิชาหนึ่ง — ใช้เปิด popup รายละเอียด
-- เมื่อกดที่รายวิชาในหน้า "ผลการเรียน"
create or replace function public.get_student_subject_units(p_student_code text, p_subject_id uuid)
returns table (
  period text,
  unit_number int,
  unit_name text,
  standard_ref text,
  max_score numeric,
  score numeric
)
language sql
security definer
set search_path = public
as $$
  select su.period, su.unit_number, su.unit_name, su.standard_ref, su.max_score, su.score
  from public.score_units su
  join public.students s on s.id = su.student_id
  where s.student_code = p_student_code and su.subject_id = p_subject_id
  order by su.period, su.unit_number;
$$;
grant execute on function public.get_student_subject_units(text, uuid) to anon, authenticated;
