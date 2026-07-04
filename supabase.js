/* =============================================
   ตาเบาวิทยา — Supabase Integration
   แก้ไข SUPABASE_URL และ SUPABASE_KEY ด้านล่าง
   ============================================= */

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

// หากยังไม่ได้ตั้งค่า Supabase จะทำงานใน Demo Mode อัตโนมัติ
const DEMO_MODE = (SUPABASE_URL === 'YOUR_SUPABASE_URL');

let _sb = null;
if (!DEMO_MODE && typeof supabase !== 'undefined') {
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ── ข้อมูล Demo สำหรับทดสอบโดยไม่มี Backend ──
const DEMO_DATA = {
  users: {
    student: { id: 'stu-001', username: 'student01', role: 'student',
               fullname: 'ด.ญ. สมหญิง ใจดี', student_id: '65001', class: 'ม.3/2' },
    teacher: { id: 'tch-001', username: 'teacher01', role: 'teacher',
               fullname: 'ครูอภิชัย มีธรรม', subject: 'คณิตศาสตร์', class: 'ม.3/2' },
    admin:   { id: 'adm-001', username: 'admin', role: 'admin', fullname: 'ผู้ดูแลระบบ' },
  },

  students: [
    { id: 'stu-001', code: '65001', name: 'ด.ญ. สมหญิง ใจดี',   class: 'ม.3/2', pts: 847,  icon: '👧', active: true },
    { id: 'stu-002', code: '65002', name: 'ด.ช. กล้าหาญ ดีงาม', class: 'ม.3/1', pts: 1250, icon: '👦', active: true },
    { id: 'stu-003', code: '65003', name: 'ด.ญ. ขยัน ตั้งใจ',   class: 'ม.3/3', pts: 790,  icon: '👧', active: true },
    { id: 'stu-004', code: '65004', name: 'ด.ช. รักษ์โลก สีเขียว', class: 'ม.3/2', pts: 1050, icon: '👦', active: true },
    { id: 'stu-005', code: '65005', name: 'ด.ญ. ใจดี มีน้ำใจ',  class: 'ม.2/3', pts: 1180, icon: '👧', active: false },
    { id: 'stu-006', code: '65006', name: 'ด.ช. ฉลาด คิดเก่ง',  class: 'ม.2/1', pts: 820,  icon: '👦', active: true },
    { id: 'stu-007', code: '65007', name: 'ด.ญ. มานะ อดทน',    class: 'ม.1/1', pts: 970,  icon: '👧', active: true },
  ],

  deedTypes: [
    { id: 1, icon: '🧹', name: 'เก็บขยะ',         range: '5–15',  count: 203 },
    { id: 2, icon: '👩‍🏫', name: 'ช่วยครู',          range: '10–20', count: 187 },
    { id: 3, icon: '🤝', name: 'ช่วยเพื่อน',       range: '10–20', count: 312 },
    { id: 4, icon: '🌿', name: 'จิตอาสา',          range: '15–30', count: 154 },
    { id: 5, icon: '🎪', name: 'ร่วมกิจกรรม',     range: '20–50', count: 289 },
    { id: 6, icon: '💝', name: 'บริจาคสิ่งของ',   range: '25–50', count: 58  },
  ],

  rewards: [
    { id: 1, icon: '📚', name: 'สมุดบันทึก',       pts: 100, stock: 12, active: true  },
    { id: 2, icon: '🎒', name: 'กระเป๋านักเรียน', pts: 500, stock: 3,  active: true  },
    { id: 3, icon: '🖊️', name: 'ชุดเครื่องเขียน', pts: 200, stock: 8,  active: true  },
    { id: 4, icon: '🏅', name: 'เหรียญรางวัล',    pts: 300, stock: 5,  active: false },
    { id: 5, icon: '🎫', name: 'บัตรยกเว้นการบ้าน', pts: 150, stock: 2, active: true  },
    { id: 6, icon: '🍜', name: 'คูปองอาหาร',      pts: 80,  stock: 20, active: true  },
  ],

  pointLogs: [
    { id: 1, student: 'ด.ญ. สมหญิง ใจดี', class: 'ม.3/2', deed: 'เก็บขยะ',  teacher: 'ครูอภิชัย', date: '23 มิ.ย. 67', time: '09:30', pts: 10, icon: '🧹' },
    { id: 2, student: 'ด.ช. กล้าหาญ ดีงาม', class: 'ม.3/1', deed: 'ช่วยครู', teacher: 'ครูอภิชัย', date: '23 มิ.ย. 67', time: '09:15', pts: 15, icon: '👩‍🏫' },
    { id: 3, student: 'ด.ญ. ขยัน ตั้งใจ', class: 'ม.3/3', deed: 'จิตอาสา', teacher: 'ครูสมศรี', date: '22 มิ.ย. 67', time: '14:00', pts: 20, icon: '🌿' },
    { id: 4, student: 'ด.ช. รักษ์โลก สีเขียว', class: 'ม.3/2', deed: 'บริจาคสิ่งของ', teacher: 'ครูวิชัย', date: '21 มิ.ย. 67', time: '11:00', pts: 30, icon: '💝' },
    { id: 5, student: 'ด.ญ. ใจดี มีน้ำใจ', class: 'ม.2/3', deed: 'ร่วมกิจกรรม', teacher: 'ครูสมศรี', date: '20 มิ.ย. 67', time: '15:30', pts: 25, icon: '🎪' },
    { id: 6, student: 'ด.ช. ฉลาด คิดเก่ง', class: 'ม.2/1', deed: 'ช่วยเพื่อน', teacher: 'ครูวิชัย', date: '20 มิ.ย. 67', time: '10:00', pts: 12, icon: '🤝' },
  ],

  studentHistory: [
    { icon: '🧹', name: 'เก็บขยะในห้องน้ำ',   teacher: 'ครูอภิชัย', date: '23 มิ.ย. 67', pts: 10 },
    { icon: '🤝', name: 'ช่วยเพื่อนเรียนคณิต', teacher: 'ครูสมศรี', date: '22 มิ.ย. 67', pts: 15 },
    { icon: '🌿', name: 'จิตอาสาทำความสะอาด',  teacher: 'ครูวิชัย', date: '19 มิ.ย. 67', pts: 20 },
    { icon: '💝', name: 'บริจาคสิ่งของ',        teacher: 'ครูอภิชัย', date: '18 มิ.ย. 67', pts: 30 },
    { icon: '🎪', name: 'ร่วมกิจกรรมวันไหว้ครู', teacher: 'ครูสมศรี', date: '15 มิ.ย. 67', pts: 25 },
    { icon: '👩‍🏫', name: 'ช่วยครูจัดเอกสาร',    teacher: 'ครูวิชัย', date: '12 มิ.ย. 67', pts: 10 },
    { icon: '🌱', name: 'ปลูกต้นไม้',          teacher: 'ครูอภิชัย', date: '10 มิ.ย. 67', pts: 15 },
  ],

  monthlyData: {
    labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'],
    values: [420, 560, 380, 720, 830, 950],
  },
};

// ──────────────────────────────────────────────
// Auth functions
// ──────────────────────────────────────────────

async function authLogin(username, password) {
  if (DEMO_MODE) {
    // Demo: รับรหัสใดก็ได้ แต่ username ต้องตรงกับ role
    if (username === 'student01') return { user: DEMO_DATA.users.student, error: null };
    if (username === 'teacher01') return { user: DEMO_DATA.users.teacher, error: null };
    if (username === 'admin')     return { user: DEMO_DATA.users.admin, error: null };
    return { user: null, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  const email = `${username}@taobao.ac.th`;
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };

  const { data: profile } = await _sb.from('users').select('*').eq('id', data.user.id).single();
  return { user: profile, error: null };
}

async function authLogout() {
  if (!DEMO_MODE && _sb) await _sb.auth.signOut();
}

// ──────────────────────────────────────────────
// Students
// ──────────────────────────────────────────────

async function getStudents({ search = '', limit = 20, offset = 0 } = {}) {
  if (DEMO_MODE) {
    let list = [...DEMO_DATA.students];
    if (search) list = list.filter(s => s.name.includes(search) || s.code.includes(search));
    return { data: list.slice(offset, offset + limit), count: list.length, error: null };
  }
  let q = _sb.from('students').select('*', { count: 'exact' }).range(offset, offset + limit - 1);
  if (search) q = q.or(`fullname.ilike.%${search}%,student_code.ilike.%${search}%`);
  const { data, count, error } = await q;
  return { data, count, error };
}

async function getStudentByCode(code) {
  if (DEMO_MODE) {
    const s = DEMO_DATA.students.find(s => s.code === code);
    return { data: s || null, error: s ? null : 'ไม่พบนักเรียน' };
  }
  const { data, error } = await _sb.from('students').select('*').eq('student_code', code).single();
  return { data, error };
}

async function addStudent(student) {
  if (DEMO_MODE) { DEMO_DATA.students.push({ ...student, id: `stu-${Date.now()}`, pts: 0, icon: '👦', active: true }); return { error: null }; }
  const { error } = await _sb.from('students').insert(student);
  return { error };
}

async function updateStudent(id, updates) {
  if (DEMO_MODE) { const s = DEMO_DATA.students.find(s => s.id === id); if (s) Object.assign(s, updates); return { error: null }; }
  const { error } = await _sb.from('students').update(updates).eq('id', id);
  return { error };
}

async function deleteStudent(id) {
  if (DEMO_MODE) { const i = DEMO_DATA.students.findIndex(s => s.id === id); if (i > -1) DEMO_DATA.students.splice(i, 1); return { error: null }; }
  const { error } = await _sb.from('students').delete().eq('id', id);
  return { error };
}

// ──────────────────────────────────────────────
// Points
// ──────────────────────────────────────────────

async function addPointLog({ studentId, teacherId, deedTypeId, deedName, points, note = '' }) {
  if (DEMO_MODE) {
    const s = DEMO_DATA.students.find(s => s.id === studentId);
    if (s) s.pts += points;
    DEMO_DATA.pointLogs.unshift({ id: Date.now(), student: s?.name, class: s?.class, deed: deedName, teacher: 'ครูอภิชัย', date: 'วันนี้', time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }), pts: points, icon: '🌿' });
    return { error: null };
  }
  const { error } = await _sb.from('point_logs').insert({ student_id: studentId, teacher_id: teacherId, deed_type_id: deedTypeId, points, note });
  if (!error) await _sb.rpc('update_student_points', { p_student_id: studentId, p_points: points });
  return { error };
}

