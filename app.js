/* =============================================
   ตาเบาวิทยา — Main App Logic (Real Supabase Backend)
   นักเรียน: เข้าด้วยรหัสนักเรียนอย่างเดียว (ไม่มีรหัสผ่าน)
   ครู/แอดมิน: เข้าด้วยอีเมล+รหัสผ่านจริงผ่าน Supabase Auth
   ============================================= */
'use strict';

// ── State ──
const state = {
  screen: 'login',
  authView: 'student', // 'student' | 'staff' — which login tab is active
  role: null,         // 'student' | 'teacher' | 'admin'
  previewAsTeacher: false, // Admin-only: preview the teacher nav/screens without a separate login
  drawerOpen: false,
  toast: null,
  _toastTimer: null,
  loading: false,
  authError: '',

  student: null,          // { student_id, student_code, student_name, prefix, grade_level, room, total_points, badge_level, rank, redeem_count, total_deeds }
  studentHistory: [],
  studentRedemptions: [],
  leaderboard: null,
  leaderboardScope: 'school', // 'school' | 'grade' | 'room'

  staffUser: null,        // { id, full_name, role, is_admin }

  deedTypes: [],
  rewards: [],
  rewardRequests: [],
  rewardSuggestions: [],
  students: [],
  studentsCount: 0,
  studentSearch: '',
  studentGradeFilter: '',
  studentRoomFilter: '',
  studentClasses: [],
  pointLogs: [],
  reportSummary: null,
  reportError: null,
  reportLeaderboard: null,
  reportGradeFilter: '',
  badgeTiers: [],
  settings: { leaderboardEnabled: true, leaderboardTopN: 10, schoolLogoUrl: null, schoolName: 'ตาเบาวิทยา', schoolTagline: 'ระบบสะสมคะแนนความดีนักเรียน' },
  rolePermissions: { 'admin-deedtypes': true, 'admin-rewards': true, 'admin-reward-pickup': true, 'admin-suggestions': true, 'admin-reports': true },

  scanStep: 0,
  scanStudentCode: '',
  scanStudent: null,
  selectedDeedId: null,
  points: 10,
  addStudentCode: '',
  addStudentName: '',
  studentScanMode: false, // นักเรียนพลิก QR Code ประจำตัวเป็นกล้อง (double-tap) เพื่อสแกนโค้ดรับคะแนนจากครู

  pointCode: null,       // { id, code, icon, name, points, scopeLabel, expiresAt, totalMs } — active generated code
  codeDurationMin: 10,
  codeGradeFilter: '',
  codeRoomFilter: '',
  codeHistory: [],       // Admin: ประวัติโค้ดที่ครูสร้างทั้งหมด (admin-codehistory)
  teacherRecentLogs: [], // เฉพาะของครูคนที่ login อยู่ (เดือนนี้) — ใช้คำนวณสถิติ+กิจกรรมล่าสุดที่หน้าหลักครู
};

// ── Screen titles ──
const TITLES = {
  'student-dashboard': 'หน้าหลัก',
  'student-history':   'ประวัติความดี',
  'student-badges':    'Badge ของฉัน',
  'student-leaderboard': 'อันดับนักเรียน',
  'student-rewards':   'แลกรางวัล',
  'student-profile':   'โปรไฟล์',
  'teacher-dashboard': 'หน้าหลักครู',
  'teacher-scan':      'สแกน QR Code',
  'teacher-addpoints': 'เพิ่มคะแนน',
  'teacher-history':   'ประวัติการให้คะแนน',
  'teacher-createcode': 'สร้างโค้ดรับคะแนน',
  'teacher-codedisplay': 'โค้ดรับคะแนน',
  'admin-dashboard':   'Admin Dashboard',
  'admin-students':    'จัดการนักเรียน',
  'admin-deedtypes':   'ประเภทความดี',
  'admin-rewards':     'จัดการรางวัล',
  'admin-reward-pickup': 'รับของรางวัล',
  'admin-suggestions': 'ข้อเสนอแนะ',
  'admin-reports':     'รายงาน',
  'admin-badges':      'จัดการ Badge',
  'admin-settings':    'ตั้งค่าระบบ',
  'admin-codehistory': 'ประวัติการสร้างโค้ด',
};

const NAV = {
  student: [
    { id: 'student-dashboard',   icon: '🏠', label: 'หน้าหลัก' },
    { id: 'student-history',     icon: '📋', label: 'ประวัติ' },
    { id: 'student-badges',      icon: '🏆', label: 'Badge' },
    { id: 'student-leaderboard', icon: '🥇', label: 'อันดับ' },
    { id: 'student-rewards',     icon: '🎁', label: 'รางวัล' },
  ],
  teacher: [
    { id: 'teacher-dashboard',  icon: '🏠', label: 'หน้าหลัก' },
    { id: 'teacher-scan',       icon: '📷', label: 'สแกน QR' },
    { id: 'teacher-addpoints',  icon: '✏️', label: 'เพิ่มคะแนน' },
    { id: 'teacher-history',    icon: '📋', label: 'ประวัติ' },
    { id: 'admin-students',    icon: '👩‍🎓', label: 'นักเรียน' },
    { id: 'admin-deedtypes',   icon: '💚', label: 'ความดี' },
    { id: 'admin-rewards',     icon: '🎁', label: 'รางวัล' },
    { id: 'admin-reward-pickup', icon: '📦', label: 'รับของรางวัล' },
    { id: 'admin-suggestions', icon: '💭', label: 'ข้อเสนอแนะ' },
    { id: 'admin-reports',     icon: '📈', label: 'รายงาน' },
    // Badge/ตั้งค่า are Admin-only — never shown to teachers, permission or not.
  ],
  admin: [
    { id: 'admin-dashboard',  icon: '📊', label: 'Dashboard' },
    { id: 'teacher-scan',     icon: '📷', label: 'สแกน QR' },
    { id: 'teacher-addpoints', icon: '✏️', label: 'เพิ่มคะแนน' },
    { id: 'teacher-history',  icon: '📋', label: 'ประวัติให้คะแนน' },
    { id: 'admin-students',   icon: '👩‍🎓', label: 'นักเรียน' },
    { id: 'admin-deedtypes',  icon: '💚', label: 'ความดี' },
    { id: 'admin-rewards',    icon: '🎁', label: 'รางวัล' },
    { id: 'admin-reward-pickup', icon: '📦', label: 'รับของรางวัล' },
    { id: 'admin-suggestions', icon: '💭', label: 'ข้อเสนอแนะ' },
    { id: 'admin-reports',    icon: '📈', label: 'รายงาน' },
    { id: 'admin-badges',     icon: '🏅', label: 'Badge' },
    { id: 'admin-codehistory', icon: '🎯', label: 'ประวัติโค้ด' },
    { id: 'admin-settings',   icon: '⚙️', label: 'ตั้งค่า' },
  ],
};

// Screens an Admin can individually enable/disable for teachers (state.rolePermissions).
// Anything not listed here is always visible to teachers (or Admin-only, like Badge/ตั้งค่า).
const TEACHER_CONFIGURABLE_SCREENS = ['admin-deedtypes', 'admin-rewards', 'admin-reward-pickup', 'admin-suggestions', 'admin-reports'];

// Admin's real session/permissions never change during preview — this only
// swaps which nav items and screen labels get shown.
function effectiveRole() {
  return (state.role === 'admin' && state.previewAsTeacher) ? 'teacher' : state.role;
}

function navItemsForRole(role) {
  const items = NAV[role] || [];
  if (role !== 'teacher') return items;
  return items.filter(it => {
    if (!TEACHER_CONFIGURABLE_SCREENS.includes(it.id)) return true;
    return state.rolePermissions[it.id] !== false;
  });
}

// ── Badge tiers — Admin-configurable, fetched from public.badge_tiers ──
// Falls back to a single default tier if not loaded yet (e.g. before first fetch).
function getBadge(pts) {
  const tiers = (state.badgeTiers && state.badgeTiers.length)
    ? [...state.badgeTiers].sort((a, b) => a.min_points - b.min_points)
    : [{ icon: '🌿', name: 'ผู้เริ่มต้น', min_points: 0, color: '#6b7280' }];

  let current = tiers[0];
  let next = null;
  for (const tier of tiers) {
    if (tier.min_points <= pts) current = tier;
    else { next = tier; break; }
  }
  return {
    label: current.name, color: current.color, icon: current.icon, minPts: current.min_points,
    nextLabel: next ? next.name : null, nextPts: next ? next.min_points : null,
  };
}

// student_name already includes the prefix (เด็กชาย/เด็กหญิง/นาย/...) baked in
// from the source data — don't prepend s.prefix again or it doubles up.
function fullName(s) { return (s.student_name || '').replace(/\s+/g, ' ').trim(); }
// room "0" หมายถึงชั้นนั้นมีห้องเดียว (ไม่ได้แบ่งห้อง) — ไม่ต้องโชว์ "/0"
function classOf(s) {
  const grade = s.grade_level || '';
  const room = s.room;
  return (!room || room === '0') ? `ม.${grade}` : `ม.${grade}/${room}`;
}

// เดาเพศจากคำนำหน้าชื่อที่ baked ไว้ใน student_name (เด็กชาย/นาย = ชาย, ที่เหลือ = หญิง)
// เพื่อเลือกอวตาร emoji เริ่มต้นให้ตรงเพศเวลายังไม่มีรูปโปรไฟล์จริง
function studentGenderIcon(s) {
  const name = (s?.student_name || '').trim();
  return /^(เด็กชาย|นาย)/.test(name) ? '👦' : '👧';
}

// รูปโปรไฟล์นักเรียน — แสดงรูปจริงถ้ามี (เก็บใน Supabase Storage) ไม่งั้นแสดง emoji ตามเพศแทน
function studentAvatar(s, { size = 60, fontSize = 26, bg = 'rgba(255,255,255,0.18)', border = '2.5px solid rgba(255,255,255,0.45)', margin = '', shadow = '' } = {}) {
  const common = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;border:${border};${margin ? `margin:${margin};` : ''}${shadow ? `box-shadow:${shadow};` : ''}`;
  if (s?.photo_url) {
    return `<img src="${s.photo_url}" alt="" style="${common}object-fit:cover;display:block;">`;
  }
  return `<div style="${common}background:${bg};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;">${studentGenderIcon(s)}</div>`;
}

// โลโก้โรงเรียน — แสดงรูปที่แอดมินอัปโหลดไว้ (หน้าตั้งค่า) ถ้ามี ไม่งั้น fallback เป็น 🌿
function schoolLogoHTML(size) {
  const url = state.settings.schoolLogoUrl;
  if (url) return `<img src="${url}" alt="${state.settings.schoolName}" style="width:${size}px;height:${size}px;object-fit:contain;vertical-align:middle;display:inline-block;">`;
  return `<span style="font-size:${size}px;line-height:1;vertical-align:middle;">🌿</span>`;
}

function loadImageForCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ย่อ+บีบอัดรูปฝั่ง browser ก่อนอัปโหลด (ประหยัดทั้ง storage และ bandwidth ของ Supabase)
// avatar ที่ใหญ่ที่สุดในแอปแสดงแค่ 120px — ย่อเหลือ 480px ก็เผื่อจอ retina ไว้เกินพอแล้ว
function compressImageFile(file, { maxSize = 480, quality = 0.82, format = 'image/jpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('compress failed')), format, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

// ใช้ร่วมกันในฟอร์ม ประเภทความดี/รางวัล/Badge — ช่องไอคอนยังพิมพ์/วาง emoji เองได้ตามปกติ
// ปุ่มนี้แค่เพิ่มทางเลือกให้กดเลือกจากรายการในแอปได้เลยโดยไม่ต้องออกไปหาที่อื่น
const EMOJI_CHOICES = ['🌱', '🌿', '💚', '🍀', '🌳', '🌻', '☀️', '🌈', '🧹', '🤝', '🙏', '👏', '💝', '🎁', '📚', '✏️', '🖊️', '📖', '🎨', '🎮', '🧸', '🍭', '🍜', '🍎', '🧃', '🎈', '🎪', '🚸', '🏅', '🎖️', '🏆', '🥇', '👑', '⭐', '🌟', '💎', '🔥', '🚀', '🦁', '🐯'];

function emojiPickerHTML(inputId) {
  const pickerId = `${inputId}-picker`;
  return `
    <button type="button" data-action="toggle-emoji-picker" data-target="${pickerId}"
      style="margin-top:6px;padding:6px 10px;background:#f3f4f6;border:none;border-radius:8px;font-family:Kanit;font-size:12px;color:#6b7280;cursor:pointer;">😀 เลือกจากรายการ</button>
    <div id="${pickerId}" style="display:none;flex-wrap:wrap;gap:4px;margin-top:8px;padding:8px;background:#f9fafb;border-radius:8px;max-height:150px;overflow-y:auto;">
      ${EMOJI_CHOICES.map(e => `<button type="button" data-action="pick-emoji" data-target="${inputId}" style="width:34px;height:34px;font-size:18px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:0;">${e}</button>`).join('')}
    </div>`;
}

// ══════════════════════════════════════════════
// Share card — "การ์ดโซเชียล": renders the student's own stats onto a canvas
// entirely client-side (no server round-trip, no public profile link) so it
// can be saved or shared as a plain image. Colors intentionally fixed to the
// school's own green brand regardless of badge tier, for a consistent look.
// ══════════════════════════════════════════════

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function dotPatternFill(ctx, w, h) {
  const tile = document.createElement('canvas');
  const size = 28;
  tile.width = size; tile.height = size;
  const tctx = tile.getContext('2d');
  tctx.fillStyle = 'rgba(255,255,255,0.28)';
  tctx.beginPath();
  tctx.arc(size / 2, size / 2, 2.2, 0, Math.PI * 2);
  tctx.fill();
  const pattern = ctx.createPattern(tile, 'repeat');
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
}

async function drawShareCard(canvas, student, badge) {
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  try { await document.fonts.load('700 100px Kanit'); await document.fonts.load('600 100px Kanit'); } catch {}

  // background: brand green diagonal gradient + soft highlight glow + grain
  const bg = ctx.createLinearGradient(0, 0, W * 0.55, H);
  bg.addColorStop(0, '#0B3B2A');
  bg.addColorStop(0.46, '#0F6B45');
  bg.addColorStop(0.78, '#17A06B');
  bg.addColorStop(1, '#35C98A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.15, -H * 0.05, 0, W * 0.15, -H * 0.05, W * 1.1);
  glow.addColorStop(0, 'rgba(76,224,138,0.33)');
  glow.addColorStop(0.6, 'rgba(76,224,138,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  dotPatternFill(ctx, W, H);

  const pad = W * 0.073;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';

  // top row: brand (+ logo image if the school uploaded one) + tier tag
  ctx.font = '600 32px Kanit';
  ctx.textAlign = 'left';
  let brandTextX = pad;
  if (state.settings.schoolLogoUrl) {
    try {
      const logoImg = await loadImageForCanvas(state.settings.schoolLogoUrl);
      const logoSize = 40;
      ctx.drawImage(logoImg, pad, pad - 6, logoSize, logoSize);
      brandTextX = pad + logoSize + 10;
    } catch { /* CORS/network hiccup — fall back to plain text below */ }
  }
  ctx.fillText(state.settings.schoolLogoUrl && brandTextX !== pad ? state.settings.schoolName : `🌿 ${state.settings.schoolName}`, brandTextX, pad + 30);

  const tierLabel = `${badge.icon} ${student.badge_level}`;
  ctx.font = '700 28px Kanit';
  const tierW = ctx.measureText(tierLabel).width;
  const tierPadX = 26, tierH = 52;
  const tierX = W - pad - tierW - tierPadX * 2;
  const tierY = pad - 8;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundedRectPath(ctx, tierX, tierY, tierW + tierPadX * 2, tierH, tierH / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, tierX, tierY, tierW + tierPadX * 2, tierH, tierH / 2);
  ctx.stroke();
  ctx.fillStyle = '#F4FBF3';
  ctx.fillText(tierLabel, tierX + tierPadX, tierY + tierH / 2 + 10);

  // halo + badge icon
  const haloCx = W / 2, haloCy = H * 0.35, haloR = W * 0.18;
  const halo = ctx.createRadialGradient(haloCx, haloCy, 0, haloCx, haloCy, haloR);
  halo.addColorStop(0, 'rgba(255,255,255,0.22)');
  halo.addColorStop(0.6, 'rgba(255,255,255,0.05)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(haloCx, haloCy, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(haloCx, haloCy, haloR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `${Math.round(haloR * 1.05)}px Kanit`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(badge.icon, haloCx, haloCy + haloR * 0.35);

  // student name — the headline of the card, right below the badge
  const name = fullName(student);
  const nameMaxWidth = W - pad * 2 - 40;
  let nameSize = 62;
  ctx.font = `700 ${nameSize}px Kanit`;
  while (ctx.measureText(name).width > nameMaxWidth && nameSize > 34) {
    nameSize -= 2;
    ctx.font = `700 ${nameSize}px Kanit`;
  }
  const nameY = haloCy + haloR + 90;
  ctx.fillStyle = '#fff';
  ctx.fillText(name, W / 2, nameY);
  ctx.font = '400 26px Kanit';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(`${classOf(student)} · โรงเรียน${state.settings.schoolName}`, W / 2, nameY + 42);

  // big point total
  const pointsY = nameY + 150;
  ctx.font = '700 118px Kanit';
  ctx.fillStyle = '#fff';
  ctx.fillText(student.total_points.toLocaleString(), W / 2, pointsY);
  ctx.font = '400 30px Kanit';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('คะแนนความดีสะสม', W / 2, pointsY + 46);

  // stat chips row
  const chipY = pointsY + 100, chipH = 118, chipGap = 22, chipW = (W - pad * 2 - chipGap) / 2;
  const chips = [
    { val: `#${student.rank}`, lbl: 'อันดับโรงเรียน' },
    { val: `${student.total_deeds}`, lbl: 'ครั้งที่ทำความดี' },
  ];
  chips.forEach((c, i) => {
    const x = pad + i * (chipW + chipGap);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundedRectPath(ctx, x, chipY, chipW, chipH, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, x, chipY, chipW, chipH, 22);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '700 40px Kanit';
    ctx.fillStyle = '#fff';
    ctx.fillText(c.val, x + chipW / 2, chipY + 54);
    ctx.font = '400 22px Kanit';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(c.lbl, x + chipW / 2, chipY + 88);
  });

  // bottom footer — slim, no name repeated here since it's already the headline above
  const barY = H - pad - 90, barH = 90;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundedRectPath(ctx, pad, barY, W - pad * 2, barH, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  roundedRectPath(ctx, pad, barY, W - pad * 2, barH, 24);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '600 28px Kanit';
  ctx.fillStyle = '#fff';
  ctx.fillText(`🌿 โรงเรียน${state.settings.schoolName} · จ.สุรินทร์`, W / 2, barY + barH / 2 + 10);
}

