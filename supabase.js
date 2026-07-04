/* =============================================
   ตาเบาวิทยา — Supabase Integration (Real Backend)
   เชื่อมต่อกับฐานข้อมูลนักเรียน/ครูที่มีอยู่จริง (project: PP5)
   ============================================= */

const SUPABASE_URL = 'https://zwtulepvmlngcrbcrrki.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XSAOmXfp00l6Lh0xLwXERQ_4UEgkWhS';

const DEMO_MODE = (SUPABASE_URL === 'YOUR_SUPABASE_URL');

let _sb = null;
if (!DEMO_MODE && typeof supabase !== 'undefined') {
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────
// นักเรียน: เข้าด้วยรหัสนักเรียนอย่างเดียว ไม่ต้องมีรหัสผ่าน (lookup ผ่าน RPC)
// ครู/แอดมิน: เข้าด้วยอีเมล + รหัสผ่านจริงผ่าน Supabase Auth (บัญชีที่มีอยู่แล้วในระบบ)
// ──────────────────────────────────────────────

async function studentLogin(studentCode) {
  const { data, error } = await _sb.rpc('get_student_summary', { p_student_code: studentCode });
  if (error) return { student: null, error: error.message };
  if (!data || data.length === 0) return { student: null, error: 'ไม่พบรหัสนักเรียนนี้' };
  return { student: data[0], error: null };
}

async function staffLogin(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) return { profile: null, error: error.message };

  const { data: profile, error: profErr } = await _sb
    .from('profiles')
    .select('id, full_name, role, is_admin, is_active')
    .eq('id', data.user.id)
    .single();
  if (profErr) return { profile: null, error: profErr.message };
  if (!profile.is_active) return { profile: null, error: 'บัญชีนี้ถูกระงับการใช้งาน' };

  return { profile, error: null };
}

async function staffLogout() {
  await _sb.auth.signOut();
}

async function getCurrentSession() {
  const { data } = await _sb.auth.getSession();
  return data.session;
}

// ──────────────────────────────────────────────
// Student data (via RPC — no direct table grants needed for anon)
// ──────────────────────────────────────────────

async function getStudentSummary(studentCode) {
  const { data, error } = await _sb.rpc('get_student_summary', { p_student_code: studentCode });
  if (error) return { data: null, error: error.message };
  return { data: data?.[0] || null, error: null };
}

async function getStudentHistory(studentCode, limit = 20) {
  const { data, error } = await _sb.rpc('get_student_history', { p_student_code: studentCode, p_limit: limit });
  return { data, error: error?.message || null };
}

async function getLeaderboard(limit = 10) {
  const { data, error } = await _sb.rpc('get_leaderboard', { p_limit: limit });
  return { data, error: error?.message || null };
}

async function getStudentRedemptions(studentCode) {
  const { data, error } = await _sb.rpc('get_student_redemptions', { p_student_code: studentCode });
  return { data, error: error?.message || null };
}

// ──────────────────────────────────────────────
// Students (staff-facing: search/list uses real students table, requires staff session)
// ──────────────────────────────────────────────

async function getStudents({ search = '', limit = 20, offset = 0 } = {}) {
  let q = _sb.from('students')
    .select('id, student_code, student_name, prefix, grade_level, room', { count: 'exact' })
    .order('grade_level').order('room').order('student_name')
    .range(offset, offset + limit - 1);
  if (search) q = q.or(`student_name.ilike.%${search}%,student_code.ilike.%${search}%`);
  const { data, count, error } = await q;
  if (error) return { data: [], count: 0, error: error.message };

  // enrich with points from the aggregated view
  const codes = (data || []).map(s => s.student_code);
  let pointsByCode = {};
  if (codes.length) {
    const { data: pts } = await _sb.from('student_points').select('student_code, total_points, badge_level').in('student_code', codes);
    pointsByCode = Object.fromEntries((pts || []).map(p => [p.student_code, p]));
  }
  const merged = (data || []).map(s => ({
    ...s,
    total_points: pointsByCode[s.student_code]?.total_points || 0,
    badge_level: pointsByCode[s.student_code]?.badge_level || 'ผู้เริ่มต้น',
  }));
  return { data: merged, count, error: null };
}

async function getStudentByCode(code) {
  return getStudentSummary(code);
}

// ──────────────────────────────────────────────
// Points — teacher awards points (requires real Supabase Auth session)
// ──────────────────────────────────────────────

async function addPointLog({ studentCode, deedTypeId, points, note = '' }) {
  const { error } = await _sb.rpc('add_point_log', {
    p_student_code: studentCode,
    p_deed_type_id: deedTypeId,
    p_points: points,
    p_note: note,
  });
  return { error: error?.message || null };
}

async function getPointLogs({ limit = 20 } = {}) {
  const { data, error } = await _sb
    .from('point_logs')
    .select('id, points, note, created_at, students(student_name, prefix, grade_level, room), good_deed_types(name, icon), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data, error: error?.message || null };
}

// ──────────────────────────────────────────────
// Deed types (public read; admin manages)
// ──────────────────────────────────────────────

async function getDeedTypes() {
  const { data, error } = await _sb.from('good_deed_types').select('*').eq('active', true).order('name');
  return { data, error: error?.message || null };
}

async function addDeedType(dt) {
  const { error } = await _sb.from('good_deed_types').insert({
    icon: dt.icon, name: dt.name, points_min: dt.points_min, points_max: dt.points_max,
  });
  return { error: error?.message || null };
}

async function updateDeedType(id, updates) {
  const { error } = await _sb.from('good_deed_types').update(updates).eq('id', id);
  return { error: error?.message || null };
}

async function deleteDeedType(id) {
  const { error } = await _sb.from('good_deed_types').delete().eq('id', id);
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// Rewards (public read; admin manages; redemption via RPC)
// ──────────────────────────────────────────────

async function getRewards() {
  const { data, error } = await _sb.from('rewards').select('*').order('points_required');
  return { data, error: error?.message || null };
}

async function addReward(reward) {
  const { error } = await _sb.from('rewards').insert(reward);
  return { error: error?.message || null };
}

async function updateReward(id, updates) {
  const { error } = await _sb.from('rewards').update(updates).eq('id', id);
  return { error: error?.message || null };
}

async function redeemReward(studentCode, rewardId) {
  const { error } = await _sb.rpc('redeem_reward', { p_student_code: studentCode, p_reward_id: rewardId });
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// Reports (staff-only, aggregated from real tables)
// ──────────────────────────────────────────────

async function getReportSummary() {
  const [{ count: studentCount }, { count: logCount }, pointsAgg] = await Promise.all([
    _sb.from('students').select('*', { count: 'exact', head: true }),
    _sb.from('point_logs').select('*', { count: 'exact', head: true }),
    _sb.from('point_logs').select('points'),
  ]);
  const totalPoints = (pointsAgg.data || []).reduce((sum, r) => sum + r.points, 0);
  const { count: staffCount } = await _sb.from('profiles').select('*', { count: 'exact', head: true });

  return {
    data: {
      studentCount: studentCount || 0,
      teacherCount: staffCount || 0,
      totalPoints,
      logCount: logCount || 0,
    },
    error: null,
  };
}