async function getPointLogs({ studentId = null, teacherId = null, limit = 20 } = {}) {
  if (DEMO_MODE) {
    let logs = [...DEMO_DATA.pointLogs];
    return { data: logs.slice(0, limit), error: null };
  }
  let q = _sb.from('point_logs').select('*, students(fullname,class), teachers(fullname), deed_types(name,icon)').order('created_at', { ascending: false }).limit(limit);
  if (studentId) q = q.eq('student_id', studentId);
  if (teacherId) q = q.eq('teacher_id', teacherId);
  const { data, error } = await q;
  return { data, error };
}

async function getStudentHistory(studentId) {
  if (DEMO_MODE) return { data: DEMO_DATA.studentHistory, error: null };
  const { data, error } = await _sb.from('point_logs').select('*, deed_types(name,icon), teachers(fullname)').eq('student_id', studentId).order('created_at', { ascending: false });
  return { data, error };
}

// ──────────────────────────────────────────────
// Deed types
// ──────────────────────────────────────────────

async function getDeedTypes() {
  if (DEMO_MODE) return { data: DEMO_DATA.deedTypes, error: null };
  const { data, error } = await _sb.from('good_deed_types').select('*').eq('active', true).order('name');
  return { data, error };
}

async function addDeedType(dt) {
  if (DEMO_MODE) { DEMO_DATA.deedTypes.push({ ...dt, id: Date.now(), count: 0 }); return { error: null }; }
  const { error } = await _sb.from('good_deed_types').insert(dt);
  return { error };
}