function openShareCardModal() {
  const s = state.student;
  const badge = getBadge(s.total_points);
  showModal(`
    <div class="modal-title">📤 แชร์การ์ดผลงาน</div>
    <div style="text-align:center;">
      <canvas id="share-card-canvas" style="width:100%;max-width:270px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,0.15);"></canvas>
    </div>
    <button class="btn-green" data-action="download-share-card" style="padding:13px;margin-top:16px;">💾 บันทึกรูปภาพ</button>
    <button data-action="share-share-card" style="width:100%;padding:12px;margin-top:8px;background:var(--gl);color:var(--g);border:none;border-radius:12px;font-family:Kanit;font-weight:700;cursor:pointer;">📤 แชร์ไปยังแอปอื่น</button>
    <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ปิด</button>
  `);
  const canvas = document.getElementById('share-card-canvas');
  if (canvas) drawShareCard(canvas, s, badge);
}

function shareCardFileName(student) {
  return `การ์ดผลงาน-${student.student_code}.png`;
}

// วาดข้อความแบบมี letter-spacing กึ่งกลาง — canvas ไม่มี CSS letter-spacing ให้ใช้ตรงๆ
function drawLetterSpacedText(ctx, text, cx, y, spacing) {
  const chars = [...text];
  const widths = chars.map(ch => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - totalWidth / 2;
  chars.forEach((ch, i) => { ctx.fillText(ch, x, y); x += widths[i] + spacing; });
  ctx.textAlign = prevAlign;
}

// การ์ดโค้ดรับคะแนน — ให้ครูบันทึก/แชร์/พิมพ์ส่งต่อให้นักเรียนที่ไม่ได้อยู่หน้าจอโปรเจคเตอร์
async function drawPointCodeCard(canvas, pc) {
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  try { await document.fonts.load('700 100px Kanit'); await document.fonts.load('600 100px Kanit'); } catch {}

  // background: amber/gold gradient — แยกจากการ์ดผลงาน (เขียว) ให้รู้สึกว่าเป็น "โค้ดชั่วคราว"
  const bg = ctx.createLinearGradient(0, 0, W * 0.55, H);
  bg.addColorStop(0, '#7c3a00');
  bg.addColorStop(0.46, '#b45309');
  bg.addColorStop(0.78, '#d97706');
  bg.addColorStop(1, '#f59e0b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.15, -H * 0.05, 0, W * 0.15, -H * 0.05, W * 1.1);
  glow.addColorStop(0, 'rgba(255,214,140,0.35)');
  glow.addColorStop(0.6, 'rgba(255,214,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  dotPatternFill(ctx, W, H);

  const pad = W * 0.073;
  ctx.textBaseline = 'alphabetic';

  // brand row
  ctx.font = '600 32px Kanit';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  let brandTextX = pad;
  if (state.settings.schoolLogoUrl) {
    try {
      const logoImg = await loadImageForCanvas(state.settings.schoolLogoUrl);
      const logoSize = 40;
      ctx.drawImage(logoImg, pad, pad - 6, logoSize, logoSize);
      brandTextX = pad + logoSize + 10;
    } catch { /* CORS/network hiccup — fall back to plain text below */ }
  }
  ctx.fillText(state.settings.schoolLogoUrl && brandTextX !== pad ? state.settings.schoolName : `🌿 ${state.settings.schoolName}`, brandTextX, pad + 30);

  // "โค้ดรับคะแนน" tag top-right
  const tagLabel = '🎯 โค้ดรับคะแนน';
  ctx.font = '700 28px Kanit';
  const tagW = ctx.measureText(tagLabel).width;
  const tagPadX = 26, tagH = 52;
  const tagX = W - pad - tagW - tagPadX * 2;
  const tagY = pad - 8;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundedRectPath(ctx, tagX, tagY, tagW + tagPadX * 2, tagH, tagH / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, tagX, tagY, tagW + tagPadX * 2, tagH, tagH / 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(tagLabel, tagX + tagPadX, tagY + tagH / 2 + 10);

  // deed headline + scope/points
  ctx.textAlign = 'center';
  const headline = `${pc.icon} ${pc.name}`;
  let headlineSize = 56;
  ctx.font = `700 ${headlineSize}px Kanit`;
  const headlineMaxWidth = W - pad * 2;
  while (ctx.measureText(headline).width > headlineMaxWidth && headlineSize > 34) {
    headlineSize -= 2;
    ctx.font = `700 ${headlineSize}px Kanit`;
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(headline, W / 2, pad + 170);

  ctx.font = '400 32px Kanit';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(`${pc.scopeLabel} · +${pc.points} คะแนน`, W / 2, pad + 222);

  // white QR card
  const qrSize = 620, qrPad = 34;
  const qrBoxSize = qrSize + qrPad * 2;
  const qrBoxX = (W - qrBoxSize) / 2;
  const qrBoxY = pad + 270;
  ctx.fillStyle = '#fff';
  roundedRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 32);
  ctx.fill();

  if (typeof QRCode !== 'undefined') {
    const qrCanvas = document.createElement('canvas');
    await new Promise(resolve => {
      QRCode.toCanvas(qrCanvas, JSON.stringify({ point_code: pc.code }), {
        width: qrSize, margin: 0, color: { dark: '#b45309', light: '#ffffff' },
      }, () => resolve());
    });
    ctx.drawImage(qrCanvas, qrBoxX + qrPad, qrBoxY + qrPad, qrSize, qrSize);
  }

  // big code
  const codeY = qrBoxY + qrBoxSize + 130;
  ctx.font = '700 92px Kanit';
  ctx.fillStyle = '#fff';
  drawLetterSpacedText(ctx, pc.code, W / 2, codeY, 16);

  // expiry pill
  const expiryLabel = `⏰ หมดเวลา ${formatTimeHM(pc.expiresAt)} น.`;
  ctx.font = '700 34px Kanit';
  const expW = ctx.measureText(expiryLabel).width;
  const expPadX = 30, expH = 68;
  const expX = W / 2 - (expW + expPadX * 2) / 2;
  const expY = codeY + 55;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundedRectPath(ctx, expX, expY, expW + expPadX * 2, expH, expH / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, expX, expY, expW + expPadX * 2, expH, expH / 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(expiryLabel, W / 2, expY + expH / 2 + 12);

  // footer instructions
  const barY = H - pad - 110, barH = 110;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundedRectPath(ctx, pad, barY, W - pad * 2, barH, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  roundedRectPath(ctx, pad, barY, W - pad * 2, barH, 24);
  ctx.stroke();
  const footer = 'พลิกกล้องจาก QR Code ประจำตัว แล้วสแกนโค้ดนี้เพื่อรับคะแนน';
  let footerSize = 30;
  ctx.font = `600 ${footerSize}px Kanit`;
  const footerMaxWidth = W - pad * 2 - 60;
  while (ctx.measureText(footer).width > footerMaxWidth && footerSize > 20) {
    footerSize -= 2;
    ctx.font = `600 ${footerSize}px Kanit`;
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(footer, W / 2, barY + barH / 2 + 10);
}

function openPointCodeCardModal() {
  const pc = state.pointCode;
  if (!pc) return;
  showModal(`
    <div class="modal-title">📤 การ์ดโค้ดรับคะแนน</div>
    <div style="text-align:center;">
      <canvas id="point-code-card-canvas" style="width:100%;max-width:270px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,0.15);"></canvas>
    </div>
    <button class="btn-green" data-action="download-point-code-card" style="padding:13px;margin-top:16px;background:linear-gradient(90deg,#d97706,#f59e0b);">💾 บันทึกรูปภาพ</button>
    <button data-action="share-point-code-card" style="width:100%;padding:12px;margin-top:8px;background:#fffbeb;color:#b45309;border:none;border-radius:12px;font-family:Kanit;font-weight:700;cursor:pointer;">📤 แชร์ไปยังแอปอื่น</button>
    <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ปิด</button>
  `);
  const canvas = document.getElementById('point-code-card-canvas');
  if (canvas) drawPointCodeCard(canvas, pc);
}

function pointCodeCardFileName(pc) {
  return `โค้ดรับคะแนน-${pc.code}.png`;
}

// ── setState + render ──
function setState(updates) {
  Object.assign(state, updates);
  render();
}

// ── Main render ──
function render() {
  const loggedIn = !!state.role;

  document.getElementById('login-view').style.display = loggedIn ? 'none' : '';
  document.getElementById('app-a').style.display = loggedIn ? 'block' : 'none';

  if (!loggedIn) {
    document.getElementById('drawer-overlay').style.display = 'none';
    renderLogin();
    return;
  }

  const title = TITLES[state.screen] || state.screen;
  const dRole = effectiveRole();
  const roleLabel = { student: 'นักเรียน', teacher: state.previewAsTeacher ? 'ครู (พรีวิว) ✕' : 'ครู', admin: 'Admin' }[dRole];
  const avatar = { student: studentGenderIcon(state.student), teacher: '👨‍🏫', admin: '🛡️' }[dRole];

  document.getElementById('title-a').textContent = title;
  document.getElementById('header-logo-a').innerHTML = schoolLogoHTML(22);
  const badgeEl = document.getElementById('badge-a');
  badgeEl.textContent = roleLabel;
  if (state.previewAsTeacher) {
    badgeEl.setAttribute('data-action', 'toggle-teacher-preview');
    badgeEl.style.cursor = 'pointer';
  } else {
    badgeEl.removeAttribute('data-action');
    badgeEl.style.cursor = '';
  }
  document.getElementById('avatar-a').textContent = avatar;

  renderBottomNav();
  if (state.drawerOpen) renderDrawer();
  document.getElementById('drawer-overlay').style.display = state.drawerOpen ? 'flex' : 'none';

  document.getElementById('content-a').innerHTML = renderScreen(state.screen);

  afterRender();
}

function renderLogin() {
  const box = document.querySelector('.login-box');
  box.innerHTML = `
    <div class="login-logo">
      <div class="logo-icon">${schoolLogoHTML(76)}</div>
      <h1>${state.settings.schoolName}</h1>
      <p>${state.settings.schoolTagline}</p>
    </div>
    <div class="login-tabs">
      <button class="login-tab ${state.authView === 'student' ? 'active' : ''}" data-action="show-auth" data-view="student">👩‍🎓 นักเรียน</button>
      <button class="login-tab ${state.authView === 'staff' ? 'active' : ''}" data-action="show-auth" data-view="staff">👨‍🏫 ครู</button>
    </div>
    ${state.authView === 'staff' ? staffLoginFormHTML() : studentLoginFormHTML()}
    <p class="login-note">พัฒนาระบบ : นายกิตติพงษ์ คำดี</p>
  `;
}

function studentLoginFormHTML() {
  return `
    <div class="form-group">
      <label class="form-label">รหัสนักเรียน</label>
      <input class="form-input" id="student-code-input" placeholder="เช่น 65001" autofocus
             style="font-size:18px;text-align:center;letter-spacing:1px;">
    </div>
    ${state.authError ? `<div style="color:#dc2626;font-size:13px;margin-bottom:10px;text-align:center;">${state.authError}</div>` : ''}
    <button class="btn-green" data-action="submit-student-login" style="padding:14px;" ${state.loading ? 'disabled' : ''}>
      ${state.loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
    </button>
  `;
}

function staffLoginFormHTML() {
  return `
    <div class="form-group">
      <label class="form-label">อีเมล</label>
      <input class="form-input" type="email" id="staff-email-input" placeholder="you@taobao.ac.th" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">รหัสผ่าน</label>
      <input class="form-input" type="password" id="staff-password-input" placeholder="••••••••">
    </div>
    ${state.authError ? `<div style="color:#dc2626;font-size:13px;margin-bottom:10px;text-align:center;">${state.authError}</div>` : ''}
    <button class="btn-green" data-action="submit-staff-login" style="padding:14px;" ${state.loading ? 'disabled' : ''}>
      ${state.loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
    </button>
  `;
}

// ── Bottom nav ──
// Teacher/Admin have 8 nav destinations total — too many for a mobile bottom bar,
// so only the 4 most-used stay here; the full list (including นักเรียน/ความดี/
// รางวัล/รายงาน) is always reachable from the ☰ drawer (see openDrawer()).
function visibleNavItems(role) {
  let items = navItemsForRole(role);
  if (role === 'student' && !state.settings.leaderboardEnabled) {
    items = items.filter(it => it.id !== 'student-leaderboard');
  }
  return items;
}

function bottomNavItems() {
  const role = effectiveRole();
  const items = visibleNavItems(role);
  return (role === 'teacher' || role === 'admin') ? items.slice(0, 4) : items;
}

function renderBottomNav() {
  const items = bottomNavItems();
  document.getElementById('nav-a').innerHTML = items.map(it => `
    <button class="bnav-btn ${state.screen === it.id ? 'active' : ''}" data-action="nav" data-screen="${it.id}">
      <span class="bnav-icon">${it.icon}</span>
      <span class="bnav-label">${it.label}</span>
    </button>
  `).join('');
}

// ── Drawer (full nav, slides in from the left) ──
function renderDrawer() {
  const items = visibleNavItems(effectiveRole());
  const nav = items.map(it => `
    <button class="snav-btn ${state.screen === it.id ? 'active' : ''}" data-action="drawer-nav" data-screen="${it.id}">
      <span class="snav-icon">${it.icon}</span>${it.label}
    </button>
  `).join('');

  document.getElementById('drawer-panel').innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-name">${schoolLogoHTML(20)} ${state.settings.schoolName}</div>
      <div class="sidebar-brand-sub">ระบบคะแนนความดี</div>
    </div>
    <nav class="sidebar-nav">${nav}</nav>
    <div class="sidebar-footer">
      ${state.previewAsTeacher ? `<button class="sidebar-logout" data-action="toggle-teacher-preview" style="background:#eff6ff;color:#3b82f6;">✕ ออกจากพรีวิวครู</button>` : ''}
      <button class="sidebar-logout" data-action="logout">🚪 ออกจากระบบ</button>
    </div>
  `;
}

function openDrawer() {
  state.drawerOpen = true;
  render();
}
function closeDrawer() {
  state.drawerOpen = false;
  render();
}

// ── Screen router ──
function renderScreen(screen) {
  const S = {
    'student-dashboard':   renderStudentDashboard,
    'student-history':     renderStudentHistory,
    'student-badges':      renderStudentBadges,
    'student-leaderboard': renderStudentLeaderboard,
    'student-rewards':     renderStudentRewards,
    'student-profile':     renderStudentProfile,
    'teacher-dashboard':   renderTeacherDashboard,
    'teacher-scan':        renderTeacherScan,
    'teacher-addpoints':   renderTeacherAddPoints,
    'teacher-history':     renderTeacherHistory,
    'teacher-createcode':  renderTeacherCreateCode,
    'teacher-codedisplay': renderTeacherCodeDisplay,
    'admin-dashboard':     renderAdminDashboard,
    'admin-students':      renderAdminStudents,
    'admin-deedtypes':     renderAdminDeedTypes,
    'admin-rewards':       renderAdminRewards,
    'admin-reward-pickup': renderAdminRewardPickup,
    'admin-suggestions':   renderAdminSuggestions,
    'admin-reports':       renderAdminReports,
    'admin-badges':        renderAdminBadges,
    'admin-settings':      renderAdminSettings,
    'admin-codehistory':   renderAdminCodeHistory,
  };
  return (S[screen] || (() => '<div style="text-align:center;padding:40px;color:#9ca3af;">🚧 หน้านี้กำลังพัฒนา...</div>'))();
}

// ══════════════════════════════════════════════
// STUDENT SCREENS
// ══════════════════════════════════════════════

function renderStudentDashboard() {
  const s = state.student;
  if (!s) return loadingBlock();
  const badge = getBadge(s.total_points);
  const recent = state.studentHistory.slice(0, 3);

  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div id="hero-leaf-field" aria-hidden="true"></div>
      <div style="position:relative;z-index:1;display:flex;align-items:center;gap:14px;">
        ${studentAvatar(s, { size: 62, fontSize: 28 })}
        <div>
          <div style="font-size:18px;font-weight:700;line-height:1.2;">${fullName(s)}</div>
          <div style="font-size:12px;opacity:0.8;margin-top:3px;">${classOf(s)} · รหัส ${s.student_code}</div>
          <div style="margin-top:6px;display:inline-block;background:rgba(255,255,255,0.2);border-radius:20px;padding:2px 10px;font-size:12px;">${badge.icon} ${s.badge_level}</div>
        </div>
      </div>
      <div style="position:relative;z-index:1;margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.18);display:flex;align-items:flex-end;justify-content:space-between;">
        <div>
          <div style="font-size:12px;opacity:0.75;">คะแนนสะสมทั้งหมด</div>
          <div style="font-size:44px;font-weight:700;line-height:1;margin-top:2px;" data-countup="${s.total_points}">0</div>
          <div style="font-size:13px;opacity:0.7;margin-top:2px;">คะแนน</div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:0.75;">
          <div>ทำความดีแล้ว</div>
          <div style="font-size:30px;font-weight:700;line-height:1;" data-countup="${s.total_deeds}">0</div>
          <div>ครั้ง</div>
        </div>
      </div>
    </div>

    ${renderLevelProgress(s)}

    <div class="stat-grid-3">
      ${statBox('🥇', s.rank, 'อันดับที่', '#f59e0b', '#')}
      ${statBox('🎖️', unlockedBadgeCount(s.total_points), 'Badge', '#8b5cf6')}
      ${statBox('🎁', s.redeem_count, 'แลกรางวัล', '#ef4444')}
    </div>

    <div class="card">
      <div class="qr-flip-wrap" data-action="qr-card-tap">
        ${state.studentScanMode ? `
        <div class="qr-flip-face">
          <div style="font-size:14px;font-weight:700;color:var(--gd);margin-bottom:12px;text-align:center;">📷 สแกนโค้ดรับคะแนนจากครู</div>
          <div class="qr-scan-box" style="width:100%;">
            <video id="student-scan-video" class="scan-video" autoplay playsinline muted></video>
            <canvas id="student-scan-canvas" style="display:none;"></canvas>
            <div class="qr-corner qr-tl"></div><div class="qr-corner qr-tr"></div>
            <div class="qr-corner qr-bl"></div><div class="qr-corner qr-br"></div>
          </div>
          <div style="text-align:center;margin-top:10px;font-size:11px;color:#9ca3af;">👆👆 แตะ 2 ครั้งเพื่อกลับไปที่ QR Code</div>
        </div>
        ` : `
        <div class="qr-flip-face">
          <div style="font-size:14px;font-weight:700;color:var(--gd);margin-bottom:12px;text-align:center;">📲 QR Code ประจำตัวนักเรียน</div>
          <div class="qr-display"><div class="qr-frame"><canvas id="student-qr" width="164" height="164"></canvas></div></div>
          <div style="text-align:center;margin-top:10px;font-size:12px;color:#9ca3af;">รหัส ${s.student_code} · ${classOf(s)} · ${state.settings.schoolName}</div>
          <div style="text-align:center;margin-top:8px;font-size:11px;color:#c7d2c2;">👆👆 แตะ 2 ครั้งเพื่อสแกนรับคะแนนจากครู</div>
        </div>
        `}
      </div>
    </div>

    <button data-action="open-share-card"
      style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:linear-gradient(135deg,#0F6B45,#35C98A);color:#fff;border:none;border-radius:14px;font-family:Kanit;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 4px 20px oklch(0.52 0.17 145 / 0.35);">
      <span style="font-size:20px;">📤</span> แชร์การ์ดผลงาน
    </button>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;font-size:15px;color:var(--gd);">📋 กิจกรรมล่าสุด</div>
      ${recent.length
        ? recent.map(d => listRow(d.deed_icon || '💚', d.deed_name || 'ทำความดี', `${d.teacher_name || ''} · ${formatDate(d.created_at)}`, `+${d.points} คะแนน`)).join('')
        : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
      <button data-action="nav" data-screen="student-history"
        style="width:100%;padding:12px;border:none;background:var(--gl);color:var(--g);font-family:Kanit;font-weight:700;font-size:13px;cursor:pointer;border-radius:0 0 16px 16px;">
        ดูประวัติทั้งหมด →
      </button>
    </div>
  </div>`;
}

function unlockedBadgeCount(pts) {
  const tiers = [0, 100, 500, 1000, 5000];
  return tiers.filter(t => pts >= t).length;
}

// หลอดพลังความดี — แสดงตำแหน่งเลเวลปัจจุบันเทียบกับเลเวลสูงสุด (เส้นสเกล 0..เลเวลสูงสุด
// เพื่อให้เห็นระยะทางจริง ไม่ใช่แค่ % ไปเลเวลถัดไป) ให้นักเรียนเห็นภาพรวมทั้งเส้นทาง
function renderLevelProgress(s) {
  const tiers = (state.badgeTiers && state.badgeTiers.length)
    ? [...state.badgeTiers].sort((a, b) => a.min_points - b.min_points)
    : [{ icon: '🌿', name: 'ผู้เริ่มต้น', min_points: 0, color: '#6b7280' }];
  const pts = s.total_points;
  const maxTier = tiers[tiers.length - 1];
  let currentIdx = 0;
  tiers.forEach((t, i) => { if (t.min_points <= pts) currentIdx = i; });
  const next = tiers[currentIdx + 1] || null;
  const isMax = !next;
  const pct = maxTier.min_points > 0 ? Math.min(100, (pts / maxTier.min_points) * 100) : 100;

  return `
  <div class="card">
    <div style="font-size:14px;font-weight:700;color:var(--gd);margin-bottom:16px;text-align:center;">🌱 ระดับความดีของคุณ</div>

    <div style="display:flex;justify-content:space-between;padding:0 2px;">
      ${tiers.map((t, i) => {
        const achieved = t.min_points <= pts;
        const isCurrent = i === currentIdx;
        const size = isCurrent ? 32 : 22;
        return `
        <div style="flex:1;text-align:center;font-size:${size}px;line-height:1;opacity:${achieved ? 1 : 0.35};filter:${achieved ? 'none' : 'grayscale(1)'};${isCurrent ? `filter:drop-shadow(0 0 7px ${t.color});` : ''}transition:opacity 0.3s;">${t.icon}</div>`;
      }).join('')}
    </div>

    <div style="position:relative;height:10px;background:#e5e7eb;border-radius:6px;margin:10px 2px 0;">
      <div class="level-bar-fill" data-pct="${pct}" style="position:absolute;inset:0;width:0%;background:linear-gradient(90deg,var(--gd),var(--g));border-radius:6px;transition:width 0.9s cubic-bezier(0.3,0.7,0.3,1);"></div>
      ${tiers.slice(1).map(t => {
        const tp = maxTier.min_points > 0 ? Math.min(100, (t.min_points / maxTier.min_points) * 100) : 100;
        return `<div style="position:absolute;top:-2px;left:${tp}%;width:2px;height:14px;background:#fff;border-radius:1px;transform:translateX(-1px);"></div>`;
      }).join('')}
    </div>

    <div style="text-align:center;margin-top:12px;font-size:13px;color:#374151;font-weight:700;">
      ${pts.toLocaleString()} / ${maxTier.min_points.toLocaleString()} คะแนน
    </div>
    <div style="text-align:center;margin-top:3px;font-size:12px;color:${isMax ? '#f59e0b' : '#9ca3af'};">
      ${isMax
        ? `🎉 สุดยอด! คุณถึงระดับสูงสุดแล้ว — ${maxTier.icon} ${maxTier.name}`
        : `อีก ${(next.min_points - pts).toLocaleString()} คะแนน ถึง ${next.icon} ${next.name}`}
    </div>
  </div>`;
}

function renderStudentHistory() {
  const deeds = state.studentHistory;
  const s = state.student;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;opacity:0.8;">คะแนนสะสมทั้งหมด</div>
          <div style="font-size:36px;font-weight:700;">${s.total_points.toLocaleString()}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;opacity:0.8;">ทำความดีทั้งหมด</div>
          <div style="font-size:36px;font-weight:700;">${s.total_deeds} ครั้ง</div>
        </div>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">ประวัติความดีทั้งหมด</div>
      ${deeds.length
        ? deeds.map(d => listRow(d.deed_icon || '💚', d.deed_name || 'ทำความดี', `${d.teacher_name || ''} · ${formatDate(d.created_at)}`, `+${d.points} คะแนน`)).join('')
        : `<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
    </div>
  </div>`;
}

function renderStudentBadges() {
  const s = state.student;
  const pts = s.total_points;
  const badge = getBadge(pts);
  const tiers = [...state.badgeTiers].sort((a, b) => a.min_points - b.min_points);
  const progressPct = badge.nextPts ? Math.round(((pts - badge.minPts) / (badge.nextPts - badge.minPts)) * 100) : 100;

  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        <div class="anim-pulse" style="font-size:52px;">${badge.icon}</div>
        <div style="font-size:20px;font-weight:700;margin-top:10px;">${s.badge_level}</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">${pts.toLocaleString()} คะแนน · เลเวลปัจจุบัน</div>
        <div class="progress-track" style="margin-top:14px;">
          <div class="progress-fill" style="width:${progressPct}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.7;margin-top:4px;">
          <span>${badge.minPts}</span>
          <span>${badge.nextLabel ? `อีก ${badge.nextPts - pts} → ${badge.nextLabel}` : 'ระดับสูงสุดแล้ว'}</span>
          <span>${badge.nextPts || ''}</span>
        </div>
      </div>
    </div>
    <div class="badge-grid">
      ${tiers.map((b, i) => {
        const unlocked = pts >= b.min_points;
        const next = tiers[i + 1];
        const range = next ? `${b.min_points.toLocaleString()} – ${(next.min_points - 1).toLocaleString()} คะแนน` : `${b.min_points.toLocaleString()}+ คะแนน`;
        return `
        <div class="badge-card ${unlocked ? 'unlocked' : ''}" style="${unlocked ? `border-color:${b.color}30;box-shadow:0 2px 12px ${b.color}28;` : 'opacity:0.55;'}">
          <div class="badge-card-icon" style="${unlocked ? '' : 'filter:grayscale(1);'}">${b.icon}</div>
          <div class="badge-card-name" style="color:${unlocked ? b.color : '#9ca3af'};">${b.name}</div>
          <div class="badge-card-range">${range}</div>
          <div class="badge-status ${unlocked ? 'unlocked' : ''}" style="${unlocked ? `background:${b.color}18;color:${b.color};` : ''}">
            ${unlocked ? '✓ ปลดล็อคแล้ว' : '🔒 ล็อคอยู่'}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderStudentLeaderboard() {
  if (!state.settings.leaderboardEnabled) {
    return `
    <div class="screen-wrap anim-slideup">
      <div class="card" style="text-align:center;padding:40px 20px;color:#9ca3af;">
        <div style="font-size:40px;margin-bottom:10px;">🔒</div>
        <div style="font-size:14px;">ผู้ดูแลระบบปิดการแสดงผลอันดับชั่วคราว</div>
      </div>
    </div>`;
  }

  const top = state.leaderboard;
  if (top === null) return loadingBlock();

  const scopeTabs = [
    { id: 'school', label: 'ทั้งโรงเรียน' },
    { id: 'grade',  label: 'ชั้นเดียวกัน' },
    { id: 'room',   label: 'ห้องเดียวกัน' },
  ];
  const scopeTabsHTML = `
    <div style="display:flex;gap:8px;">
      ${scopeTabs.map(t => `
        <button data-action="set-leaderboard-scope" data-scope="${t.id}"
          style="flex:1;padding:9px 6px;border-radius:10px;border:none;cursor:pointer;font-family:Kanit;font-size:12px;font-weight:${state.leaderboardScope === t.id ? 700 : 400};background:${state.leaderboardScope === t.id ? 'var(--g)' : '#fff'};color:${state.leaderboardScope === t.id ? '#fff' : '#6b7280'};box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          ${t.label}
        </button>
      `).join('')}
    </div>`;

  const noPointsYet = top.every(s => s.total_points === 0);

  if (!top.length || noPointsYet) {
    return `
    <div class="screen-wrap anim-slideup">
      <div class="hero-banner">
        <div style="text-align:center;">
          <div style="font-size:22px;font-weight:700;">🏆 อันดับนักเรียนดีเด่น</div>
          <div style="font-size:13px;opacity:0.8;margin-top:4px;">เรียงตามคะแนนสะสม</div>
        </div>
      </div>
      ${scopeTabsHTML}
      <div class="card" style="text-align:center;padding:40px 20px;color:#9ca3af;">
        <div style="font-size:40px;margin-bottom:10px;">🏁</div>
        <div style="font-size:14px;">${!top.length ? 'ยังไม่มีข้อมูลในขอบเขตนี้' : 'ยังไม่มีข้อมูลคะแนน'}</div>
        ${noPointsYet ? '<div style="font-size:12px;color:#c1c9d2;margin-top:6px;">เมื่อเริ่มมีการให้คะแนนความดี อันดับจะแสดงที่นี่</div>' : ''}
      </div>
    </div>`;
  }

  const podium = top.length >= 3 ? [top[1], top[0], top[2]] : top;
  const heights = [130, 155, 110];
  const colors  = ['#C0C0C0', '#FFD700', '#CD7F32'];
  const textClr = ['#fff', '#78350f', '#fff'];
  const rest = top.slice(3);

  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        <div style="font-size:22px;font-weight:700;">🏆 อันดับนักเรียนดีเด่น</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">เรียงตามคะแนนสะสม</div>
      </div>
    </div>

    ${scopeTabsHTML}

    ${top.length >= 3 ? `
    <div class="podium">
      ${podium.map((s, i) => `
        <div class="podium-col">
          <div style="font-size:26px;margin-bottom:4px;">${['🥈','🥇','🥉'][i]}</div>
          <div class="podium-name">${fullName(s)}</div>
          <div class="podium-bar" style="height:${heights[i]}px;background:${colors[i]};color:${textClr[i]};">
            <div class="podium-rank">${s.rank}</div>
            <div class="podium-pts">${s.total_points.toLocaleString()}</div>
          </div>
        </div>
      `).join('')}
    </div>` : ''}

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${rest.map(s => {
        const mine = state.role === 'student' && s.student_name === state.student.student_name && classOf(s) === classOf(state.student);
        return `
        <div class="list-item" style="background:${mine ? 'var(--gl)' : '#fff'};">
          <div style="width:28px;height:28px;border-radius:50%;background:${mine ? 'var(--g)' : '#e5e7eb'};color:${mine ? '#fff' : '#6b7280'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${s.rank}</div>
          <div style="flex:1;">
            <div style="font-weight:${mine ? 700 : 600};font-size:14px;color:${mine ? 'var(--gd)' : '#1f2937'};">${fullName(s)}${mine ? ' ★' : ''}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${classOf(s)}</div>
          </div>
          <div style="font-weight:700;color:var(--g);">${s.total_points.toLocaleString()}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderStudentRewards() {
  const rewards = state.rewards;
  const s = state.student;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;opacity:0.8;">คะแนนที่มี</div>
          <div style="font-size:34px;font-weight:700;">${s.total_points.toLocaleString()}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;opacity:0.8;">แลกไปแล้ว</div>
          <div style="font-size:34px;font-weight:700;">${s.redeem_count} ครั้ง</div>
        </div>
      </div>
    </div>
    <div class="reward-grid">
      ${rewards.map(r => {
        const can = s.total_points >= r.points_required && r.stock > 0;
        return `
        <div class="reward-card">
          <div class="reward-img" style="background:${can ? 'var(--gl)' : '#f3f4f6'};">${r.icon}</div>
          <div class="reward-body">
            <div class="reward-name">${r.name}</div>
            <div class="reward-stock">เหลือ ${r.stock} ชิ้น</div>
            <div class="reward-footer">
              <div class="reward-pts">${r.points_required} แต้ม</div>
              <button class="btn-redeem ${can ? 'can' : 'cant'}"
                      data-action="redeem" data-reward-id="${r.id}"
                      data-reward-name="${r.name}" data-can="${can}" ${state.loading ? 'disabled' : ''}>แลก</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div style="font-weight:700;color:var(--gd);margin-bottom:4px;">💭 อยากได้อะไรเพิ่ม?</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:12px;">เสนอรางวัลหรือของที่อยากให้มีเพิ่ม ครูจะเห็นข้อความนี้</div>
      <textarea class="form-input" id="suggestion-text" rows="3" placeholder="เช่น อยากได้เสื้อยืดโรงเรียน, บัตรของขวัญร้านสะดวกซื้อ..." style="resize:none;"></textarea>
      <button class="btn-green" data-action="submit-suggestion" style="padding:13px;margin-top:10px;">📤 ส่งข้อเสนอแนะ</button>
    </div>
  </div>`;
}

function renderStudentProfile() {
  const s = state.student;
  const badge = getBadge(s.total_points);
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        ${studentAvatar(s, { size: 80, fontSize: 36, margin: '0 auto' })}
        <div style="font-size:20px;font-weight:700;margin-top:12px;">${fullName(s)}</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">${classOf(s)} · รหัส ${s.student_code}</div>
        <div style="margin-top:8px;display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:3px 14px;font-size:12px;">${badge.icon} ${s.badge_level} · ${s.total_points.toLocaleString()} คะแนน</div>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${[
        ['👤', 'ชื่อ-สกุล', fullName(s)],
        ['🏫', 'ระดับชั้น', classOf(s)],
        ['🔢', 'รหัสนักเรียน', s.student_code],
      ].map(([icon, label, val]) => `
        <div class="list-item">
          <span style="font-size:20px;">${icon}</span>
          <div style="flex:1;">
            <div style="font-size:11px;color:#9ca3af;">${label}</div>
            <div style="font-size:14px;font-weight:600;color:#1f2937;margin-top:2px;">${val}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <button data-action="logout" style="width:100%;padding:14px;background:#fee2e2;color:#dc2626;border:none;border-radius:12px;font-family:Kanit;font-weight:700;font-size:14px;cursor:pointer;">
      🚪 ออกจากระบบ
    </button>
  </div>`;
}

// ══════════════════════════════════════════════
// TEACHER SCREENS
// ══════════════════════════════════════════════

function renderTeacherDashboard() {
  const u = state.staffUser;
  const activeLogs = state.teacherRecentLogs.filter(l => !l.cancelled_at);
  const todayCount = activeLogs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
  const monthPoints = activeLogs.reduce((sum, l) => sum + l.points, 0);
  const recent = activeLogs.slice(0, 3);
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:26px;border:2.5px solid rgba(255,255,255,0.45);flex-shrink:0;">👨‍🏫</div>
        <div>
          <div style="font-size:18px;font-weight:700;">${u?.full_name || ''}</div>
          <div style="font-size:12px;opacity:0.8;margin-top:3px;">ครู</div>
        </div>
      </div>
    </div>

    <button data-action="nav" data-screen="teacher-scan"
      style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;background:linear-gradient(90deg,var(--gd),var(--g));color:#fff;border:none;border-radius:14px;font-family:Kanit;font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 4px 20px oklch(0.52 0.17 145 / 0.4);">
      <span style="font-size:22px;">📷</span> สแกน QR Code นักเรียน
    </button>

    <button data-action="nav" data-screen="teacher-createcode"
      style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;background:linear-gradient(90deg,#d97706,#f59e0b);color:#fff;border:none;border-radius:14px;font-family:Kanit;font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 4px 20px rgba(245,158,11,0.35);">
      <span style="font-size:22px;">🎯</span> สร้างโค้ดรับคะแนน
    </button>

    <div class="stat-grid-2">
      ${statBox('📋', todayCount, 'ให้คะแนนวันนี้', 'var(--g)')}
      ${statBox('💚', monthPoints, 'คะแนนรวมเดือนนี้', '#f59e0b')}
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;font-size:14px;color:var(--gd);">⏱️ ให้คะแนนล่าสุด</div>
      ${recent.length
        ? recent.map(l => listRow(studentGenderIcon(l.students), `${fullName(l.students)} · ${classOf(l.students)}`, `${l.good_deed_types?.name || ''} · ${formatDate(l.created_at)}`, `+${l.points}`)).join('')
        : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีกิจกรรมเดือนนี้</div>`}
      <button data-action="nav" data-screen="teacher-history"
        style="width:100%;padding:12px;border:none;background:var(--gl);color:var(--g);font-family:Kanit;font-weight:700;font-size:13px;cursor:pointer;border-radius:0 0 16px 16px;">
        ดูประวัติทั้งหมด →
      </button>
    </div>
  </div>`;
}

function renderTeacherScan() {
  if (state.scanStep === 0) {
    return `
    <div class="screen-wrap anim-slideup">
      <div class="card">
        <div style="background:linear-gradient(135deg,var(--gd),var(--g));border-radius:12px;padding:16px 20px;color:#fff;text-align:center;margin-bottom:16px;">
          <div style="font-size:18px;font-weight:700;">📷 สแกน QR Code</div>
          <div style="font-size:12px;opacity:0.8;margin-top:4px;">นำกล้องไปยัง QR Code ของนักเรียน</div>
        </div>
        <div class="qr-scan-box" id="scan-box">
          <video id="qr-video" class="scan-video" autoplay playsinline muted style="display:none;"></video>
          <canvas id="scan-canvas" style="display:none;"></canvas>
          <div class="qr-corner qr-tl"></div><div class="qr-corner qr-tr"></div>
          <div class="qr-corner qr-bl"></div><div class="qr-corner qr-br"></div>
          <div id="scan-placeholder" style="color:rgba(255,255,255,0.4);text-align:center;font-size:13px;">
            <div style="font-size:36px;margin-bottom:8px;">📷</div>
            <div>กดปุ่มด้านล่างเพื่อเปิดกล้อง</div>
          </div>
        </div>
        <button class="btn-green" data-action="start-scan" style="margin-top:14px;padding:14px;">📷 เปิดกล้องสแกน QR Code</button>
        <div style="text-align:center;margin-top:10px;font-size:12px;color:#9ca3af;">หรือ</div>
        <button data-action="nav" data-screen="teacher-addpoints"
          style="width:100%;margin-top:8px;padding:12px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;border-radius:12px;font-family:Kanit;font-weight:600;font-size:13px;cursor:pointer;">
          ✏️ เพิ่มคะแนนด้วยรหัสนักเรียน
        </button>
        <button data-action="nav" data-screen="teacher-createcode"
          style="width:100%;margin-top:8px;padding:12px;background:#fffbeb;color:#b45309;border:1px solid #fde68a;border-radius:12px;font-family:Kanit;font-weight:600;font-size:13px;cursor:pointer;">
          🎯 สร้างโค้ดรับคะแนน
        </button>
      </div>
    </div>`;
  }

  // Step 1: student found
  const sc = state.scanStudent;
  if (!sc) return loadingBlock();
  const badge = getBadge(sc.total_points);
  const deedTypes = state.deedTypes;

  return `
  <div class="screen-wrap anim-slideup">
    <div class="card">
      <div style="background:var(--gl);border-radius:12px;padding:18px;display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        ${studentAvatar(sc, { size: 60, fontSize: 26, bg: 'var(--g)', border: 'none', shadow: '0 4px 14px oklch(0.52 0.17 145 / 0.4)' })}
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--gd);">${fullName(sc)}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:3px;">รหัส ${sc.student_code} · ${classOf(sc)}</div>
          <div style="font-size:12px;color:var(--g);font-weight:600;margin-top:4px;">${badge.icon} ${sc.badge_level} · ${sc.total_points} คะแนน</div>
        </div>
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:12px;">เลือกประเภทความดี</div>
      <div class="deed-grid" style="margin-bottom:16px;">
        ${deedTypes.map(d => `
          <button class="deed-chip ${state.selectedDeedId === d.id ? 'selected' : ''}" data-action="select-deed" data-deed-id="${d.id}">
            ${d.icon} ${d.name}
          </button>
        `).join('')}
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:8px;">คะแนน: <span id="pts-display">${state.points}</span> คะแนน</div>
      <input type="range" min="5" max="50" step="5" value="${state.points}" id="pts-range"
             style="background:linear-gradient(to right, var(--g) ${((state.points - 5) / 45) * 100}%, #e5e7eb ${((state.points - 5) / 45) * 100}%);">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:2px;">
        <span>5</span><span>25</span><span>50</span>
      </div>

      <button class="btn-green" data-action="save-points" style="margin-top:16px;padding:14px;opacity:${state.selectedDeedId ? 1 : 0.5};" ${state.loading ? 'disabled' : ''}>
        ${state.loading ? 'กำลังบันทึก...' : '✅ บันทึกคะแนน'}
      </button>
      <button data-action="reset-scan" style="margin-top:8px;width:100%;padding:10px;background:transparent;color:#9ca3af;border:none;font-family:Kanit;cursor:pointer;font-size:13px;">← สแกนใหม่</button>
    </div>
  </div>`;
}

function renderTeacherAddPoints() {
  const deedTypes = state.deedTypes;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--gd);margin-bottom:20px;">✏️ เพิ่มคะแนนความดี (ระบุรหัส)</div>
      <div class="form-group">
        <label class="form-label">รหัสนักเรียน *</label>
        <input class="form-input" placeholder="เช่น 65001" id="add-student-code" value="${state.addStudentCode}">
      </div>
      <div class="form-group">
        <label class="form-label">ชื่อ-สกุล (อัตโนมัติ)</label>
        <input class="form-input" id="add-student-name" readonly placeholder="ค้นหาจากรหัสนักเรียน" value="${state.addStudentName}">
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:12px;">เลือกประเภทความดี</div>
      <div class="deed-grid" style="margin-bottom:16px;">
        ${deedTypes.map(d => `
          <button class="deed-chip ${state.selectedDeedId === d.id ? 'selected' : ''}" data-action="select-deed" data-deed-id="${d.id}">
            ${d.icon} ${d.name}
          </button>
        `).join('')}
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:8px;">คะแนน: <span id="pts-display">${state.points}</span> คะแนน</div>
      <input type="range" min="1" max="20" step="1" value="${state.points}" id="pts-range"
             style="background:linear-gradient(to right, var(--g) ${((state.points - 1) / 19) * 100}%, #e5e7eb ${((state.points - 1) / 19) * 100}%);">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:2px;">
        <span>1</span><span>10</span><span>20</span>
      </div>

      <div class="form-group" style="margin-top:16px;">
        <label class="form-label">หมายเหตุ</label>
        <textarea class="form-input" rows="3" placeholder="รายละเอียดเพิ่มเติม..." id="add-note" style="resize:none;"></textarea>
      </div>
      <button class="btn-green" data-action="submit-addpoints" style="padding:14px;opacity:${state.selectedDeedId ? 1 : 0.5};" ${state.loading ? 'disabled' : ''}>
        ${state.loading ? 'กำลังบันทึก...' : '✅ บันทึกคะแนน'}
      </button>
    </div>
  </div>`;
}

// ให้คะแนนผิดคน/ผิดจำนวน — ปุ่มยกเลิกโชว์เฉพาะเจ้าของรายการหรือ Admin จริง (ไม่ใช่ตอนพรีวิวเป็นครู)
// รายการที่ยกเลิกแล้วยังคงแสดงไว้ (ขีดฆ่า + บอกว่าใครยกเลิก) เพื่อเก็บเป็นหลักฐานตรวจสอบย้อนหลัง
function pointLogRowHTML(l) {
  const cancelled = !!l.cancelled_at;
  const canCancel = !cancelled && (l.teacher_id === state.staffUser?.id || (state.role === 'admin' && !state.previewAsTeacher));
  return `
    <div class="list-item" style="align-items:flex-start;${cancelled ? 'opacity:0.55;' : ''}">
      <span style="font-size:20px;">${studentGenderIcon(l.students)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;color:#1f2937;${cancelled ? 'text-decoration:line-through;' : ''}">${fullName(l.students)} · ${classOf(l.students)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">${l.good_deed_types?.name || ''} · ${formatDate(l.created_at)} · ${l.profiles?.full_name || ''}</div>
        ${cancelled ? `<div style="font-size:11px;color:#dc2626;margin-top:3px;">🚫 ยกเลิกแล้วโดย ${l.canceller?.full_name || '-'}</div>` : ''}
      </div>
      <div style="flex-shrink:0;text-align:right;">
        <div style="font-weight:700;font-size:14px;color:${cancelled ? '#9ca3af' : 'var(--g)'};${cancelled ? 'text-decoration:line-through;' : ''}">+${l.points}</div>
        ${canCancel ? `<button data-action="cancel-point-log" data-id="${l.id}" style="margin-top:4px;padding:4px 8px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;font-family:Kanit;font-size:11px;cursor:pointer;white-space:nowrap;">ยกเลิก</button>` : ''}
      </div>
    </div>`;
}

function renderTeacherHistory() {
  const logs = state.pointLogs;
  return `
  <div class="screen-wrap anim-slideup">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">ประวัติการให้คะแนน</div>
      ${logs.length
        ? logs.map(pointLogRowHTML).join('')
        : `<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
    </div>
  </div>`;
}

// หน้าตั้งค่าโค้ดก่อนสร้าง — เลือกประเภทความดี/คะแนน/ขอบเขตห้องเรียน/เวลาหมดอายุ
function renderTeacherCreateCode() {
  const deedTypes = state.deedTypes;
  const grades = distinctGrades();
  const rooms = [...new Set(
    state.studentClasses
      .filter(c => !state.codeGradeFilter || c.grade_level === state.codeGradeFilter)
      .map(c => c.room)
  )].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  return `
  <div class="screen-wrap anim-slideup">
    <div class="card">
      <div style="background:linear-gradient(135deg,#d97706,#f59e0b);border-radius:12px;padding:16px 20px;color:#fff;text-align:center;margin-bottom:16px;">
        <div style="font-size:18px;font-weight:700;">🎯 สร้างโค้ดรับคะแนน</div>
        <div style="font-size:12px;opacity:0.85;margin-top:4px;">ให้นักเรียนสแกนรับคะแนนพร้อมกันได้ทั้งห้อง</div>
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:12px;">เลือกประเภทความดี</div>
      <div class="deed-grid" style="margin-bottom:16px;">
        ${deedTypes.map(d => `
          <button class="deed-chip ${state.selectedDeedId === d.id ? 'selected' : ''}" data-action="select-deed" data-deed-id="${d.id}">
            ${d.icon} ${d.name}
          </button>
        `).join('')}
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:8px;">คะแนน: <span id="pts-display">${state.points}</span> คะแนน</div>
      <input type="range" min="1" max="20" step="1" value="${state.points}" id="pts-range"
             style="background:linear-gradient(to right, var(--g) ${((state.points - 1) / 19) * 100}%, #e5e7eb ${((state.points - 1) / 19) * 100}%);">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:2px;">
        <span>1</span><span>10</span><span>20</span>
      </div>

      <div style="font-weight:700;color:var(--gd);margin:18px 0 10px;">ขอบเขตผู้ใช้โค้ด</div>
      <div style="display:flex;gap:10px;margin-bottom:18px;">
        <select class="form-input" id="code-grade-filter" style="flex:1;">
          <option value="">ทุกชั้น</option>
          ${grades.map(g => `<option value="${g}" ${state.codeGradeFilter === g ? 'selected' : ''}>ชั้น ${gradeLabel(g)}</option>`).join('')}
        </select>
        <select class="form-input" id="code-room-filter" style="flex:1;">
          <option value="">ทุกห้อง</option>
          ${rooms.map(r => `<option value="${r}" ${state.codeRoomFilter === r ? 'selected' : ''}>ห้อง ${r}</option>`).join('')}
        </select>
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:10px;">⏱️ เวลาที่ใช้ได้</div>
      <div class="deed-grid" style="margin-bottom:18px;">
        ${[5, 10, 15, 30].map(m => `
          <button class="deed-chip ${state.codeDurationMin === m ? 'selected' : ''}" data-action="select-code-duration" data-min="${m}">${m} นาที</button>
        `).join('')}
      </div>

      <button class="btn-green" data-action="generate-point-code" style="padding:14px;opacity:${state.selectedDeedId ? 1 : 0.5};" ${state.loading ? 'disabled' : ''}>
        ${state.loading ? 'กำลังสร้าง...' : '🎯 สร้างโค้ด'}
      </button>
    </div>
  </div>`;
}

// หน้าโชว์โค้ดขนาดใหญ่ให้นักเรียนสแกน พร้อมนับเวลาถอยหลัง — animateCodeCountdown() คุมการนับเวลาจริง
function renderTeacherCodeDisplay() {
  const pc = state.pointCode;
  if (!pc) return loadingBlock();
  return `
  <div class="screen-wrap anim-slideup">
    <div class="card" style="text-align:center;">
      <div style="font-size:15px;font-weight:700;color:var(--gd);">${pc.icon} ${pc.name}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:4px;margin-bottom:18px;">${pc.scopeLabel} · +${pc.points} คะแนน</div>

      <div class="qr-display"><div class="qr-frame"><canvas id="teacher-code-qr" width="164" height="164"></canvas></div></div>

      <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:var(--gd);margin-top:18px;">${pc.code}</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px;">ให้นักเรียนพลิกกล้องจาก QR Code ประจำตัว แล้วสแกนโค้ดนี้</div>

      <div style="margin-top:22px;display:flex;flex-direction:column;align-items:center;">
        <div id="code-countdown-ring" style="width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:conic-gradient(var(--g) 360deg, #e5e7eb 0deg);">
          <div style="width:62px;height:62px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--gd);">
            <span id="code-countdown-text">--:--</span>
          </div>
        </div>
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;">เวลาที่เหลือ</div>
        <div style="font-size:12px;color:#b45309;font-weight:700;margin-top:4px;">⏰ หมดเวลา ${formatTimeHM(pc.expiresAt)} น.</div>
      </div>

      <button data-action="open-point-code-card" style="width:100%;margin-top:22px;padding:13px;background:linear-gradient(90deg,#d97706,#f59e0b);color:#fff;border:none;border-radius:10px;font-family:Kanit;font-weight:700;font-size:14px;cursor:pointer;">📤 บันทึก/แชร์การ์ดโค้ด</button>
      <button data-action="cancel-point-code" style="width:100%;margin-top:8px;padding:12px;background:#fee2e2;color:#dc2626;border:none;border-radius:10px;font-family:Kanit;font-weight:600;cursor:pointer;">✕ ปิดโค้ดนี้</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// ADMIN SCREENS
// ══════════════════════════════════════════════

function renderAdminDashboard() {
  const r = state.reportSummary;
  if (!r) return loadingBlock();
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div>
        <div style="font-size:22px;font-weight:700;">🏫 ${state.settings.schoolName}</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">แผงควบคุมผู้ดูแลระบบ</div>
      </div>
    </div>
    <div class="stat-grid-2">
      ${statBox('👩‍🎓', r.studentCount, 'นักเรียน', 'var(--g)')}
      ${statBox('👨‍🏫', r.teacherCount, 'ครู/เจ้าหน้าที่', '#3b82f6')}
      ${statBox('💚', r.totalPoints, 'คะแนนรวม', '#8b5cf6')}
      ${statBox('📋', r.logCount, 'รายการความดี', '#f59e0b')}
    </div>
    <div class="card">
      <div style="font-weight:700;color:var(--gd);margin-bottom:12px;">⚡ จัดการด่วน</div>
      <div class="stat-grid-2">
        ${[
          { icon: '👩‍🎓', label: 'จัดการนักเรียน', screen: 'admin-students' },
          { icon: '💚',  label: 'ประเภทความดี',   screen: 'admin-deedtypes' },
          { icon: '🎁',  label: 'จัดการรางวัล',   screen: 'admin-rewards' },
          { icon: '📈',  label: 'รายงาน',           screen: 'admin-reports' },
        ].map(a => `
          <button data-action="nav" data-screen="${a.screen}"
            style="padding:14px 10px;background:var(--gl);border:none;border-radius:12px;font-family:Kanit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <span style="font-size:26px;">${a.icon}</span>
            <span style="font-size:12px;font-weight:700;color:var(--gd);">${a.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">📋 กิจกรรมล่าสุดของระบบ</div>
      ${state.pointLogs.slice(0, 4).map(l => listRow(studentGenderIcon(l.students), `${fullName(l.students)} ได้รับ ${l.points} คะแนน`, `${l.good_deed_types?.name || ''} · ${formatDate(l.created_at)}`, '')).join('')
        || `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีกิจกรรม</div>`}
    </div>
  </div>`;
}

function distinctGrades() {
  return [...new Set(state.studentClasses.map(c => c.grade_level))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
}

// grade_level เก็บในฐานข้อมูลเป็นตัวเลขล้วน (1-6) — โรงเรียนนี้เป็นมัธยม จึงเติม "ม." ตอนแสดงผล
function gradeLabel(g) { return `ม.${g}`; }

function renderAdminStudents() {
  const students = state.students;
  const grades = distinctGrades();
  const rooms = [...new Set(
    state.studentClasses
      .filter(c => !state.studentGradeFilter || c.grade_level === state.studentGradeFilter)
      .map(c => c.room)
  )].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  return `
  <div class="screen-wrap anim-slideup">
    <div style="display:flex;gap:10px;">
      <select class="form-input" id="student-grade-filter" style="flex:1;">
        <option value="">ทุกชั้น</option>
        ${grades.map(g => `<option value="${g}" ${state.studentGradeFilter === g ? 'selected' : ''}>ชั้น ${gradeLabel(g)}</option>`).join('')}
      </select>
      <select class="form-input" id="student-room-filter" style="flex:1;">
        <option value="">ทุกห้อง</option>
        ${rooms.map(r => `<option value="${r}" ${state.studentRoomFilter === r ? 'selected' : ''}>ห้อง ${r}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:10px;">
      <input class="form-input" placeholder="🔍 ค้นหานักเรียน..." id="student-search" value="${state.studentSearch}" style="flex:1;">
      <button data-action="search-students-submit"
        style="padding:10px 16px;background:var(--g);color:#fff;border:none;border-radius:10px;font-family:Kanit;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap;">
        ค้นหา
      </button>
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-size:12px;color:#9ca3af;border-bottom:1px solid #f3f4f6;">
        แสดง ${students.length} จาก ${state.studentsCount} คน
      </div>
      ${students.map(s => `
        <div class="list-item">
          <div style="position:relative;flex-shrink:0;">
            ${studentAvatar(s, { size: 40, fontSize: 18, bg: 'var(--gl)', border: 'none' })}
            <button data-action="open-student-photo" data-id="${s.id}"
              style="position:absolute;bottom:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:var(--g);color:#fff;border:2px solid #fff;font-size:10px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;">📷</button>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${fullName(s)}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">รหัส ${s.student_code} · ${classOf(s)} · ${s.total_points.toLocaleString()} คะแนน · ${s.badge_level}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function deedTypeRowHTML(t) {
  return `
    <div class="list-item">
      <span style="font-size:24px;">${t.icon}</span>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:14px;">${t.name}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${t.points_min}–${t.points_max} คะแนน</div>
        <div style="margin-top:4px;display:inline-block;font-size:11px;border-radius:20px;padding:2px 8px;background:${t.active ? '#d1fae5' : '#fee2e2'};color:${t.active ? 'var(--g)' : '#ef4444'};">
          ● ${t.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
        </div>
      </div>
      <div class="action-btns" style="flex-direction:column;">
        <button class="btn-edit" data-action="open-edit-deed" data-id="${t.id}">✏️</button>
        <button class="btn-tog" data-action="toggle-deed" data-id="${t.id}" data-name="${t.name}" data-active="${t.active}"
                style="background:${t.active ? '#fee2e2' : '#d1fae5'};color:${t.active ? '#ef4444' : 'var(--g)'};">
          ${t.active ? '🔒' : '🔓'}
        </button>
        ${t.system_key ? '' : `<button class="btn-del" data-action="del-deed" data-id="${t.id}" data-name="${t.name}">🗑️</button>`}
      </div>
    </div>`;
}

function renderAdminDeedTypes() {
  const types = state.deedTypes;
  const automatic = types.filter(t => t.system_key);
  const manual = types.filter(t => !t.system_key);

  return `
  <div class="screen-wrap anim-slideup">
    <button class="btn-green" data-action="open-add-deed" style="padding:14px;">+ เพิ่มประเภทความดีใหม่</button>

    ${automatic.length ? `
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-weight:700;color:#7c3aed;font-size:13px;">🤖 ให้คะแนนอัตโนมัติ (ระบบคำนวณให้เองทุกสัปดาห์)</div>
      ${automatic.map(deedTypeRowHTML).join('')}
    </div>` : ''}

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-weight:700;color:var(--gd);font-size:13px;">👤 ครูให้คะแนนเอง</div>
      ${manual.length ? manual.map(deedTypeRowHTML).join('') : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประเภทความดี</div>`}
    </div>
  </div>`;
}

function renderAdminRewards() {
  const rewards = state.rewards;
  return `
  <div class="screen-wrap anim-slideup">
    <button class="btn-green" data-action="open-add-reward" style="padding:14px;">+ เพิ่มรางวัลใหม่</button>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${rewards.map(r => `
        <div class="list-item">
          <span style="font-size:28px;">${r.icon}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${r.name}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${r.points_required} คะแนน · เหลือ ${r.stock} ชิ้น</div>
            <div style="margin-top:4px;display:inline-block;font-size:11px;border-radius:20px;padding:2px 8px;background:${r.active ? '#d1fae5' : '#fee2e2'};color:${r.active ? 'var(--g)' : '#ef4444'};">
              ● ${r.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </div>
          </div>
          <div class="action-btns" style="flex-direction:column;">
            <button class="btn-edit" data-action="open-edit-reward" data-id="${r.id}">✏️</button>
            <button class="btn-tog" data-action="toggle-reward" data-id="${r.id}" data-name="${r.name}" data-active="${r.active}"
                    style="background:${r.active ? '#fee2e2' : '#d1fae5'};color:${r.active ? '#ef4444' : 'var(--g)'};">
              ${r.active ? '🔒' : '🔓'}
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function rewardPickupRowHTML(r, isPending) {
  return `
    <div class="list-item">
      <span style="font-size:24px;">${r.rewards?.icon || '🎁'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${r.rewards?.name || 'รางวัล'}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${fullName(r.students)} · ${classOf(r.students)} · ${r.points_used} คะแนน</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">
          แลกเมื่อ ${formatDate(r.created_at)}${!isPending ? ` · รับของแล้ว ${formatDate(r.collected_at)}${r.profiles?.full_name ? ` โดย ${r.profiles.full_name}` : ''}` : ''}
        </div>
      </div>
      ${isPending
        ? `<button data-action="mark-reward-collected" data-id="${r.id}" style="flex-shrink:0;padding:8px 12px;background:var(--g);color:#fff;border:none;border-radius:10px;font-family:Kanit;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap;">✅ มอบของแล้ว</button>`
        : `<button data-action="unmark-reward-collected" data-id="${r.id}" style="flex-shrink:0;padding:8px 12px;background:transparent;border:1px solid #e5e7eb;border-radius:10px;color:#9ca3af;font-family:Kanit;cursor:pointer;font-size:12px;white-space:nowrap;">↩️ ยกเลิก</button>`}
    </div>`;
}

function renderAdminRewardPickup() {
  const requests = state.rewardRequests;
  const pending = requests.filter(r => !r.collected_at);
  const collected = requests.filter(r => r.collected_at);

  return `
  <div class="screen-wrap anim-slideup">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-weight:700;color:var(--gd);font-size:13px;">🕗 รอรับของ (${pending.length})</div>
      ${pending.length ? pending.map(r => rewardPickupRowHTML(r, true)).join('') : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ไม่มีรายการรอรับของ</div>`}
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-weight:700;color:var(--g);font-size:13px;">✅ รับของแล้ว (${collected.length})</div>
      ${collected.length ? collected.map(r => rewardPickupRowHTML(r, false)).join('') : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
    </div>
  </div>`;
}

function suggestionRowHTML(s, isUnread) {
  return `
    <div class="list-item" style="align-items:flex-start;">
      <span style="font-size:20px;">💭</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:13px;color:#1f2937;">${fullName(s.students)} · ${classOf(s.students)}</div>
        <div style="font-size:13px;color:#374151;margin-top:4px;line-height:1.5;">${s.message}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:6px;">
          ${formatDate(s.created_at)}${!isUnread ? ` · อ่านแล้วโดย ${s.profiles?.full_name || '-'}` : ''}
        </div>
      </div>
      ${isUnread
        ? `<button data-action="mark-suggestion-read" data-id="${s.id}" style="flex-shrink:0;padding:8px 12px;background:var(--g);color:#fff;border:none;border-radius:10px;font-family:Kanit;font-weight:700;cursor:pointer;font-size:12px;white-space:nowrap;">✅ อ่านแล้ว</button>`
        : `<button data-action="unmark-suggestion-read" data-id="${s.id}" style="flex-shrink:0;padding:8px 12px;background:transparent;border:1px solid #e5e7eb;border-radius:10px;color:#9ca3af;font-family:Kanit;cursor:pointer;font-size:12px;white-space:nowrap;">↩️ ยกเลิก</button>`}
    </div>`;
}

function renderAdminSuggestions() {
  const suggestions = state.rewardSuggestions;
  const unread = suggestions.filter(s => !s.read_at);
  const read = suggestions.filter(s => s.read_at);

  return `
  <div class="screen-wrap anim-slideup">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-weight:700;color:var(--gd);font-size:13px;">💭 ยังไม่ได้อ่าน (${unread.length})</div>
      ${unread.length ? unread.map(s => suggestionRowHTML(s, true)).join('') : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ไม่มีข้อเสนอแนะใหม่</div>`}
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-weight:700;color:var(--g);font-size:13px;">✅ อ่านแล้ว (${read.length})</div>
      ${read.length ? read.map(s => suggestionRowHTML(s, false)).join('') : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
    </div>
  </div>`;
}

function renderAdminReports() {
  if (state.reportError) {
    return `
    <div class="screen-wrap anim-slideup">
      <div class="card" style="text-align:center;padding:40px 20px;color:#9ca3af;">
        <div style="font-size:40px;margin-bottom:10px;">🔒</div>
        <div style="font-size:14px;">ไม่มีสิทธิ์เข้าถึงรายงาน — กรุณาติดต่อผู้ดูแลระบบ</div>
      </div>
    </div>`;
  }
  const r = state.reportSummary;
  if (!r) return loadingBlock();
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div>
        <div style="font-size:16px;font-weight:700;">📈 รายงานคะแนนความดี</div>
        <div style="font-size:13px;opacity:0.8;margin-top:3px;">ข้อมูลรวมทั้งหมด</div>
      </div>
    </div>
    <div class="stat-grid-2">
      ${statBox('👩‍🎓', r.studentCount, 'นักเรียนทั้งหมด', 'var(--g)')}
      ${statBox('💚', r.totalPoints, 'คะแนนรวม', '#3b82f6')}
      ${statBox('📋', r.logCount, 'รายการความดี', '#8b5cf6')}
      ${statBox('👨‍🏫', r.teacherCount, 'ครู/เจ้าหน้าที่', '#f59e0b')}
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:700;color:var(--gd);white-space:nowrap;">🏆 อันดับนักเรียน Top 10${state.reportGradeFilter ? ` · ชั้น ${gradeLabel(state.reportGradeFilter)}` : ''}</div>
        <select class="form-input" id="report-grade-filter" style="width:auto;padding:6px 10px;font-size:12px;">
          <option value="">ทุกชั้น</option>
          ${distinctGrades().map(g => `<option value="${g}" ${state.reportGradeFilter === g ? 'selected' : ''}>ชั้น ${gradeLabel(g)}</option>`).join('')}
        </select>
      </div>
      ${renderReportLeaderboardRows()}
    </div>
  </div>`;
}

function renderReportLeaderboardRows() {
  const list = state.reportLeaderboard;
  if (list === null) return `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">กำลังโหลด...</div>`;
  if (!list.length || list.every(s => s.total_points === 0)) {
    return `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีข้อมูลคะแนน</div>`;
  }
  return list.map(s => `
    <div class="list-item">
      <div style="width:28px;height:28px;border-radius:50%;background:#e5e7eb;color:#6b7280;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${s.rank}</div>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:14px;color:#1f2937;">${fullName(s)}</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${classOf(s)}</div>
      </div>
      <div style="font-weight:700;color:var(--g);">${s.total_points.toLocaleString()}</div>
    </div>`).join('');
}

function renderAdminBadges() {
  const tiers = [...state.badgeTiers].sort((a, b) => a.min_points - b.min_points);
  return `
  <div class="screen-wrap anim-slideup">
    <button class="btn-green" data-action="open-add-badge" style="padding:14px;">+ เพิ่ม Badge ใหม่</button>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${tiers.map(t => `
        <div class="list-item">
          <span style="font-size:24px;">${t.icon}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;color:${t.color};">${t.name}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">ตั้งแต่ ${t.min_points.toLocaleString()} คะแนนขึ้นไป</div>
          </div>
          <div class="action-btns">
            <button class="btn-edit" data-action="open-edit-badge" data-id="${t.id}">✏️</button>
            <button class="btn-del" data-action="del-badge" data-id="${t.id}" data-name="${t.name}">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// แถวประวัติโค้ด — ใครสร้าง, ขอบเขต, ยังใช้งานได้อยู่ไหม, มีคนสแกนไปแล้วกี่คน
function codeHistoryRowHTML(c) {
  const deed = c.good_deed_types || {};
  const creator = c.profiles?.full_name || '-';
  const scope = c.grade_level ? `ม.${c.grade_level}${c.room ? '/' + c.room : ''}` : 'ทุกชั้นเรียน';
  const expired = new Date(c.expires_at).getTime() <= Date.now();
  const redeemed = c.point_code_redemptions?.[0]?.count ?? 0;
  return `
    <div class="list-item" style="align-items:flex-start;">
      <span style="font-size:20px;">${deed.icon || '🎯'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;color:#1f2937;">
          <span style="letter-spacing:1px;">${c.code}</span>
          <span style="font-weight:400;color:#6b7280;"> · ${deed.name || '-'}</span>
        </div>
        <div style="font-size:12px;color:#374151;margin-top:3px;">สร้างโดย ${creator} · ${scope} · +${c.points} คะแนน</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:4px;">
          ${formatDate(c.created_at)} · ${expired ? '⚫ หมดอายุแล้ว' : '🟢 ใช้งานอยู่'} · 👥 รับไปแล้ว ${redeemed} คน
        </div>
      </div>
    </div>`;
}

function renderAdminCodeHistory() {
  const history = state.codeHistory;
  return `
  <div class="screen-wrap anim-slideup">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">🎯 ประวัติการสร้างโค้ดรับคะแนน</div>
      ${history.length
        ? history.map(codeHistoryRowHTML).join('')
        : `<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติการสร้างโค้ด</div>`}
    </div>
  </div>`;
}

function toggleSwitchHTML(action, key, enabled) {
  return `
    <button data-action="${action}" data-key="${key}" data-enabled="${enabled}"
      style="width:48px;height:28px;border-radius:20px;border:none;cursor:pointer;position:relative;background:${enabled ? 'var(--g)' : '#e5e7eb'};flex-shrink:0;">
      <span style="position:absolute;top:3px;left:${enabled ? '23px' : '3px'};width:22px;height:22px;border-radius:50%;background:#fff;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
    </button>`;
}

function renderAdminSettings() {
  const s = state.settings;
  const perms = state.rolePermissions;
  const permRows = [
    { key: 'admin-deedtypes', label: 'ความดี', desc: 'เพิ่ม/แก้ไข/ลบ ประเภทความดี' },
    { key: 'admin-rewards',   label: 'รางวัล', desc: 'เพิ่ม/แก้ไข/เปิด-ปิด รางวัล' },
    { key: 'admin-reward-pickup', label: 'รับของรางวัล', desc: 'ดู/ยืนยันการรับของรางวัลของนักเรียน' },
    { key: 'admin-suggestions', label: 'ข้อเสนอแนะ', desc: 'ดูข้อเสนอแนะรางวัลจากนักเรียน' },
    { key: 'admin-reports',   label: 'รายงาน', desc: 'ดูรายงานสรุปคะแนนความดี' },
  ];

  return `
  <div class="screen-wrap anim-slideup">
    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--gd);margin-bottom:6px;">🏫 ชื่อและคำอธิบายระบบ</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;">แสดงที่หน้า login, หัวแอป และเมนู</div>
      <div class="form-group">
        <label class="form-label">ชื่อระบบ / ชื่อโรงเรียน</label>
        <input class="form-input" id="school-name-input" value="${s.schoolName}" placeholder="เช่น ตาเบาวิทยา">
      </div>
      <div class="form-group">
        <label class="form-label">คำอธิบายระบบ</label>
        <input class="form-input" id="school-tagline-input" value="${s.schoolTagline}" placeholder="เช่น ระบบสะสมคะแนนความดีนักเรียน">
      </div>
    </div>

    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--gd);margin-bottom:20px;">⚙️ ตั้งค่าอันดับนักเรียน (Leaderboard)</div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid oklch(0.96 0.02 145);margin-bottom:16px;">
        <div>
          <div style="font-weight:600;font-size:14px;color:#1f2937;">แสดงอันดับให้นักเรียนเห็น</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">ปิดเพื่อซ่อนหน้าอันดับจากเมนูนักเรียนทั้งหมด</div>
        </div>
        ${toggleSwitchHTML('toggle-leaderboard-enabled', '', s.leaderboardEnabled)}
      </div>

      <div class="form-group">
        <label class="form-label">จำนวนอันดับที่แสดง (Top N)</label>
        <input class="form-input" type="number" min="3" max="100" id="top-n-input" value="${s.leaderboardTopN}">
      </div>
    </div>

    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--gd);margin-bottom:6px;">🌿 โลโก้โรงเรียน</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;">แสดงแทน 🌿 ทุกจุดในแอป (หน้า login, หัวแอป, เมนู, การ์ดแชร์ผลงาน)</div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
        <div style="width:64px;height:64px;border-radius:16px;background:var(--gl);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
          ${s.schoolLogoUrl ? `<img src="${s.schoolLogoUrl}" alt="" style="width:100%;height:100%;object-fit:contain;">` : `<span style="font-size:30px;">🌿</span>`}
        </div>
        <div style="flex:1;font-size:12px;color:#9ca3af;">${s.schoolLogoUrl ? 'กำลังใช้โลโก้ที่อัปโหลดไว้' : 'ยังไม่ได้อัปโหลด — ใช้ 🌿 เป็นค่าเริ่มต้น'}</div>
      </div>
      <div class="form-group"><input type="file" accept="image/*" id="school-logo-file"></div>
      <button class="btn-green" data-action="upload-school-logo" style="padding:13px;">📤 อัปโหลดโลโก้</button>
      ${s.schoolLogoUrl ? `<button data-action="remove-school-logo" style="width:100%;padding:10px;margin-top:8px;background:#fee2e2;color:#dc2626;border:none;border-radius:10px;font-family:Kanit;cursor:pointer;">🗑️ ลบโลโก้ (กลับไปใช้ 🌿)</button>` : ''}
    </div>

    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--gd);margin-bottom:6px;">👨‍🏫 สิทธิ์การเข้าถึงของครู</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;">กำหนดว่าครูทุกคนเห็น/จัดการเมนูใดได้บ้าง (บังคับจริงที่ฐานข้อมูล)</div>

      ${permRows.map((r, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;${i < permRows.length - 1 ? 'border-bottom:1px solid oklch(0.96 0.02 145);' : ''}">
          <div>
            <div style="font-weight:600;font-size:14px;color:#1f2937;">${r.label}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${r.desc}</div>
          </div>
          ${toggleSwitchHTML('toggle-role-permission', r.key, perms[r.key] !== false)}
        </div>
      `).join('')}
    </div>

    <button class="btn-green" data-action="save-all-settings" style="padding:14px;">✅ บันทึกการตั้งค่าทั้งหมด</button>

    <div class="card">
      <div style="font-size:15px;font-weight:700;color:var(--gd);margin-bottom:6px;">👀 พรีวิวมุมมองครู</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:14px;">ดูหน้าจอในมุมมองที่ครูเห็นจริง (ตามสิทธิ์ที่ตั้งไว้ด้านบน) โดยไม่ต้องออกจากระบบ Admin</div>
      <button class="btn-green" data-action="toggle-teacher-preview" style="padding:13px;background:#3b82f6;">🧑‍🏫 ดูมุมมองครู</button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════

function statBox(icon, num, lbl, color, prefix = '') {
  return `<div class="stat-box"><div class="stat-icon">${icon}</div><div class="stat-val" style="color:${color};" data-countup="${num}" data-prefix="${prefix}">${prefix}0</div><div class="stat-lbl">${lbl}</div></div>`;
}

function listRow(icon, title, sub, right) {
  return `
  <div class="list-item">
    <span class="list-icon">${icon}</span>
    <div class="list-body">
      <div class="list-title">${title}</div>
      ${sub ? `<div class="list-sub">${sub}</div>` : ''}
    </div>
    ${right ? `<div class="list-right">${right}</div>` : ''}
  </div>`;
}

function loadingBlock() {
  return `<div class="loading-center"><div class="spinner"></div></div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function formatTimeHM(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// เมื่อโหลด library สร้าง QR Code ไม่สำเร็จ (เช่น เครือข่ายบล็อก CDN)
// แสดงรหัสนักเรียนตัวใหญ่แทน เพื่อให้ครูยังคีย์รหัสด้วยมือได้
function showQrFallback(canvas, studentCode) {
  const frame = canvas.closest('.qr-frame');
  if (!frame) return;
  frame.innerHTML = `
    <div style="width:164px;height:164px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px;">
      <div style="font-size:28px;">⚠️</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:6px;">โหลด QR ไม่สำเร็จ</div>
      <div style="font-size:20px;font-weight:700;color:var(--gd);margin-top:6px;">${studentCode}</div>
    </div>`;
}

function afterRender() {
  const qrCanvas = document.getElementById('student-qr');
  if (qrCanvas && state.student) {
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(qrCanvas, JSON.stringify({ student_code: state.student.student_code }), {
        width: 164, color: { dark: '#1a4d1a', light: '#ffffff' },
      }, (err) => { if (err) showQrFallback(qrCanvas, state.student.student_code); });
    } else {
      showQrFallback(qrCanvas, state.student.student_code);
    }
  }

  const codeQrCanvas = document.getElementById('teacher-code-qr');
  if (codeQrCanvas && state.pointCode) {
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(codeQrCanvas, JSON.stringify({ point_code: state.pointCode.code }), {
        width: 164, color: { dark: '#b45309', light: '#ffffff' },
      }, (err) => { if (err) showQrFallback(codeQrCanvas, state.pointCode.code); });
    } else {
      showQrFallback(codeQrCanvas, state.pointCode.code);
    }
    startCodeCountdown();
  }

  const rangeInput = document.getElementById('pts-range');
  if (rangeInput) {
    rangeInput.addEventListener('input', () => {
      const v = parseInt(rangeInput.value);
      const min = parseInt(rangeInput.min), max = parseInt(rangeInput.max);
      state.points = v;
      const display = document.getElementById('pts-display');
      if (display) display.textContent = v;
      const pct = ((v - min) / (max - min)) * 100;
      rangeInput.style.background = `linear-gradient(to right, var(--g) ${pct}%, #e5e7eb ${pct}%)`;
    });
  }

  const codeInput = document.getElementById('add-student-code');
  if (codeInput) {
    codeInput.addEventListener('input', async () => {
      const code = codeInput.value.trim();
      state.addStudentCode = code;
      const nameField = document.getElementById('add-student-name');
      if (code.length >= 3) {
        const { data } = await getStudentByCode(code);
        state.addStudentName = data ? fullName(data) : 'ไม่พบนักเรียน';
      } else {
        state.addStudentName = '';
      }
      if (nameField) nameField.value = state.addStudentName;
    });
  }

  const studentCodeInput = document.getElementById('student-code-input');
  if (studentCodeInput) {
    studentCodeInput.focus();
    studentCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitStudentLogin(); });
  }
  const staffPwInput = document.getElementById('staff-password-input');
  if (staffPwInput) {
    staffPwInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitStaffLogin(); });
  }

  spawnHeroLeaves();
  animateCountUps();
  animateLevelBars();
}

// ตัวเลขจุดเด่น (คะแนนสะสม/สถิติแดชบอร์ด) วิ่งขึ้นจาก 0 ให้ดูมีชีวิตชีวา —องค์ประกอบถูกสร้างใหม่
// จาก innerHTML ทุกครั้งที่ render() ทำงาน จึงเรียกซ้ำใน afterRender() แทนที่จะสร้างครั้งเดียว
function animateCountUps() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-countup]').forEach(el => {
    const target = parseFloat(el.dataset.countup);
    if (!Number.isFinite(target)) return;
    const prefix = el.dataset.prefix || '';
    if (reduceMotion) { el.textContent = `${prefix}${target.toLocaleString('th-TH')}`; return; }
    const duration = 700;
    const startTime = performance.now();
    function frame(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — เร่งช่วงแรก ชะลอตอนใกล้ถึงเป้า
      const current = Math.round(target * eased);
      el.textContent = `${prefix}${current.toLocaleString('th-TH')}`;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// หลอดพลังความดี — ตั้ง width:0 ไว้ตอน render() แล้วค่อยเลื่อนไปความกว้างจริงเฟรมถัดไป
// เพื่อให้ CSS transition จับการเปลี่ยนแปลงได้ (แทนที่จะกระโดดไปเลยตั้งแต่เฟรมแรก)
function animateLevelBars() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.level-bar-fill').forEach(el => {
    const pct = parseFloat(el.dataset.pct) || 0;
    if (reduceMotion) { el.style.width = `${pct}%`; return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = `${pct}%`; }));
  });
}

// นับเวลาถอยหลังของโค้ดรับคะแนนที่ครูโชว์อยู่ — วง conic-gradient + เวลา mm:ss
// อัปเดต DOM ตรงๆ ทุกวินาที (ไม่ผ่าน setState) เพื่อไม่ต้อง render() ทั้งจอทุกวินาที
function startCodeCountdown() {
  stopCodeCountdown();
  tickCodeCountdown();
  state._codeCountdownTimer = setInterval(tickCodeCountdown, 1000);
}

function stopCodeCountdown() {
  if (state._codeCountdownTimer) { clearInterval(state._codeCountdownTimer); state._codeCountdownTimer = null; }
}

async function tickCodeCountdown() {
  if (state.screen !== 'teacher-codedisplay' || !state.pointCode) { stopCodeCountdown(); return; }
  const ring = document.getElementById('code-countdown-ring');
  const text = document.getElementById('code-countdown-text');
  if (!ring || !text) { stopCodeCountdown(); return; }

  const remainMs = new Date(state.pointCode.expiresAt).getTime() - Date.now();
  if (remainMs <= 0) {
    stopCodeCountdown();
    showToast('⏰ โค้ดหมดเวลาแล้ว');
    await loadDataForScreen('teacher-dashboard');
    setState({ screen: 'teacher-dashboard', pointCode: null });
    return;
  }

  const remainSec = Math.ceil(remainMs / 1000);
  const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
  const ss = String(remainSec % 60).padStart(2, '0');
  text.textContent = `${mm}:${ss}`;
  const deg = Math.max(0, Math.min(360, (remainMs / state.pointCode.totalMs) * 360));
  ring.style.background = `conic-gradient(var(--g) ${deg}deg, #e5e7eb ${deg}deg)`;
}

// ══════════════════════════════════════════════
// Toast / Modal
// ══════════════════════════════════════════════

function showToast(msg) {
  if (state._toastTimer) clearTimeout(state._toastTimer);
  const c = document.getElementById('toast-container');
  c.innerHTML = `<div class="toast-msg">${msg}</div>`;
  state._toastTimer = setTimeout(() => { c.innerHTML = ''; }, 2800);
}

function showModal(html) {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        ${html}
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-container').innerHTML = ''; }

// ══════════════════════════════════════════════
// QR Scanner
// ══════════════════════════════════════════════

async function startScan() {
  if (typeof jsQR === 'undefined') {
    showToast('โหลดตัวสแกน QR ไม่สำเร็จ กรุณาลองรีเฟรชหน้าใหม่ 🔄');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    state._videoStream = stream;
    const video = document.getElementById('qr-video');
    const placeholder = document.getElementById('scan-placeholder');
    if (!video) return;
    video.srcObject = stream;
    video.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    video.addEventListener('loadedmetadata', () => video.play());
    scanLoop();
  } catch (e) {
    showToast('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้อง 📷');
  }
}

function scanLoop() {
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('scan-canvas');
  if (!video || !canvas || state.screen !== 'teacher-scan' || state.scanStep !== 0) { stopScan(); return; }
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) { stopScan(); handleQRResult(code.data); return; }
    }
  }
  state._scanRaf = requestAnimationFrame(scanLoop);
}

function stopScan() {
  if (state._videoStream) { state._videoStream.getTracks().forEach(t => t.stop()); state._videoStream = null; }
  if (state._scanRaf) { cancelAnimationFrame(state._scanRaf); state._scanRaf = null; }
}

async function handleQRResult(data) {
  try {
    const parsed = JSON.parse(data);
    if (parsed.student_code) { await lookupScanStudent(parsed.student_code); return; }
  } catch {}
  showToast('QR Code ไม่ถูกต้อง ❌');
}

async function lookupScanStudent(code) {
  const { data, error } = await getStudentSummary(code);
  if (error || !data) { showToast('ไม่พบนักเรียนรหัสนี้ ❌'); return; }
  setState({ scanStep: 1, scanStudent: data });
}

// ── Student-side: พลิก QR Code ประจำตัวเป็นกล้อง แล้วสแกนโค้ดของครู (เหมือน startScan/scanLoop/stopScan
// ข้างบน แต่แยกชุดเพราะคนละหน้าจอ/เงื่อนไขหยุด และตัวจบ (redeem) ไม่เหมือนกัน) ──
async function startStudentScan() {
  if (typeof jsQR === 'undefined') {
    showToast('โหลดตัวสแกน QR ไม่สำเร็จ กรุณาลองรีเฟรชหน้าใหม่ 🔄');
    setState({ studentScanMode: false });
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    state._studentVideoStream = stream;
    const video = document.getElementById('student-scan-video');
    if (!video) { stream.getTracks().forEach(t => t.stop()); state._studentVideoStream = null; return; }
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => video.play());
    studentScanLoop();
  } catch (e) {
    showToast('ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้อง 📷');
    setState({ studentScanMode: false });
  }
}

function studentScanLoop() {
  const video = document.getElementById('student-scan-video');
  const canvas = document.getElementById('student-scan-canvas');
  if (!video || !canvas || state.screen !== 'student-dashboard' || !state.studentScanMode) { stopStudentScan(); return; }
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'undefined') {
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if (result) { stopStudentScan(); handleStudentScanResult(result.data); return; }
    }
  }
  state._studentScanRaf = requestAnimationFrame(studentScanLoop);
}

function stopStudentScan() {
  if (state._studentVideoStream) { state._studentVideoStream.getTracks().forEach(t => t.stop()); state._studentVideoStream = null; }
  if (state._studentScanRaf) { cancelAnimationFrame(state._studentScanRaf); state._studentScanRaf = null; }
}

async function handleStudentScanResult(raw) {
  let code = '';
  try { code = (JSON.parse(raw).point_code || '').trim(); } catch { /* not a point-code QR — ignore below */ }
  if (!code) { showToast('QR นี้ไม่ใช่โค้ดรับคะแนน ❌'); setState({ studentScanMode: false }); return; }

  setState({ loading: true });
  const { data, error } = await redeemPointCode(state.student.student_code, code);
  if (error) {
    setState({ loading: false, studentScanMode: false });
    showToast(`❌ ${error}`);
    return;
  }

  const [{ student }, { data: history }] = await Promise.all([
    studentLogin(state.student.student_code),
    getStudentHistory(state.student.student_code, 30),
  ]);
  setState({ loading: false, studentScanMode: false, student: student || state.student, studentHistory: history || [] });
  showToast(`🎉 ได้รับ +${data.points} คะแนน! ${data.deed_icon || ''} ${data.deed_name || ''}`);
  playPointGainedSound();
}

// ══════════════════════════════════════════════
// Auth actions
// ══════════════════════════════════════════════

// รหัสนักเรียนที่จำไว้ใน localStorage เพื่อ auto-login ครั้งถัดไป (จนกว่าจะออกจากระบบ)
const STUDENT_CODE_KEY = 'tbw_student_code';

async function enterStudentSession(code, { silent = false } = {}) {
  const { student, error } = await studentLogin(code);
  if (error || !student) return { ok: false, error };

  const [{ data: history }, { data: leaderboard }, { data: rewards }, { data: badgeTiers }, { data: settings }] = await Promise.all([
    getStudentHistory(code, 30),
    getLeaderboard({ limit: 10 }),
    getRewards(),
    getBadgeTiers(),
    getAppSettings(),
  ]);

  localStorage.setItem(STUDENT_CODE_KEY, code);
  setState({
    loading: false, role: 'student', screen: 'student-dashboard',
    student, studentHistory: history || [], leaderboard: leaderboard || [], rewards: rewards || [],
    badgeTiers: badgeTiers || [], settings: settings || state.settings, leaderboardScope: 'school',
  });
  if (!silent) showToast(`ยินดีต้อนรับ ${fullName(student)}! 🌿`);
  return { ok: true };
}

async function enterStaffSession(profile, { silent = false } = {}) {
  const isAdmin = !!profile.is_admin;
  const role = isAdmin ? 'admin' : 'teacher';
  const screen = isAdmin ? 'admin-dashboard' : 'teacher-dashboard';

  const [{ data: badgeTiers }, { data: rolePermissions }] = await Promise.all([
    getBadgeTiers(),
    getRolePermissions(),
    loadDataForScreen(screen),
  ]);
  state.staffUser = profile;
  state.badgeTiers = badgeTiers || [];
  state.rolePermissions = rolePermissions || state.rolePermissions;
  setState({ loading: false, role, screen });
  if (!silent) showToast(`ยินดีต้อนรับ ${profile.full_name}! 🌿`);
}

async function submitStudentLogin() {
  const code = document.getElementById('student-code-input')?.value.trim();
  if (!code) { setState({ authError: 'กรุณากรอกรหัสนักเรียน' }); return; }
  setState({ loading: true, authError: '' });
  const { ok, error } = await enterStudentSession(code);
  if (!ok) setState({ loading: false, authError: error || 'ไม่พบรหัสนักเรียนนี้' });
}

async function submitStaffLogin() {
  const email = document.getElementById('staff-email-input')?.value.trim();
  const password = document.getElementById('staff-password-input')?.value;
  if (!email || !password) { setState({ authError: 'กรุณากรอกอีเมลและรหัสผ่าน' }); return; }
  setState({ loading: true, authError: '' });
  const { profile, error } = await staffLogin(email, password);
  if (error || !profile) { setState({ loading: false, authError: error || 'เข้าสู่ระบบไม่สำเร็จ' }); return; }
  await enterStaffSession(profile);
}

// โหลดตั้งแต่หน้า login ยังไม่ทันล็อกอิน เพื่อให้โลโก้/ค่าตั้งค่าอื่นๆ ถูกต้องตั้งแต่แรก
// (public read — ไม่ต้องมี session) — ล็อกอินสำเร็จแล้วจะ fetch ซ้ำอีกครั้งเพื่อความชัวร์ ซึ่งไม่มีผลเสีย
async function loadGlobalSettings() {
  const { data } = await getAppSettings();
  if (data) setState({ settings: data });
  if (data) document.title = `${data.schoolTagline} — ${data.schoolName}`;
}

// เรียกตอนเปิดแอป — ลองคืน session เดิม: ครู/แอดมินเช็คจาก Supabase Auth session
// (persist ให้เองอยู่แล้ว), นักเรียนเช็คจากรหัสที่จำไว้ใน localStorage
async function restoreSession() {
  const { profile } = await getCurrentStaffProfile();
  if (profile) { await enterStaffSession(profile, { silent: true }); return; }

  const savedCode = localStorage.getItem(STUDENT_CODE_KEY);
  if (savedCode) {
    const { ok } = await enterStudentSession(savedCode, { silent: true });
    if (ok) return;
    localStorage.removeItem(STUDENT_CODE_KEY); // รหัสเก่าใช้ไม่ได้แล้ว (เช่น ถูกลบออกจากระบบ)
  }
}

async function doLogout() {
  stopScan();
  stopCodeCountdown();
  stopStudentScan();
  if (state.role === 'teacher' || state.role === 'admin') await staffLogout();
  localStorage.removeItem(STUDENT_CODE_KEY);
  Object.assign(state, {
    screen: 'login', authView: 'student', role: null, previewAsTeacher: false, authError: '', drawerOpen: false,
    student: null, studentHistory: [], studentRedemptions: [], leaderboard: null, leaderboardScope: 'school',
    staffUser: null, deedTypes: [], rewards: [], rewardRequests: [], rewardSuggestions: [], students: [], studentGradeFilter: '', studentRoomFilter: '', studentClasses: [], pointLogs: [], badgeTiers: [],
    reportSummary: null, reportError: null, reportLeaderboard: null, reportGradeFilter: '', scanStep: 0, scanStudent: null, selectedDeedId: null, points: 10,
    addStudentCode: '', addStudentName: '', studentScanMode: false,
    pointCode: null, codeDurationMin: 10, codeGradeFilter: '', codeRoomFilter: '', codeHistory: [], teacherRecentLogs: [],
    settings: { leaderboardEnabled: true, leaderboardTopN: 10, schoolLogoUrl: null, schoolName: 'ตาเบาวิทยา', schoolTagline: 'ระบบสะสมคะแนนความดีนักเรียน' },
    rolePermissions: { 'admin-deedtypes': true, 'admin-rewards': true, 'admin-reward-pickup': true, 'admin-suggestions': true, 'admin-reports': true },
  });
  render();
  showToast('ออกจากระบบแล้ว');
}

// ══════════════════════════════════════════════
// Data loaders per screen
// ══════════════════════════════════════════════

async function loadDataForScreen(screen) {
  if (screen === 'teacher-history') {
    const { data } = await getPointLogs({ limit: 20 });
    state.pointLogs = data || [];
  }
  if (screen === 'teacher-dashboard' && state.staffUser) {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data } = await getPointLogs({ limit: null, teacherId: state.staffUser.id, since: startOfMonth });
    state.teacherRecentLogs = data || [];
  }
  if (screen === 'teacher-scan' || screen === 'teacher-addpoints' || screen === 'teacher-createcode') {
    const { data } = await getDeedTypes();
    state.deedTypes = data || [];
  }
  if (screen === 'teacher-createcode' && !state.studentClasses.length) {
    const { data } = await getStudentClasses();
    state.studentClasses = data || [];
  }
  if (screen === 'admin-dashboard' || screen === 'admin-reports') {
    const tasks = [getReportSummary(), getPointLogs({ limit: 6 })];
    if (screen === 'admin-reports') {
      tasks.push(getLeaderboard({ limit: 10, gradeLevel: state.reportGradeFilter || null }));
      if (!state.studentClasses.length) tasks.push(getStudentClasses());
    }
    const [{ data: summary, error: reportError }, { data: logs }, leaderboardResult, classesResult] = await Promise.all(tasks);
    state.reportSummary = summary;
    state.reportError = reportError || null;
    state.pointLogs = logs || [];
    if (leaderboardResult) state.reportLeaderboard = leaderboardResult.data || [];
    if (classesResult) state.studentClasses = classesResult.data || [];
  }
  if (screen === 'admin-students') {
    const tasks = [getStudents({
      search: state.studentSearch, limit: 20,
      gradeLevel: state.studentGradeFilter, room: state.studentRoomFilter,
    })];
    if (!state.studentClasses.length) tasks.push(getStudentClasses());
    const [{ data, count }, classesResult] = await Promise.all(tasks);
    state.students = data || [];
    state.studentsCount = count || 0;
    if (classesResult) state.studentClasses = classesResult.data || [];
  }
  if (screen === 'admin-deedtypes') {
    const { data } = await getAllDeedTypes();
    state.deedTypes = data || [];
  }
  if (screen === 'admin-rewards') {
    const { data } = await getAllRewards();
    state.rewards = data || [];
  }
  if (screen === 'admin-reward-pickup') {
    const { data } = await getRewardRequests();
    state.rewardRequests = data || [];
  }
  if (screen === 'admin-suggestions') {
    const { data } = await getRewardSuggestions();
    state.rewardSuggestions = data || [];
  }
  if (screen === 'admin-badges') {
    const { data } = await getBadgeTiers();
    state.badgeTiers = data || [];
  }
  if (screen === 'admin-codehistory') {
    const { data } = await getPointCodeHistory({ limit: 30 });
    state.codeHistory = data || [];
  }
  if (screen === 'admin-settings') {
    const [{ data: settings }, { data: rolePermissions }] = await Promise.all([getAppSettings(), getRolePermissions()]);
    state.settings = settings || state.settings;
    state.rolePermissions = rolePermissions || state.rolePermissions;
  }
}

// ══════════════════════════════════════════════
// Event Handling
// ══════════════════════════════════════════════

document.addEventListener('change', async (e) => {
  if (e.target.id === 'student-photo-file') {
    const file = e.target.files[0];
    if (!file) return;
    const img = document.getElementById('photo-preview');
    const placeholder = document.getElementById('photo-preview-placeholder');
    const reader = new FileReader();
    reader.onload = () => {
      if (img) { img.src = reader.result; img.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
    return;
  }

  if (e.target.id === 'report-grade-filter') {
    state.reportGradeFilter = e.target.value;
    const { data } = await getLeaderboard({ limit: 10, gradeLevel: state.reportGradeFilter || null });
    setState({ reportLeaderboard: data || [] });
  }

  if (e.target.id === 'code-grade-filter') {
    setState({ codeGradeFilter: e.target.value, codeRoomFilter: '' });
  }
  if (e.target.id === 'code-room-filter') {
    setState({ codeRoomFilter: e.target.value });
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;

  switch (action) {
    case 'show-auth':
      setState({ authView: btn.dataset.view, authError: '' });
      break;

    case 'submit-student-login':
      await submitStudentLogin();
      break;

    case 'submit-staff-login':
      await submitStaffLogin();
      break;

    case 'logout':
      await doLogout();
      break;

    case 'nav': {
      if (state.screen === 'teacher-scan') stopScan();
      if (state.screen === 'teacher-codedisplay') stopCodeCountdown();
      if (state.studentScanMode) stopStudentScan();
      const screen = btn.dataset.screen;
      setState({ loading: true });
      await loadDataForScreen(screen);
      setState({ loading: false, screen, scanStep: 0, selectedDeedId: null, scanStudent: null, addStudentCode: '', addStudentName: '', studentScanMode: false });
      break;
    }

    case 'open-drawer':
      openDrawer();
      break;

    case 'close-drawer':
      // Only close on a direct click on the backdrop itself — not on clicks that
      // bubbled up from inside the drawer panel (nav buttons, blank padding, etc.)
      if (btn === e.target) closeDrawer();
      break;

    case 'drawer-nav': {
      closeDrawer();
      if (state.screen === 'teacher-scan') stopScan();
      if (state.screen === 'teacher-codedisplay') stopCodeCountdown();
      if (state.studentScanMode) stopStudentScan();
      const screen = btn.dataset.screen;
      setState({ loading: true });
      await loadDataForScreen(screen);
      setState({ loading: false, screen, scanStep: 0, selectedDeedId: null, scanStudent: null, addStudentCode: '', addStudentName: '', studentScanMode: false });
      break;
    }

    case 'go-profile':
      if (state.role === 'student') {
        if (state.studentScanMode) stopStudentScan();
        setState({ screen: 'student-profile', studentScanMode: false });
      }
      break;

    case 'start-scan':
      startScan();
      break;

    case 'qr-card-tap': {
      spawnTapPulse(btn); // ให้ feedback ทุกครั้งที่แตะ ไม่ใช่แค่ตอนพลิกสำเร็จ
      unlockAudio(); // ต้องเรียกแบบ sync ตรงนี้ (ใน user gesture จริง) ให้ iOS Safari ปลดล็อกเสียงไว้ก่อน
      const now = Date.now();
      const last = state._lastQrTapAt || 0;
      state._lastQrTapAt = now;
      if (now - last >= 400) break; // รอแตะครั้งที่ 2 ภายใน 400ms ถึงจะนับเป็นดับเบิลแทป
      state._lastQrTapAt = 0;
      if (state.studentScanMode) {
        stopStudentScan();
        setState({ studentScanMode: false });
      } else {
        setState({ studentScanMode: true });
        await startStudentScan();
      }
      break;
    }

    case 'reset-scan':
      stopScan();
      setState({ scanStep: 0, selectedDeedId: null, scanStudent: null, addStudentCode: '', addStudentName: '', studentScanMode: false });
      break;

    case 'select-deed':
      setState({ selectedDeedId: parseInt(btn.dataset.deedId) });
      break;

    case 'save-points': {
      if (!state.selectedDeedId) { showToast('กรุณาเลือกประเภทความดีก่อน'); return; }
      setState({ loading: true });
      const { error } = await addPointLog({
        studentCode: state.scanStudent.student_code,
        deedTypeId: state.selectedDeedId,
        points: state.points,
      });
      if (error) { setState({ loading: false }); showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`✅ บันทึกสำเร็จ! +${state.points} คะแนน ${fullName(state.scanStudent)}`);
      setState({ loading: false, scanStep: 0, selectedDeedId: null, points: 10, scanStudent: null, screen: 'teacher-dashboard' });
      await loadDataForScreen('teacher-dashboard');
      render();
      break;
    }

    case 'select-code-duration':
      setState({ codeDurationMin: parseInt(btn.dataset.min) });
      break;

    case 'generate-point-code': {
      if (!state.selectedDeedId) { showToast('กรุณาเลือกประเภทความดีก่อน'); return; }
      const deed = state.deedTypes.find(d => d.id === state.selectedDeedId);
      const gradeLevel = state.codeGradeFilter || null;
      const room = state.codeRoomFilter || null;
      const durationSeconds = state.codeDurationMin * 60;
      setState({ loading: true });
      const { data, error } = await createPointCode({
        deedTypeId: state.selectedDeedId, points: state.points, gradeLevel, room, durationSeconds,
      });
      if (error || !data) { setState({ loading: false }); showToast(`เกิดข้อผิดพลาด: ${error || 'สร้างโค้ดไม่สำเร็จ'}`); break; }
      const scopeLabel = gradeLevel ? `ม.${gradeLevel}${room ? '/' + room : ''}` : 'ทุกชั้นเรียน';
      setState({
        loading: false, screen: 'teacher-codedisplay', selectedDeedId: null,
        pointCode: {
          id: data.id, code: data.code, icon: deed?.icon || '💚', name: deed?.name || '',
          points: state.points, scopeLabel, expiresAt: data.expires_at, totalMs: durationSeconds * 1000,
        },
      });
      break;
    }

    case 'cancel-point-code': {
      stopCodeCountdown();
      if (state.pointCode?.id) await cancelPointCode(state.pointCode.id);
      showToast('ปิดโค้ดแล้ว');
      await loadDataForScreen('teacher-dashboard');
      setState({ screen: 'teacher-dashboard', pointCode: null });
      break;
    }

    case 'submit-addpoints': {
      const code = document.getElementById('add-student-code')?.value.trim();
      const deedTypeId = state.selectedDeedId;
      const points = state.points;
      const note = document.getElementById('add-note')?.value || '';
      if (!code || !deedTypeId || !points) { showToast('กรุณากรอกรหัสนักเรียนและเลือกประเภทความดี'); return; }
      setState({ loading: true });
      const { error } = await addPointLog({ studentCode: code, deedTypeId, points, note });
      setState({ loading: false });
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('บันทึกคะแนนสำเร็จ! ✅');
      await loadDataForScreen('teacher-dashboard');
      setState({ screen: 'teacher-dashboard', selectedDeedId: null, points: 10, addStudentCode: '', addStudentName: '' });
      break;
    }

    case 'cancel-point-log': {
      const log = state.pointLogs.find(l => l.id === btn.dataset.id);
      if (!log) break;
      showModal(`
        <div class="modal-title">⚠️ ยืนยันการยกเลิก</div>
        <div style="text-align:center;padding:6px 0 20px;color:#374151;font-size:14px;line-height:1.7;">
          ต้องการยกเลิกคะแนน <b style="color:var(--gd);">+${log.points}</b> ของ<br>
          <b>${fullName(log.students)}</b><br>
          <span style="color:#9ca3af;font-size:12px;">${log.good_deed_types?.name || ''}</span><br>
          ใช่หรือไม่?
        </div>
        <button class="btn-green" data-action="confirm-cancel-point-log" data-id="${log.id}" style="padding:13px;background:#dc2626;">🗑️ ยืนยันยกเลิก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ไม่ยกเลิก</button>
      `);
      break;
    }

    case 'confirm-cancel-point-log': {
      closeModal();
      const { error } = await cancelPointLog(btn.dataset.id, state.staffUser?.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('ยกเลิกรายการแล้ว');
      await loadDataForScreen(state.screen);
      render();
      break;
    }

    case 'redeem': {
      const can = btn.dataset.can === 'true';
      const rewardId = parseInt(btn.dataset.rewardId);
      const name = btn.dataset.rewardName;
      if (!can) { showToast('คะแนนไม่พอ ❌'); break; }
      setState({ loading: true });
      const { error } = await redeemReward(state.student.student_code, rewardId);
      if (error) { setState({ loading: false }); showToast(`ไม่สำเร็จ: ${error}`); break; }
      const [{ student }, { data: rewards }] = await Promise.all([
        studentLogin(state.student.student_code),
        getRewards(),
      ]);
      setState({ loading: false, student, rewards: rewards || [] });
      showToast(`แลก "${name}" สำเร็จ! 🎉`);
      break;
    }

    case 'open-share-card':
      openShareCardModal();
      break;

    case 'download-share-card': {
      const canvas = document.getElementById('share-card-canvas');
      if (!canvas) break;
      canvas.toBlob(blob => {
        if (!blob) { showToast('สร้างรูปไม่สำเร็จ'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = shareCardFileName(state.student);
        a.click();
        URL.revokeObjectURL(url);
        showToast('บันทึกรูปแล้ว ✅');
      }, 'image/png');
      break;
    }

    case 'share-share-card': {
      const canvas = document.getElementById('share-card-canvas');
      if (!canvas) break;
      canvas.toBlob(async blob => {
        if (!blob) { showToast('สร้างรูปไม่สำเร็จ'); return; }
        const file = new File([blob], shareCardFileName(state.student), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'การ์ดผลงานความดี' });
          } catch {}
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = shareCardFileName(state.student);
          a.click();
          URL.revokeObjectURL(url);
          showToast('เบราว์เซอร์นี้แชร์ตรงไม่ได้ บันทึกรูปให้แทน 💾');
        }
      }, 'image/png');
      break;
    }

    case 'open-point-code-card':
      openPointCodeCardModal();
      break;

    case 'download-point-code-card': {
      const canvas = document.getElementById('point-code-card-canvas');
      if (!canvas || !state.pointCode) break;
      canvas.toBlob(blob => {
        if (!blob) { showToast('สร้างรูปไม่สำเร็จ'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pointCodeCardFileName(state.pointCode);
        a.click();
        URL.revokeObjectURL(url);
        showToast('บันทึกรูปแล้ว ✅');
      }, 'image/png');
      break;
    }

    case 'share-point-code-card': {
      const canvas = document.getElementById('point-code-card-canvas');
      if (!canvas || !state.pointCode) break;
      canvas.toBlob(async blob => {
        if (!blob) { showToast('สร้างรูปไม่สำเร็จ'); return; }
        const file = new File([blob], pointCodeCardFileName(state.pointCode), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'โค้ดรับคะแนน' });
          } catch {}
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = pointCodeCardFileName(state.pointCode);
          a.click();
          URL.revokeObjectURL(url);
          showToast('เบราว์เซอร์นี้แชร์ตรงไม่ได้ บันทึกรูปให้แทน 💾');
        }
      }, 'image/png');
      break;
    }

    case 'set-leaderboard-scope': {
      const scope = btn.dataset.scope;
      setState({ leaderboardScope: scope, leaderboard: null });
      const s = state.student;
      const filter = scope === 'grade' ? { gradeLevel: s.grade_level }
                   : scope === 'room' ? { gradeLevel: s.grade_level, room: s.room }
                   : {};
      const { data } = await getLeaderboard({ limit: 10, ...filter });
      setState({ leaderboard: data || [] });
      break;
    }

    case 'search-students-submit': {
      state.studentSearch = document.getElementById('student-search')?.value.trim() || '';
      state.studentGradeFilter = document.getElementById('student-grade-filter')?.value || '';
      state.studentRoomFilter = document.getElementById('student-room-filter')?.value || '';
      const { data, count } = await getStudents({
        search: state.studentSearch, limit: 20,
        gradeLevel: state.studentGradeFilter, room: state.studentRoomFilter,
      });
      setState({ students: data || [], studentsCount: count || 0 });
      break;
    }

    // ทั้งสองปุ่มนี้แก้ DOM ตรงๆ โดยไม่เรียก setState/render — ฟอร์มที่เปิดอยู่ใน modal
    // ไม่ได้ผูกกับ state ระหว่างพิมพ์ ถ้า render ใหม่ค่าที่พิมพ์ไปในช่องอื่นจะหาย
    case 'toggle-emoji-picker': {
      const el = document.getElementById(btn.dataset.target);
      if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
      break;
    }

    case 'pick-emoji': {
      const input = document.getElementById(btn.dataset.target);
      if (input) input.value = btn.textContent.trim();
      const picker = btn.closest('[id$="-picker"]');
      if (picker) picker.style.display = 'none';
      break;
    }

    case 'open-student-photo': {
      const s = state.students.find(x => x.id === btn.dataset.id);
      if (!s) break;
      showModal(`
        <div class="modal-title">📷 รูปโปรไฟล์ — ${fullName(s)}</div>
        <div style="text-align:center;margin-bottom:16px;">
          <img id="photo-preview" src="${s.photo_url || ''}" alt=""
               style="width:120px;height:120px;border-radius:50%;object-fit:cover;background:#f3f4f6;margin:0 auto;border:2px solid #e5e7eb;display:${s.photo_url ? 'block' : 'none'};">
          <div id="photo-preview-placeholder"
               style="width:120px;height:120px;border-radius:50%;background:#f3f4f6;align-items:center;justify-content:center;font-size:48px;margin:0 auto;display:${s.photo_url ? 'none' : 'flex'};">${studentGenderIcon(s)}</div>
        </div>
        <div class="form-group"><input type="file" accept="image/*" id="student-photo-file"></div>
        <button class="btn-green" data-action="save-student-photo" data-id="${s.id}" style="padding:13px;margin-top:4px;">✅ บันทึกรูป</button>
        ${s.photo_url ? `<button data-action="remove-student-photo" data-id="${s.id}" data-url="${s.photo_url}" style="width:100%;padding:10px;margin-top:8px;background:#fee2e2;color:#dc2626;border:none;border-radius:10px;font-family:Kanit;cursor:pointer;">🗑️ ลบรูป</button>` : ''}
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;
    }

    case 'save-student-photo': {
      const file = document.getElementById('student-photo-file')?.files[0];
      if (!file) { showToast('กรุณาเลือกรูปภาพ'); return; }
      let uploadFile = file, photoOpts = { ext: 'jpg', contentType: 'image/jpeg' };
      try {
        uploadFile = await compressImageFile(file);
      } catch {
        photoOpts = { ext: (file.name.split('.').pop() || 'jpg').toLowerCase(), contentType: file.type || 'image/jpeg' };
      }
      const { error } = await uploadStudentPhoto(btn.dataset.id, uploadFile, photoOpts);
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('อัปโหลดรูปโปรไฟล์สำเร็จ ✅');
      await loadDataForScreen('admin-students');
      render();
      break;
    }

    case 'remove-student-photo': {
      const { error } = await removeStudentPhoto(btn.dataset.id, btn.dataset.url);
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('ลบรูปโปรไฟล์แล้ว');
      await loadDataForScreen('admin-students');
      render();
      break;
    }

    case 'open-add-deed':
      showModal(`
        <div class="modal-title">➕ เพิ่มประเภทความดีใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="new-deed-icon" value="🌱">${emojiPickerHTML('new-deed-icon')}</div>
        <div class="form-group"><label class="form-label">ชื่อประเภท *</label><input class="form-input" id="new-deed-name" placeholder="เช่น ช่วยงานโรงเรียน"></div>
        <div class="form-group"><label class="form-label">คะแนนต่ำสุด</label><input class="form-input" type="number" id="new-deed-min" value="5"></div>
        <div class="form-group"><label class="form-label">คะแนนสูงสุด</label><input class="form-input" type="number" id="new-deed-max" value="20"></div>
        <button class="btn-green" data-action="save-deed" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;

    case 'save-deed': {
      const icon = document.getElementById('new-deed-icon')?.value.trim() || '💚';
      const name = document.getElementById('new-deed-name')?.value.trim();
      const points_min = parseInt(document.getElementById('new-deed-min')?.value) || 5;
      const points_max = parseInt(document.getElementById('new-deed-max')?.value) || 20;
      if (!name) { showToast('กรุณากรอกชื่อประเภท'); return; }
      const { error } = await addDeedType({ icon, name, points_min, points_max });
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`เพิ่ม "${name}" สำเร็จ! ✅`);
      await loadDataForScreen('admin-deedtypes');
      render();
      break;
    }

    case 'open-edit-deed': {
      const dt = state.deedTypes.find(d => String(d.id) === btn.dataset.id);
      if (!dt) break;
      showModal(`
        <div class="modal-title">✏️ แก้ไขประเภทความดี</div>
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="edit-deed-icon" value="${dt.icon}">${emojiPickerHTML('edit-deed-icon')}</div>
        <div class="form-group"><label class="form-label">ชื่อประเภท *</label><input class="form-input" id="edit-deed-name" value="${dt.name}"></div>
        <div class="form-group"><label class="form-label">คะแนนต่ำสุด</label><input class="form-input" type="number" id="edit-deed-min" value="${dt.points_min}"></div>
        <div class="form-group"><label class="form-label">คะแนนสูงสุด</label><input class="form-input" type="number" id="edit-deed-max" value="${dt.points_max}"></div>
        <button class="btn-green" data-action="save-edit-deed" data-id="${dt.id}" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;
    }

    case 'save-edit-deed': {
      const icon = document.getElementById('edit-deed-icon')?.value.trim() || '💚';
      const name = document.getElementById('edit-deed-name')?.value.trim();
      const points_min = parseInt(document.getElementById('edit-deed-min')?.value) || 5;
      const points_max = parseInt(document.getElementById('edit-deed-max')?.value) || 20;
      if (!name) { showToast('กรุณากรอกชื่อประเภท'); return; }
      const { error } = await updateDeedType(btn.dataset.id, { icon, name, points_min, points_max });
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`แก้ไข "${name}" สำเร็จ! ✅`);
      await loadDataForScreen('admin-deedtypes');
      render();
      break;
    }

    case 'del-deed': {
      const { error } = await deleteDeedType(btn.dataset.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`ลบ "${btn.dataset.name}" แล้ว`);
      await loadDataForScreen('admin-deedtypes');
      render();
      break;
    }

    case 'toggle-deed': {
      const active = btn.dataset.active === 'true';
      const { error } = await updateDeedType(btn.dataset.id, { active: !active });
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`${active ? 'ปิด' : 'เปิด'}ใช้งาน "${btn.dataset.name}" แล้ว`);
      await loadDataForScreen('admin-deedtypes');
      render();
      break;
    }

    case 'open-add-reward':
      showModal(`
        <div class="modal-title">➕ เพิ่มรางวัลใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน</label><input class="form-input" id="new-rw-icon" value="🎁">${emojiPickerHTML('new-rw-icon')}</div>
        <div class="form-group"><label class="form-label">ชื่อรางวัล *</label><input class="form-input" id="new-rw-name"></div>
        <div class="form-group"><label class="form-label">คะแนนที่ใช้ *</label><input class="form-input" type="number" id="new-rw-pts" placeholder="100"></div>
        <div class="form-group"><label class="form-label">จำนวนคงเหลือ</label><input class="form-input" type="number" id="new-rw-stock" placeholder="10"></div>
        <button class="btn-green" data-action="save-reward" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;

    case 'save-reward': {
      const icon = document.getElementById('new-rw-icon')?.value.trim() || '🎁';
      const name = document.getElementById('new-rw-name')?.value.trim();
      const points_required = parseInt(document.getElementById('new-rw-pts')?.value) || 0;
      const stock = parseInt(document.getElementById('new-rw-stock')?.value) || 0;
      if (!name || !points_required) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      const { error } = await addReward({ icon, name, points_required, stock, active: true });
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`เพิ่ม "${name}" สำเร็จ! ✅`);
      await loadDataForScreen('admin-rewards');
      render();
      break;
    }

    case 'open-edit-reward': {
      const r = state.rewards.find(x => String(x.id) === btn.dataset.id);
      if (!r) break;
      showModal(`
        <div class="modal-title">✏️ แก้ไขรางวัล</div>
        <div class="form-group"><label class="form-label">ไอคอน</label><input class="form-input" id="edit-rw-icon" value="${r.icon}">${emojiPickerHTML('edit-rw-icon')}</div>
        <div class="form-group"><label class="form-label">ชื่อรางวัล *</label><input class="form-input" id="edit-rw-name" value="${r.name}"></div>
        <div class="form-group"><label class="form-label">คะแนนที่ใช้ *</label><input class="form-input" type="number" id="edit-rw-pts" value="${r.points_required}"></div>
        <div class="form-group"><label class="form-label">จำนวนคงเหลือ</label><input class="form-input" type="number" id="edit-rw-stock" value="${r.stock}"></div>
        <button class="btn-green" data-action="save-edit-reward" data-id="${r.id}" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;
    }

    case 'save-edit-reward': {
      const icon = document.getElementById('edit-rw-icon')?.value.trim() || '🎁';
      const name = document.getElementById('edit-rw-name')?.value.trim();
      const points_required = parseInt(document.getElementById('edit-rw-pts')?.value) || 0;
      const stock = parseInt(document.getElementById('edit-rw-stock')?.value) || 0;
      if (!name || !points_required) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      const { error } = await updateReward(btn.dataset.id, { icon, name, points_required, stock });
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`แก้ไข "${name}" สำเร็จ! ✅`);
      await loadDataForScreen('admin-rewards');
      render();
      break;
    }

    case 'toggle-reward': {
      const active = btn.dataset.active === 'true';
      const { error } = await updateReward(btn.dataset.id, { active: !active });
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`${!active ? 'เปิด' : 'ปิด'}ใช้งาน: ${btn.dataset.name}`);
      await loadDataForScreen('admin-rewards');
      render();
      break;
    }

    case 'mark-reward-collected': {
      const { error } = await markRewardCollected(btn.dataset.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('บันทึกว่ามอบของแล้ว ✅');
      await loadDataForScreen('admin-reward-pickup');
      render();
      break;
    }

    case 'unmark-reward-collected': {
      const { error } = await unmarkRewardCollected(btn.dataset.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('ยกเลิกสถานะรับของแล้ว');
      await loadDataForScreen('admin-reward-pickup');
      render();
      break;
    }

    case 'submit-suggestion': {
      const textarea = document.getElementById('suggestion-text');
      const message = textarea?.value.trim();
      if (!message) { showToast('กรุณากรอกข้อความก่อนส่ง'); return; }
      btn.disabled = true;
      btn.textContent = 'กำลังส่ง...';
      const { error } = await submitRewardSuggestion(state.student.student_code, message);
      if (error) {
        btn.disabled = false;
        btn.textContent = '📤 ส่งข้อเสนอแนะ';
        showToast(`เกิดข้อผิดพลาด: ${error}`);
        break;
      }
      if (textarea) textarea.value = '';
      btn.disabled = false;
      btn.textContent = '📤 ส่งข้อเสนอแนะ';
      showToast('ส่งข้อเสนอแนะแล้ว ขอบคุณครับ 🙏');
      break;
    }

    case 'mark-suggestion-read': {
      const { error } = await markSuggestionRead(btn.dataset.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('ทำเครื่องหมายว่าอ่านแล้ว');
      await loadDataForScreen('admin-suggestions');
      render();
      break;
    }

    case 'unmark-suggestion-read': {
      const { error } = await unmarkSuggestionRead(btn.dataset.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('ยกเลิกสถานะอ่านแล้ว');
      await loadDataForScreen('admin-suggestions');
      render();
      break;
    }

    case 'open-add-badge':
      showModal(`
        <div class="modal-title">➕ เพิ่ม Badge ใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="new-badge-icon" value="🏅">${emojiPickerHTML('new-badge-icon')}</div>
        <div class="form-group"><label class="form-label">ชื่อ Badge *</label><input class="form-input" id="new-badge-name" placeholder="เช่น คนดีระดับเทพ"></div>
        <div class="form-group"><label class="form-label">คะแนนขั้นต่ำ *</label><input class="form-input" type="number" id="new-badge-min" placeholder="10000"></div>
        <div class="form-group"><label class="form-label">สี</label><input class="form-input" type="color" id="new-badge-color" value="#22c55e" style="height:44px;padding:4px;"></div>
        <button class="btn-green" data-action="save-badge" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;

    case 'save-badge': {
      const icon = document.getElementById('new-badge-icon')?.value.trim() || '🏅';
      const name = document.getElementById('new-badge-name')?.value.trim();
      const min_points = parseInt(document.getElementById('new-badge-min')?.value);
      const color = document.getElementById('new-badge-color')?.value || '#22c55e';
      if (!name || isNaN(min_points)) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      const { error } = await addBadgeTier({ icon, name, min_points, color });
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`เพิ่ม Badge "${name}" สำเร็จ! ✅`);
      await loadDataForScreen('admin-badges');
      render();
      break;
    }

    case 'open-edit-badge': {
      const t = state.badgeTiers.find(x => String(x.id) === btn.dataset.id);
      if (!t) break;
      showModal(`
        <div class="modal-title">✏️ แก้ไข Badge</div>
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="edit-badge-icon" value="${t.icon}">${emojiPickerHTML('edit-badge-icon')}</div>
        <div class="form-group"><label class="form-label">ชื่อ Badge *</label><input class="form-input" id="edit-badge-name" value="${t.name}"></div>
        <div class="form-group"><label class="form-label">คะแนนขั้นต่ำ *</label><input class="form-input" type="number" id="edit-badge-min" value="${t.min_points}"></div>
        <div class="form-group"><label class="form-label">สี</label><input class="form-input" type="color" id="edit-badge-color" value="${t.color}" style="height:44px;padding:4px;"></div>
        <button class="btn-green" data-action="save-edit-badge" data-id="${t.id}" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;
    }

    case 'save-edit-badge': {
      const icon = document.getElementById('edit-badge-icon')?.value.trim() || '🏅';
      const name = document.getElementById('edit-badge-name')?.value.trim();
      const min_points = parseInt(document.getElementById('edit-badge-min')?.value);
      const color = document.getElementById('edit-badge-color')?.value || '#22c55e';
      if (!name || isNaN(min_points)) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      const { error } = await updateBadgeTier(btn.dataset.id, { icon, name, min_points, color });
      closeModal();
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`แก้ไข Badge "${name}" สำเร็จ! ✅`);
      await loadDataForScreen('admin-badges');
      render();
      break;
    }

    case 'del-badge': {
      const { error } = await deleteBadgeTier(btn.dataset.id);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`ลบ Badge "${btn.dataset.name}" แล้ว`);
      await loadDataForScreen('admin-badges');
      render();
      break;
    }

    case 'toggle-leaderboard-enabled': {
      const enabled = btn.dataset.enabled === 'true';
      setState({ settings: { ...state.settings, leaderboardEnabled: !enabled } });
      break;
    }

    case 'toggle-role-permission': {
      const enabled = btn.dataset.enabled === 'true';
      const key = btn.dataset.key;
      setState({ rolePermissions: { ...state.rolePermissions, [key]: !enabled } });
      break;
    }

    case 'toggle-teacher-preview': {
      closeDrawer();
      const entering = !state.previewAsTeacher;
      const screen = entering ? 'teacher-dashboard' : 'admin-dashboard';
      setState({ loading: true });
      await loadDataForScreen(screen);
      setState({ loading: false, previewAsTeacher: entering, screen, scanStep: 0, selectedDeedId: null, scanStudent: null, addStudentCode: '', addStudentName: '', studentScanMode: false });
      showToast(entering ? 'กำลังดูมุมมองครู 🧑‍🏫' : 'กลับสู่มุมมอง Admin');
      break;
    }

    case 'upload-school-logo': {
      const file = document.getElementById('school-logo-file')?.files[0];
      if (!file) { showToast('กรุณาเลือกไฟล์รูปก่อน'); return; }
      let uploadFile = file;
      try { uploadFile = await compressImageFile(file, { maxSize: 512, format: 'image/png' }); } catch {}
      const { error } = await uploadSchoolLogo(uploadFile);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      const { data } = await getAppSettings();
      setState({ settings: data || state.settings });
      showToast('อัปโหลดโลโก้สำเร็จ ✅');
      break;
    }

    case 'remove-school-logo': {
      const { error } = await removeSchoolLogo(state.settings.schoolLogoUrl);
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      const { data } = await getAppSettings();
      setState({ settings: data || state.settings });
      showToast('ลบโลโก้แล้ว กลับไปใช้ 🌿');
      break;
    }

    case 'save-all-settings': {
      const topN = parseInt(document.getElementById('top-n-input')?.value) || 10;
      const schoolName = document.getElementById('school-name-input')?.value.trim() || 'ตาเบาวิทยา';
      const schoolTagline = document.getElementById('school-tagline-input')?.value.trim() || 'ระบบสะสมคะแนนความดีนักเรียน';
      setState({ loading: true });
      const permKeys = ['admin-deedtypes', 'admin-rewards', 'admin-reward-pickup', 'admin-suggestions', 'admin-reports'];
      const results = await Promise.all([
        updateAppSetting('leaderboard_enabled', state.settings.leaderboardEnabled ? 'true' : 'false'),
        updateAppSetting('leaderboard_top_n', topN),
        updateAppSetting('school_name', schoolName),
        updateAppSetting('school_tagline', schoolTagline),
        ...permKeys.map(k => updateRolePermission(k, state.rolePermissions[k] !== false)),
      ]);
      const firstError = results.map(r => r.error).find(Boolean);
      setState({ loading: false, settings: { ...state.settings, leaderboardTopN: topN, schoolName, schoolTagline } });
      document.title = `${schoolTagline} — ${schoolName}`;
      if (firstError) { showToast(`เกิดข้อผิดพลาด: ${firstError}`); break; }
      showToast('บันทึกการตั้งค่าสำเร็จ! ✅');
      break;
    }

    case 'close-modal':
      // Same guard as close-drawer: only the backdrop itself closes the modal.
      if (btn === e.target) closeModal();
      break;
  }
});

// ใบไม้ลอยพื้นหลัง (login เต็มจอ + การ์ดนักเรียนหน้าหลัก) — --dy คำนวณจากความสูงจริง
// ของ field นั้นๆ ทำให้ keyframe เดียวใช้ได้ทั้งพื้นที่เต็มจอและการ์ดสั้นๆ
function spawnLeaves(field, { count, sizeMin, sizeMax, durMin, durMax, delMax }) {
  if (!field) return;
  const LEAVES = ['🍃', '🌿'];
  const dy = Math.max(field.offsetHeight, 60);
  for (let i = 0; i < count; i++) {
    const leaf = document.createElement('span');
    leaf.className = 'leaf';
    leaf.textContent = LEAVES[i % LEAVES.length];
    leaf.style.setProperty('--x', `${Math.round(Math.random() * 90 + 5)}%`);
    leaf.style.setProperty('--dur', `${(durMin + Math.random() * (durMax - durMin)).toFixed(1)}s`);
    leaf.style.setProperty('--del', `${(Math.random() * delMax).toFixed(1)}s`);
    leaf.style.setProperty('--op', (0.16 + Math.random() * 0.16).toFixed(2));
    leaf.style.setProperty('--sz', `${Math.round(sizeMin + Math.random() * (sizeMax - sizeMin))}px`);
    leaf.style.setProperty('--dx', `${Math.round(-55 + Math.random() * 110)}px`);
    leaf.style.setProperty('--rot', `${Math.round(-140 + Math.random() * 280)}deg`);
    leaf.style.setProperty('--dy', `${dy}px`);
    field.appendChild(leaf);
  }
}

// สร้างครั้งเดียวตอนเปิดแอป ไม่ผูกกับ renderLogin() เพราะ renderLogin() re-render บ่อยตอนพิมพ์/สลับแท็บ
// ถ้าสร้างใหม่ทุกครั้งแอนิเมชันจะสะดุด — #leaf-field เป็น sibling ของ .login-box ไม่ใช่ลูก จึงไม่โดน re-render ทับ
function spawnLoginLeaves() {
  spawnLeaves(document.getElementById('leaf-field'),
    { count: 12, sizeMin: 13, sizeMax: 22, durMin: 9, durMax: 14, delMax: 12 });
}

// การ์ดนักเรียนหน้าหลัก (.hero-banner) ถูก re-render ทับทุกครั้งที่ setState() ทำงาน (นำทาง/เปิดเมนู/ฯลฯ)
// จึงต้องสร้างใบไม้ใหม่ทุกครั้งใน afterRender() แทนที่จะสร้างครั้งเดียวแบบหน้า login
function spawnHeroLeaves() {
  const field = document.getElementById('hero-leaf-field');
  if (!field) return;
  field.innerHTML = '';
  spawnLeaves(field, { count: 7, sizeMin: 11, sizeMax: 17, durMin: 6, durMax: 9, delMax: 7 });
}

// วงสีสันกระจายจากกึ่งกลาง element ที่แตะ — ลบตัวเองทิ้งเมื่อแอนิเมชันจบ (ไม่ต้องผูกกับ render())
function spawnTapPulse(el) {
  if (!el) return;
  const pulse = document.createElement('span');
  pulse.className = 'qr-tap-pulse';
  const size = Math.max(el.offsetWidth, el.offsetHeight) * 0.9;
  pulse.style.width = `${size}px`;
  pulse.style.height = `${size}px`;
  pulse.style.left = `${(el.offsetWidth - size) / 2}px`;
  pulse.style.top = `${(el.offsetHeight - size) / 2}px`;
  pulse.addEventListener('animationend', () => pulse.remove());
  el.appendChild(pulse);
}

// ── เสียงเอฟเฟกต์ ──
// เสียง "ได้คะแนน" (CC0 จาก Kenney.nl — Digital Audio pack, ไม่ต้องขออนุญาต/เครดิต)
// iOS Safari บล็อกการเล่นเสียงถ้า .play() ไม่ได้อยู่ใน call stack เดียวกับ user gesture ตรงๆ
// เลยต้อง "unlock" ตัว <audio> element เดิมไว้ตอนแตะครั้งแรก (synchronous) แล้วค่อยเรียก .play()
// ซ้ำได้อีกทีหลังจาก await เสร็จ (ตัว element เดิมที่เคยเล่นสำเร็จแล้วจะไม่โดนบล็อกอีก)
const pointGainedSound = new Audio('sounds/point-gained.mp3');
pointGainedSound.preload = 'auto';
pointGainedSound.volume = 0.6;
let _audioUnlocked = false;
function unlockAudio() {
  if (_audioUnlocked) return;
  pointGainedSound.play().then(() => {
    pointGainedSound.pause();
    pointGainedSound.currentTime = 0;
    _audioUnlocked = true;
  }).catch(() => {});
}
function playPointGainedSound() {
  try {
    pointGainedSound.currentTime = 0;
    pointGainedSound.play().catch(() => {});
  } catch {}
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  render();
  spawnLoginLeaves();
  loadGlobalSettings();
  restoreSession();
});
