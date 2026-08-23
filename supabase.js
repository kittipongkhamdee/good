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
    .select('id, full_name, role, is_admin, is_active, photo_url, homeroom_grade_level, homeroom_room')
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
    .select('id, full_name, role, is_admin, is_active, photo_url, homeroom_grade_level, homeroom_room')
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

// ผลการเรียน — อ่านจากตาราง subjects/score_summary ของระบบ ปพ.5 (คนละแอป แต่ฐานข้อมูลเดียวกัน)
async function getStudentGrades(studentCode) {
  const { data, error } = await _sb.rpc('get_student_grades', { p_student_code: studentCode });
  return { data, error: error?.message || null };
}

// แจ้งขอลา — เขียนผ่าน RPC เพราะนักเรียนเป็น anon (ไม่มี Supabase Auth session) แชร์
// ตารางเดียวกับระบบเช็คชื่อกิจกรรม (pp5/activity.html คนละ repo แต่ฐานข้อมูลเดียวกัน)
async function submitLeaveRequest(studentCode, leaveType, startDate, endDate, reason, photoUrl, gpsLat, gpsLng, gpsAccuracy) {
  const { data, error } = await _sb.rpc('submit_leave_request', {
    p_student_code: studentCode, p_leave_type: leaveType,
    p_start_date: startDate, p_end_date: endDate, p_reason: reason || null,
    p_photo_url: photoUrl || null, p_gps_lat: gpsLat ?? null, p_gps_lng: gpsLng ?? null, p_gps_accuracy: gpsAccuracy ?? null,
  });
  return { data, error: error?.message || null };
}