async function updateDeedType(id, updates) {
  if (DEMO_MODE) { const d = DEMO_DATA.deedTypes.find(d => d.id === id); if (d) Object.assign(d, updates); return { error: null }; }
  const { error } = await _sb.from('good_deed_types').update(updates).eq('id', id);
  return { error };
}

async function deleteDeedType(id) {
  if (DEMO_MODE) { const i = DEMO_DATA.deedTypes.findIndex(d => d.id === id); if (i > -1) DEMO_DATA.deedTypes.splice(i, 1); return { error: null }; }
  const { error } = await _sb.from('good_deed_types').delete().eq('id', id);
  return { error };
}

// ──────────────────────────────────────────────
// Rewards
// ──────────────────────────────────────────────

async function getRewards() {
  if (DEMO_MODE) return { data: DEMO_DATA.rewards, error: null };
  const { data, error } = await _sb.from('rewards').select('*').order('points_required');
  return { data, error };
}

async function addReward(reward) {
  if (DEMO_MODE) { DEMO_DATA.rewards.push({ ...reward, id: Date.now() }); return { error: null }; }
  const { error } = await _sb.from('rewards').insert(reward);
  return { error };
}

async function updateReward(id, updates) {
  if (DEMO_MODE) { const r = DEMO_DATA.rewards.find(r => r.id === id); if (r) Object.assign(r, updates); return { error: null }; }
  const { error } = await _sb.from('rewards').update(updates).eq('id', id);
  return { error };
}

async function redeemReward(studentId, rewardId) {
  if (DEMO_MODE) {
    const r = DEMO_DATA.rewards.find(r => r.id === rewardId);
    const s = DEMO_DATA.students.find(s => s.id === studentId);
    if (r && s && s.pts >= r.pts) { s.pts -= r.pts; r.stock = Math.max(0, r.stock - 1); return { error: null }; }
    return { error: 'คะแนนไม่พอหรือสินค้าหมด' };
  }
  const { error } = await _sb.rpc('redeem_reward', { p_student_id: studentId, p_reward_id: rewardId });
  return { error };
}

// ──────────────────────────────────────────────
// Reports
// ──────────────────────────────────────────────

async function getReportSummary() {
  if (DEMO_MODE) return {
    data: {
      studentCount: 542, teacherCount: 38, totalPoints: 12847, logCount: 1203,
      topClass: 'ม.3/1', monthPts: 950, activeStudents: 128, redemptions: 23,
      monthly: DEMO_DATA.monthlyData,
    },
    error: null,
  };
  const [students, teachers, logs] = await Promise.all([
    _sb.from('students').select('*', { count: 'exact', head: true }),
    _sb.from('teachers').select('*', { count: 'exact', head: true }),
    _sb.from('point_logs').select('points.sum()'),
  ]);
  return { data: { studentCount: students.count, teacherCount: teachers.count }, error: null };
}
