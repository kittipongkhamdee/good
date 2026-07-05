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

// เรียกตอนเปิดแอป — Supabase Auth เก็บ session ของครู/แอดมินไว้ใน localStorage ให้เองอยู่แล้ว
// แค่เช็คว่ายังมี session ที่ใช้ได้อยู่ไหม แล้วดึงโปรไฟล์กลับมา
async function getCurrentStaffProfile() {
  const session = await getCurrentSession();
  if (!session) return { profile: null, error: null };

  const { data: profile, error: profErr } = await _sb
    .from('profiles')
    .select('id, full_name, role, is_admin, is_active')
    .eq('id', session.user.id)
    .single();
  if (profErr || !profile || !profile.is_active) return { profile: null, error: null };

  return { profile, error: null };
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

async function getLeaderboard({ limit = null, gradeLevel = null, room = null } = {}) {
  const { data, error } = await _sb.rpc('get_leaderboard', {
    p_limit: limit, p_grade_level: gradeLevel, p_room: room,
  });
  return { data, error: error?.message || null };
}

async function getStudentRedemptions(studentCode) {
  const { data, error } = await _sb.rpc('get_student_redemptions', { p_student_code: studentCode });
  return { data, error: error?.message || null };
}

// ──────────────────────────────────────────────
// Students (staff-facing: search/list uses real students table, requires staff session)
// ──────────────────────────────────────────────

async function getStudents({ search = '', limit = 20, offset = 0, gradeLevel = '', room = '' } = {}) {
  let q = _sb.from('students')
    .select('id, student_code, student_name, prefix, grade_level, room, photo_url', { count: 'exact' })
    .order('grade_level').order('room').order('student_name')
    .range(offset, offset + limit - 1);
  if (search) q = q.or(`student_name.ilike.%${search}%,student_code.ilike.%${search}%`);
  if (gradeLevel) q = q.eq('grade_level', gradeLevel);
  if (room) q = q.eq('room', room);
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

// รายชื่อชั้น/ห้องที่มีอยู่จริง — ใช้ populate dropdown กรองในหน้าจัดการนักเรียน
async function getStudentClasses() {
  const { data, error } = await _sb.from('students').select('grade_level, room').order('grade_level').order('room');
  if (error) return { data: [], error: error.message };
  const seen = new Set();
  const classes = [];
  for (const s of data) {
    const key = `${s.grade_level}/${s.room}`;
    if (!seen.has(key)) { seen.add(key); classes.push({ grade_level: s.grade_level, room: s.room }); }
  }
  return { data: classes, error: null };
}

// ──────────────────────────────────────────────
// Student profile photos (Supabase Storage bucket "student-photos", public
// read; only signed-in staff can upload/replace/remove — see schema.sql §12)
// ──────────────────────────────────────────────

async function uploadStudentPhoto(studentId, file, { ext = 'jpg', contentType = 'image/jpeg' } = {}) {
  const path = `${studentId}.${ext}`;
  const { error: upErr } = await _sb.storage.from('student-photos').upload(path, file, {
    upsert: true, contentType,
  });
  if (upErr) return { url: null, error: upErr.message };

  const { data } = _sb.storage.from('student-photos').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const { error: updErr } = await _sb.from('students').update({ photo_url: url }).eq('id', studentId);
  if (updErr) return { url: null, error: updErr.message };
  return { url, error: null };
}

async function removeStudentPhoto(studentId, photoUrl) {
  const path = photoUrl?.split('/student-photos/')[1]?.split('?')[0];
  if (path) await _sb.storage.from('student-photos').remove([path]);
  const { error } = await _sb.from('students').update({ photo_url: null }).eq('id', studentId);
  return { error: error?.message || null };
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

// teachers pick a deed manually — active only, and never the system-computed
// bonus types (เข้าแถว/เครื่องแบบ), those are only ever awarded by the RPC
async function getDeedTypes() {
  const { data, error } = await _sb.from('good_deed_types').select('*').eq('active', true).is('system_key', null).order('name');
  return { data, error: error?.message || null };
}

// admin management screen — sees everything, including inactive and system-computed types
async function getAllDeedTypes() {
  const { data, error } = await _sb.from('good_deed_types').select('*').order('name');
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
  // Permission-checked server-side (see get_report_summary RPC) — a teacher
  // without the "รายงาน" permission gets a clean error instead of data.
  const { data, error } = await _sb.rpc('get_report_summary').single();
  if (error) return { data: null, error: error.message };
  return {
    data: {
      studentCount: data.student_count || 0,
      teacherCount: data.teacher_count || 0,
      totalPoints: data.total_points || 0,
      logCount: data.log_count || 0,
    },
    error: null,
  };
}

// ──────────────────────────────────────────────
// Role permissions (which management screens teachers can access — Admin-only write)
// ──────────────────────────────────────────────

async function getRolePermissions() {
  const { data, error } = await _sb.from('role_permissions').select('*');
  if (error) return { data: null, error: error.message };
  const perms = {};
  for (const row of data) perms[row.screen_key] = row.teacher_enabled;
  return { data: perms, error: null };
}

async function updateRolePermission(screenKey, enabled) {
  const { error } = await _sb.from('role_permissions').update({ teacher_enabled: enabled }).eq('screen_key', screenKey);
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// Badge tiers (public read; any signed-in staff can manage — Admin parity)
// ──────────────────────────────────────────────

async function getBadgeTiers() {
  const { data, error } = await _sb.from('badge_tiers').select('*').order('min_points');
  return { data, error: error?.message || null };
}

async function addBadgeTier({ icon, name, min_points, color }) {
  const { error } = await _sb.from('badge_tiers').insert({ icon, name, min_points, color });
  return { error: error?.message || null };
}

async function updateBadgeTier(id, updates) {
  const { error } = await _sb.from('badge_tiers').update(updates).eq('id', id);
  return { error: error?.message || null };
}

async function deleteBadgeTier(id) {
  const { error } = await _sb.from('badge_tiers').delete().eq('id', id);
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// App settings (public read; any signed-in staff can manage)
// ──────────────────────────────────────────────

async function getAppSettings() {
  const { data, error } = await _sb.from('app_settings').select('*');
  if (error) return { data: null, error: error.message };
  const settings = {};
  for (const row of data) settings[row.key] = row.value;
  return {
    data: {
      leaderboardEnabled: settings.leaderboard_enabled !== 'false',
      leaderboardTopN: parseInt(settings.leaderboard_top_n) || 10,
    },
    error: null,
  };
}

async function updateAppSetting(key, value) {
  const { error } = await _sb.from('app_settings').update({ value: String(value) }).eq('key', key);
  return { error: error?.message || null };
}