// รูปถ่ายยืนยันตอนแจ้งขอลา — ถ่ายสดจากกล้อง (ไม่ใช่อัปโหลดจากคลังภาพ) เก็บในบัคเก็ต
// "leave-attachments" แยกจาก student-photos เพราะเป็นรูปคู่ผู้ปกครอง ไม่ใช่รูปโปรไฟล์
// เดี่ยวๆ ของนักเรียน — ตั้งชื่อไฟล์กันชนกันด้วย timestamp (นักเรียนแจ้งลาได้หลายครั้ง)
async function uploadLeaveAttachment(studentId, file, { ext = 'jpg', contentType = 'image/jpeg' } = {}) {
  const path = `${studentId}/${Date.now()}.${ext}`;
  const { error: upErr } = await _sb.storage.from('leave-attachments').upload(path, file, { contentType });
  if (upErr) return { url: null, error: upErr.message };
  const { data } = _sb.storage.from('leave-attachments').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

async function getStudentLeaveRequests(studentCode) {
  const { data, error } = await _sb.rpc('get_student_leave_requests', { p_student_code: studentCode });
  return { data, error: error?.message || null };
}

// คะแนนย่อยรายหน่วยของวิชาหนึ่ง — ใช้แสดงใน popup รายละเอียดวิชา
async function getStudentSubjectUnits(studentCode, subjectId) {
  const { data, error } = await _sb.rpc('get_student_subject_units', { p_student_code: studentCode, p_subject_id: subjectId });
  return { data, error: error?.message || null };
}

// สอบกลาง/ปลายภาค, เวลาเรียน, การประเมินอ่าน/คุณลักษณะ — เติมใน popup รายละเอียดวิชา
async function getStudentSubjectDetail(studentCode, subjectId) {
  const { data, error } = await _sb.rpc('get_student_subject_detail', { p_student_code: studentCode, p_subject_id: subjectId });
  return { data: data?.[0] || null, error: error?.message || null };
}

// Web Push — บันทึก/ลบ subscription ของอุปกรณ์นี้ ใช้เตือนสตรีคใกล้ขาด
async function savePushSubscription(studentCode, endpoint, p256dh, authKey) {
  const { error } = await _sb.rpc('save_push_subscription', {
    p_student_code: studentCode, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: authKey,
  });
  return { error: error?.message || null };
}

async function removePushSubscription(endpoint) {
  const { error } = await _sb.rpc('remove_push_subscription', { p_endpoint: endpoint });
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// Students (staff-facing: search/list uses real students table, requires staff session)
// ──────────────────────────────────────────────

async function getStudents({ search = '', limit = 20, offset = 0, gradeLevel = '', room = '' } = {}) {
  let q = _sb.from('students')
    .select('id, student_code, student_name, prefix, grade_level, room, photo_url, last_seen_at', { count: 'exact' })
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

// นักเรียนเปลี่ยนรูปโปรไฟล์ของตัวเอง — เหมือน uploadStudentPhoto/removeStudentPhoto ด้านบน
// ทุกอย่าง ต่างกันแค่ต้องอัปเดต photo_url ผ่าน RPC set_student_own_photo แทนการ update ตาราง
// ตรงๆ เพราะนักเรียนเป็น anon (ไม่มี Supabase Auth session) ถูก RLS ของตาราง students บล็อก
async function uploadStudentOwnPhoto(studentId, file, { ext = 'jpg', contentType = 'image/jpeg' } = {}) {
  const path = `${studentId}.${ext}`;
  const { error: upErr } = await _sb.storage.from('student-photos').upload(path, file, {
    upsert: true, contentType,
  });
  if (upErr) return { url: null, error: upErr.message };

  const { data } = _sb.storage.from('student-photos').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const { error: rpcErr } = await _sb.rpc('set_student_own_photo', { p_student_id: studentId, p_photo_url: url });
  if (rpcErr) return { url: null, error: rpcErr.message };
  return { url, error: null };
}

async function removeStudentOwnPhoto(studentId, photoUrl) {
  const path = photoUrl?.split('/student-photos/')[1]?.split('?')[0];
  if (path) await _sb.storage.from('student-photos').remove([path]);
  const { error } = await _sb.rpc('set_student_own_photo', { p_student_id: studentId, p_photo_url: null });
  return { error: error?.message || null };
}

// ครูอัปโหลดรูปโปรไฟล์ตัวเอง — profiles.photo_url ถูก RLS จำกัดไว้แล้วว่าแก้ได้แค่แถวตัวเอง
// (id = auth.uid()) เลย staffId ที่ส่งมาจะสำเร็จก็ต่อเมื่อตรงกับผู้ใช้ที่ล็อกอินอยู่เท่านั้น
async function uploadStaffPhoto(staffId, file, { ext = 'jpg', contentType = 'image/jpeg' } = {}) {
  const path = `${staffId}.${ext}`;
  const { error: upErr } = await _sb.storage.from('staff-photos').upload(path, file, {
    upsert: true, contentType,
  });
  if (upErr) return { url: null, error: upErr.message };

  const { data } = _sb.storage.from('staff-photos').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const { error: updErr } = await _sb.from('profiles').update({ photo_url: url }).eq('id', staffId);
  if (updErr) return { url: null, error: updErr.message };
  return { url, error: null };
}

async function removeStaffPhoto(staffId, photoUrl) {
  const path = photoUrl?.split('/staff-photos/')[1]?.split('?')[0];
  if (path) await _sb.storage.from('staff-photos').remove([path]);
  const { error } = await _sb.from('profiles').update({ photo_url: null }).eq('id', staffId);
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// School logo (Storage bucket "school-assets", public read, staff-only
// write) — URL kept in app_settings.school_logo_url; falls back to the
// 🌿 emoji everywhere in the UI when not set — see schema.sql §17
// ──────────────────────────────────────────────

async function uploadSchoolLogo(file, { ext = 'webp', contentType = 'image/webp' } = {}) {
  const path = `school-logo.${ext}`;
  const { error: upErr } = await _sb.storage.from('school-assets').upload(path, file, {
    upsert: true, contentType,
  });
  if (upErr) return { url: null, error: upErr.message };

  const { data } = _sb.storage.from('school-assets').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const { error: updErr } = await _sb.from('app_settings').update({ value: url }).eq('key', 'school_logo_url');
  if (updErr) return { url: null, error: updErr.message };
  return { url, error: null };
}

async function removeSchoolLogo(logoUrl) {
  const path = logoUrl?.split('/school-assets/')[1]?.split('?')[0];
  if (path) await _sb.storage.from('school-assets').remove([path]);
  const { error } = await _sb.from('app_settings').update({ value: null }).eq('key', 'school_logo_url');
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// พื้นหลังฉากฟาร์ม หน้า "เลเวลของฉัน" — เก็บแบบเดียวกับโลโก้โรงเรียนด้านบน (บัคเก็ต
// "school-assets" เดิม, URL เก็บใน app_settings.level_farm_bg_url) ถ้ายังไม่ได้
// อัปโหลด แอปจะ fallback ไปใช้ images/level-farm-bg.webp ที่ฝังมากับแอปแทน
// ──────────────────────────────────────────────

async function uploadLevelFarmBg(file, { ext = 'webp', contentType = 'image/webp' } = {}) {
  const path = `level-farm-bg.${ext}`;
  const { error: upErr } = await _sb.storage.from('school-assets').upload(path, file, {
    upsert: true, contentType,
  });
  if (upErr) return { url: null, error: upErr.message };

  const { data } = _sb.storage.from('school-assets').getPublicUrl(path);
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const { error: updErr } = await _sb.from('app_settings').update({ value: url }).eq('key', 'level_farm_bg_url');
  if (updErr) return { url: null, error: updErr.message };
  return { url, error: null };
}

async function removeLevelFarmBg(bgUrl) {
  const path = bgUrl?.split('/school-assets/')[1]?.split('?')[0];
  if (path) await _sb.storage.from('school-assets').remove([path]);
  const { error } = await _sb.from('app_settings').update({ value: null }).eq('key', 'level_farm_bg_url');
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

// ──────────────────────────────────────────────
// Point codes — ครูสร้างโค้ดให้ทั้งห้องสแกนพร้อมกัน (requires real Supabase Auth session)
// ──────────────────────────────────────────────

async function createPointCode({ deedTypeId, points, gradeLevel = null, room = null, durationSeconds = 600 }) {
  const { data, error } = await _sb.rpc('create_point_code', {
    p_deed_type_id: deedTypeId, p_points: points,
    p_grade_level: gradeLevel, p_room: room, p_duration_seconds: durationSeconds,
  });
  return { data, error: error?.message || null };
}

async function cancelPointCode(id) {
  const { error } = await _sb.rpc('cancel_point_code', { p_id: id });
  return { error: error?.message || null };
}

// นักเรียนพลิก QR Code ประจำตัวเป็นกล้อง แล้วสแกนโค้ดของครู — ไม่มี Supabase Auth session
// จึงเรียก RPC (anon-callable) เหมือน redeem_reward/submit_reward_suggestion
async function redeemPointCode(studentCode, code) {
  const { data, error } = await _sb.rpc('redeem_point_code', { p_student_code: studentCode, p_code: code });
  return { data: data?.[0] || null, error: error?.message || null };
}

// Admin: ประวัติโค้ดที่ครูสร้างทั้งหมด — ใครสร้าง, ขอบเขต, มีคนสแกนไปแล้วกี่คน
async function getPointCodeHistory({ limit = 30 } = {}) {
  const { data, error } = await _sb
    .from('point_codes')
    .select('id, code, points, grade_level, room, expires_at, created_at, good_deed_types(icon, name), profiles(full_name), point_code_redemptions(count)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data, error: error?.message || null };
}

// ──────────────────────────────────────────────
// Call for deeds — ครูเรียกหานักเรียนมาช่วยทำความดี (คล้ายเรียกไรเดอร์ส่งอาหาร)
// Foreground-only: ใช้ Supabase Realtime (postgres_changes) — ดู schema.sql §24
// ──────────────────────────────────────────────

async function createDeedCall({ deedTypeId, message, gradeLevel = null, room = null, slots = 1, minutes = 15 }) {
  const { data, error } = await _sb.rpc('create_deed_call', {
    p_deed_type_id: deedTypeId, p_message: message,
    p_grade_level: gradeLevel, p_room: room, p_slots: slots, p_minutes: minutes,
  });
  return { data, error: error?.message || null };
}

async function cancelDeedCall(id) {
  const { error } = await _sb.rpc('cancel_deed_call', { p_id: id });
  return { error: error?.message || null };
}

// นักเรียนกดรับงานเรียก — ไม่มี Supabase Auth session จึงเรียก RPC (anon-callable)
async function respondToDeedCall(callId, studentCode) {
  const { data, error } = await _sb.rpc('respond_to_deed_call', { p_call_id: callId, p_student_code: studentCode });
  return { data: data?.[0] || null, error: error?.message || null };
}

// นักเรียนดึงงานเรียกที่ยังเปิดอยู่และตรงขอบเขตของตัวเอง — ใช้ตอนเปิดแอปครั้งแรก
// ก่อนที่ Realtime subscription จะเริ่มรับ event ใหม่ๆ (กันพลาดงานที่เรียกไปก่อนหน้านี้)
async function getActiveDeedCalls(studentCode) {
  const { data, error } = await _sb.rpc('get_active_deed_calls', { p_student_code: studentCode });
  return { data: data || [], error: error?.message || null };
}

// ครูดูรายชื่อนักเรียนที่รับงานเรียกนี้ไปแล้ว (ใช้ตอนโหลดครั้งแรก — หลังจากนั้น Realtime จะอัปเดตต่อเอง)
async function getDeedCallResponses(callId) {
  const { data, error } = await _sb
    .from('deed_call_responses')
    .select('id, student_name, responded_at')
    .eq('call_id', callId)
    .order('responded_at', { ascending: true });
  return { data: data || [], error: error?.message || null };
}

// สมัครรับฟัง Realtime: งานเรียกใหม่ที่ INSERT เข้ามา (ฝั่งนักเรียน) — คืนค่า channel ไว้ unsubscribe ทีหลัง
function subscribeToDeedCalls(onInsert) {
  return _sb
    .channel('deed_calls_feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deed_calls' }, (payload) => onInsert(payload.new))
    .subscribe();
}

// สมัครรับฟัง Realtime: คนรับงานใหม่สำหรับงานเรียกที่ระบุ (ฝั่งครู) — คืนค่า channel ไว้ unsubscribe ทีหลัง
function subscribeToDeedCallResponses(callId, onInsert) {
  return _sb
    .channel(`deed_call_responses_${callId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deed_call_responses', filter: `call_id=eq.${callId}` }, (payload) => onInsert(payload.new))
    .subscribe();
}

function unsubscribeChannel(channel) {
  if (channel) _sb.removeChannel(channel);
}

async function getPointLogs({ limit = 20, teacherId = null, since = null } = {}) {
  let query = _sb
    .from('point_logs')
    .select('id, points, note, created_at, teacher_id, cancelled_at, students(student_name, prefix, grade_level, room), good_deed_types(name, icon), profiles:profiles!point_logs_teacher_id_fkey(full_name), canceller:profiles!point_logs_cancelled_by_fkey(full_name)')
    .order('created_at', { ascending: false });
  if (teacherId) query = query.eq('teacher_id', teacherId);
  if (since) query = query.gte('created_at', since);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  return { data, error: error?.message || null };
}

// ให้คะแนนผิดคน/ผิดจำนวน — ยกเลิกแบบเก็บประวัติไว้ (ไม่ลบทิ้งจริง) เพื่อตรวจสอบย้อนหลังได้
// RLS จำกัดไว้แค่เจ้าของรายการ (ครูที่ให้คะแนน) หรือ Admin เท่านั้นที่ยกเลิกได้
async function cancelPointLog(id, cancelledBy) {
  const { error } = await _sb.from('point_logs')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy })
    .eq('id', id);
  return { error: error?.message || null };
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

// student-facing แลกรางวัล screen — active only
async function getRewards() {
  const { data, error } = await _sb.from('rewards').select('*').eq('active', true).order('points_required');
  return { data, error: error?.message || null };
}

// admin management screen — sees everything, including inactive
async function getAllRewards() {
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
// Reward pickup — staff-facing log of every redemption + whether the
// physical item has actually been handed over yet (separate from the
// instant auto-approval that happens when a student redeems in-app)
// ──────────────────────────────────────────────

async function getRewardRequests() {
  const { data, error } = await _sb
    .from('reward_requests')
    .select('id, points_used, status, created_at, collected_at, students(student_name, prefix, grade_level, room, student_code), rewards(name, icon), profiles(full_name)')
    .order('created_at', { ascending: false });
  return { data, error: error?.message || null };
}

async function markRewardCollected(requestId) {
  const session = await getCurrentSession();
  const { error } = await _sb.from('reward_requests')
    .update({ collected_at: new Date().toISOString(), collected_by: session?.user?.id || null })
    .eq('id', requestId);
  return { error: error?.message || null };
}

async function unmarkRewardCollected(requestId) {
  const { error } = await _sb.from('reward_requests')
    .update({ collected_at: null, collected_by: null })
    .eq('id', requestId);
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// Reward suggestions — students suggest what they'd like to see on the
// แลกรางวัล screen; staff read them on a dedicated screen
// ──────────────────────────────────────────────

async function submitRewardSuggestion(studentCode, message) {
  const { error } = await _sb.rpc('submit_reward_suggestion', { p_student_code: studentCode, p_message: message });
  return { error: error?.message || null };
}

async function getRewardSuggestions() {
  const { data, error } = await _sb
    .from('reward_suggestions')
    .select('id, message, created_at, read_at, students(student_name, prefix, grade_level, room, student_code), profiles(full_name)')
    .order('created_at', { ascending: false });
  return { data, error: error?.message || null };
}

async function markSuggestionRead(id) {
  const session = await getCurrentSession();
  const { error } = await _sb.from('reward_suggestions')
    .update({ read_at: new Date().toISOString(), read_by: session?.user?.id || null })
    .eq('id', id);
  return { error: error?.message || null };
}

async function unmarkSuggestionRead(id) {
  const { error } = await _sb.from('reward_suggestions')
    .update({ read_at: null, read_by: null })
    .eq('id', id);
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
      schoolLogoUrl: settings.school_logo_url || null,
      levelFarmBgUrl: settings.level_farm_bg_url || null,
      schoolName: settings.school_name || 'ตาเบาวิทยา',
      schoolTagline: settings.school_tagline || 'ระบบสะสมคะแนนความดีนักเรียน',
      streakReminderHour: Number.isNaN(parseInt(settings.streak_reminder_hour)) ? 19 : parseInt(settings.streak_reminder_hour),
      streakReminderMinDays: Number.isNaN(parseInt(settings.streak_reminder_min_days)) ? 2 : parseInt(settings.streak_reminder_min_days),
      gradesEnabled: settings.grades_enabled !== 'false',
      leaveEnabled: settings.leave_enabled !== 'false',
    },
    error: null,
  };
}

async function updateAppSetting(key, value) {
  const { error } = await _sb.from('app_settings').update({ value: String(value) }).eq('key', key);
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// Points reset (Admin only — เริ่มปีการศึกษาใหม่ / ลบถาวร)
// ──────────────────────────────────────────────

async function resetAllPointsNewYear(periodLabel) {
  const { error } = await _sb.rpc('reset_all_points_new_year', { p_period_label: periodLabel });
  return { error: error?.message || null };
}

async function deleteStudentPoints(studentId) {
  const { error } = await _sb.rpc('delete_student_points', { p_student_id: studentId });
  return { error: error?.message || null };
}

async function wipeAllPointsPermanently() {
  const { error } = await _sb.rpc('wipe_all_points_permanently');
  return { error: error?.message || null };
}

async function getPointPeriods() {
  const { data, error } = await _sb.rpc('get_point_periods');
  return { data, error: error?.message || null };
}

async function getArchivedPeriodReport(periodLabel) {
  const { data, error } = await _sb.rpc('get_archived_period_report', { p_period_label: periodLabel });
  return { data, error: error?.message || null };
}

async function touchStudentLastSeen(studentId) {
  const { error } = await _sb.rpc('touch_student_last_seen', { p_student_id: studentId });
  return { error: error?.message || null };
}

// ──────────────────────────────────────────────
// ขอทำดี — นักเรียนแจ้งขอคะแนนเอง / ครูตรวจสอบและให้คะแนน
// ──────────────────────────────────────────────

async function uploadDeedRequestPhoto(studentId, file, { ext = 'jpg', contentType = 'image/jpeg' } = {}) {
  const path = `${studentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await _sb.storage.from('deed-request-photos').upload(path, file, { contentType });
  if (upErr) return { url: null, error: upErr.message };
  const { data } = _sb.storage.from('deed-request-photos').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

async function submitDeedRequest(studentCode, deedTypeId, description, photoUrl1, photoUrl2) {
  const { error } = await _sb.rpc('submit_deed_request', {
    p_student_code: studentCode, p_deed_type_id: deedTypeId, p_description: description,
    p_photo_url_1: photoUrl1, p_photo_url_2: photoUrl2,
  });
  return { error: error?.message || null };
}

async function getStudentDeedRequests(studentCode) {
  const { data, error } = await _sb.rpc('get_student_deed_requests', { p_student_code: studentCode });
  return { data, error: error?.message || null };
}

async function getPendingDeedRequests() {
  const { data, error } = await _sb.rpc('get_pending_deed_requests');
  return { data, error: error?.message || null };
}

async function reviewDeedRequest(requestId, action, points, note) {
  const { error } = await _sb.rpc('review_deed_request', {
    p_request_id: requestId, p_action: action, p_points: points ?? null, p_note: note || null,
  });
  return { error: error?.message || null };
}

async function setOwnHomeroom(staffId, gradeLevel, room) {
  const { error } = await _sb.from('profiles')
    .update({ homeroom_grade_level: gradeLevel || null, homeroom_room: room || null })
    .eq('id', staffId);
  return { error: error?.message || null };
}
