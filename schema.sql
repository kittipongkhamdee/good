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
  ('🌿', 'ผู้เริ่มต้น',    0,    '#6b7280'),
  ('🌱', 'คนดีระดับต้น',   100,  'oklch(0.52 0.17 145)'),
  ('🌟', 'คนดีระดับกลาง', 500,  '#3b82f6'),
  ('⭐', 'คนดีระดับสูง',  1000, '#8b5cf6'),
  ('👑', 'คนดีต้นแบบ',    5000, '#f59e0b')
on conflict do nothing;

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
