/* =============================================
   ตาเบาวิทยา — Main App Logic (Real Supabase Backend)
   นักเรียน: เข้าด้วยรหัสนักเรียนอย่างเดียว (ไม่มีรหัสผ่าน)
   ครู/แอดมิน: เข้าด้วยอีเมล+รหัสผ่านจริงผ่าน Supabase Auth
   ============================================= */
'use strict';

// ── State ──
const state = {
  screen: 'login',
  authView: null,     // null | 'student' | 'staff'
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
  students: [],
  studentsCount: 0,
  studentSearch: '',
  pointLogs: [],
  reportSummary: null,
  reportError: null,
  reportLeaderboard: null,
  badgeTiers: [],
  settings: { leaderboardEnabled: true, leaderboardTopN: 10 },
  rolePermissions: { 'admin-deedtypes': true, 'admin-rewards': true, 'admin-reports': true },

  scanStep: 0,
  scanStudentCode: '',
  scanStudent: null,
  selectedDeedId: null,
  points: 10,
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
  'admin-dashboard':   'Admin Dashboard',
  'admin-students':    'จัดการนักเรียน',
  'admin-deedtypes':   'ประเภทความดี',
  'admin-rewards':     'จัดการรางวัล',
  'admin-reports':     'รายงาน',
  'admin-badges':      'จัดการ Badge',
  'admin-settings':    'ตั้งค่าระบบ',
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
    { id: 'admin-reports',    icon: '📈', label: 'รายงาน' },
    { id: 'admin-badges',     icon: '🏅', label: 'Badge' },
    { id: 'admin-settings',   icon: '⚙️', label: 'ตั้งค่า' },
  ],
};

// Screens an Admin can individually enable/disable for teachers (state.rolePermissions).
// Anything not listed here is always visible to teachers (or Admin-only, like Badge/ตั้งค่า).
const TEACHER_CONFIGURABLE_SCREENS = ['admin-deedtypes', 'admin-rewards', 'admin-reports'];

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
function classOf(s)   { return `${s.grade_level || ''}/${s.room || ''}`; }

// รูปโปรไฟล์นักเรียน — แสดงรูปจริงถ้ามี (เก็บใน Supabase Storage) ไม่งั้นแสดง emoji แทน
function studentAvatar(s, { size = 60, fontSize = 26, bg = 'rgba(255,255,255,0.18)', border = '2.5px solid rgba(255,255,255,0.45)', margin = '', shadow = '' } = {}) {
  const common = `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;border:${border};${margin ? `margin:${margin};` : ''}${shadow ? `box-shadow:${shadow};` : ''}`;
  if (s?.photo_url) {
    return `<img src="${s.photo_url}" alt="" style="${common}object-fit:cover;display:block;">`;
  }
  return `<div style="${common}background:${bg};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;">👧</div>`;
}

// ย่อ+บีบอัดรูปฝั่ง browser ก่อนอัปโหลด (ประหยัดทั้ง storage และ bandwidth ของ Supabase)
// avatar ที่ใหญ่ที่สุดในแอปแสดงแค่ 120px — ย่อเหลือ 480px ก็เผื่อจอ retina ไว้เกินพอแล้ว
function compressImageFile(file, { maxSize = 480, quality = 0.82 } = {}) {
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
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('compress failed')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
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
  const avatar = { student: '👧', teacher: '👨‍🏫', admin: '🛡️' }[dRole];

  document.getElementById('title-a').textContent = title;
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
  if (state.authView === 'student') {
    box.innerHTML = studentLoginFormHTML();
  } else if (state.authView === 'staff') {
    box.innerHTML = staffLoginFormHTML();
  } else {
    box.innerHTML = roleSelectHTML();
  }
}

function roleSelectHTML() {
  return `
    <div class="login-logo">
      <div class="logo-icon">🌿</div>
      <h1>ตาเบาวิทยา</h1>
      <p>ระบบสะสมคะแนนความดีนักเรียน</p>
    </div>
    <div class="role-cards">
      <button class="role-card" data-action="show-auth" data-view="student">
        <div class="role-icon" style="background:var(--gl);">👩‍🎓</div>
        <div class="role-info">
          <div class="role-name">นักเรียน</div>
          <div class="role-desc">เข้าด้วยรหัสนักเรียน</div>
        </div>
        <div class="role-arrow">›</div>
      </button>
      <button class="role-card" data-action="show-auth" data-view="staff">
        <div class="role-icon" style="background:oklch(0.93 0.07 200);">👨‍🏫</div>
        <div class="role-info">
          <div class="role-name">ครู / เจ้าหน้าที่</div>
          <div class="role-desc">เข้าด้วยอีเมลและรหัสผ่าน</div>
        </div>
        <div class="role-arrow">›</div>
      </button>
    </div>
    <p class="login-note">เชื่อมต่อฐานข้อมูลจริง — ตาเบาวิทยา</p>
  `;
}

function studentLoginFormHTML() {
  return `
    <div class="login-logo">
      <div class="logo-icon">👩‍🎓</div>
      <h1>เข้าสู่ระบบนักเรียน</h1>
      <p>กรอกรหัสนักเรียนของคุณ</p>
    </div>
    <div class="form-group">
      <label class="form-label">รหัสนักเรียน</label>
      <input class="form-input" id="student-code-input" placeholder="เช่น 65001" autofocus
             style="font-size:18px;text-align:center;letter-spacing:1px;">
    </div>
    ${state.authError ? `<div style="color:#dc2626;font-size:13px;margin-bottom:10px;text-align:center;">${state.authError}</div>` : ''}
    <button class="btn-green" data-action="submit-student-login" style="padding:14px;" ${state.loading ? 'disabled' : ''}>
      ${state.loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
    </button>
    <button data-action="back-to-roles" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;font-size:13px;">← กลับ</button>
  `;
}

function staffLoginFormHTML() {
  return `
    <div class="login-logo">
      <div class="logo-icon">👨‍🏫</div>
      <h1>เข้าสู่ระบบเจ้าหน้าที่</h1>
      <p>สำหรับครูและผู้ดูแลระบบ</p>
    </div>
    <div class="form-group">
      <label class="form-label">อีเมล</label>
      <input class="form-input" type="email" id="staff-email-input" placeholder="you@taobao.ac.th">
    </div>
    <div class="form-group">
      <label class="form-label">รหัสผ่าน</label>
      <input class="form-input" type="password" id="staff-password-input" placeholder="••••••••">
    </div>
    ${state.authError ? `<div style="color:#dc2626;font-size:13px;margin-bottom:10px;text-align:center;">${state.authError}</div>` : ''}
    <button class="btn-green" data-action="submit-staff-login" style="padding:14px;" ${state.loading ? 'disabled' : ''}>
      ${state.loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
    </button>
    <button data-action="back-to-roles" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;font-size:13px;">← กลับ</button>
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
      <div class="sidebar-brand-name">🌿 ตาเบาวิทยา</div>
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
    'admin-dashboard':     renderAdminDashboard,
    'admin-students':      renderAdminStudents,
    'admin-deedtypes':     renderAdminDeedTypes,
    'admin-rewards':       renderAdminRewards,
    'admin-reports':       renderAdminReports,
    'admin-badges':        renderAdminBadges,
    'admin-settings':      renderAdminSettings,
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
      <div style="display:flex;align-items:center;gap:14px;">
        ${studentAvatar(s, { size: 62, fontSize: 28 })}
        <div>
          <div style="font-size:18px;font-weight:700;line-height:1.2;">${fullName(s)}</div>
          <div style="font-size:12px;opacity:0.8;margin-top:3px;">${classOf(s)} · รหัส ${s.student_code}</div>
          <div style="margin-top:6px;display:inline-block;background:rgba(255,255,255,0.2);border-radius:20px;padding:2px 10px;font-size:12px;">${badge.icon} ${s.badge_level}</div>
        </div>
      </div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.18);display:flex;align-items:flex-end;justify-content:space-between;">
        <div>
          <div style="font-size:12px;opacity:0.75;">คะแนนสะสมทั้งหมด</div>
          <div style="font-size:44px;font-weight:700;line-height:1;margin-top:2px;">${s.total_points.toLocaleString()}</div>
          <div style="font-size:13px;opacity:0.7;margin-top:2px;">คะแนน</div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:0.75;">
          <div>ทำความดีแล้ว</div>
          <div style="font-size:30px;font-weight:700;line-height:1;">${s.total_deeds}</div>
          <div>ครั้ง</div>
        </div>
      </div>
    </div>

    <div class="stat-grid-3">
      ${statBox('🥇', `#${s.rank}`, 'อันดับที่', '#f59e0b')}
      ${statBox('🎖️', String(unlockedBadgeCount(s.total_points)), 'Badge', '#8b5cf6')}
      ${statBox('🎁', String(s.redeem_count), 'แลกรางวัล', '#ef4444')}
    </div>

    <div class="card">
      <div style="font-size:14px;font-weight:700;color:var(--gd);margin-bottom:12px;text-align:center;">📲 QR Code ประจำตัวนักเรียน</div>
      <div class="qr-display"><div class="qr-frame"><canvas id="student-qr" width="220" height="220"></canvas></div></div>
      <div style="text-align:center;margin-top:10px;font-size:12px;color:#9ca3af;">รหัส ${s.student_code} · ${classOf(s)} · ตาเบาวิทยา</div>
    </div>

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
  const recent = state.pointLogs.slice(0, 3);
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

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">⏱️ ให้คะแนนล่าสุด</div>
      ${recent.length
        ? recent.map(l => listRow('👧', `${fullName(l.students)} · ${classOf(l.students)}`, `${l.good_deed_types?.name || ''} · ${formatDate(l.created_at)}`, `+${l.points}`)).join('')
        : `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
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
          <video id="qr-video" autoplay playsinline muted style="display:none;"></video>
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
        <input class="form-input" placeholder="เช่น 65001" id="add-student-code">
      </div>
      <div class="form-group">
        <label class="form-label">ชื่อ-สกุล (อัตโนมัติ)</label>
        <input class="form-input" id="add-student-name" readonly placeholder="ค้นหาจากรหัสนักเรียน">
      </div>
      <div class="form-group">
        <label class="form-label">ประเภทความดี *</label>
        <select class="form-input" id="add-deed-type">
          <option value="">เลือกประเภท...</option>
          ${deedTypes.map(d => `<option value="${d.id}">${d.icon} ${d.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">คะแนน *</label>
        <input class="form-input" type="number" value="10" min="1" max="100" id="add-points">
      </div>
      <div class="form-group">
        <label class="form-label">หมายเหตุ</label>
        <textarea class="form-input" rows="3" placeholder="รายละเอียดเพิ่มเติม..." id="add-note" style="resize:none;"></textarea>
      </div>
      <button class="btn-green" data-action="submit-addpoints" style="padding:14px;" ${state.loading ? 'disabled' : ''}>
        ${state.loading ? 'กำลังบันทึก...' : '✅ บันทึกคะแนน'}
      </button>
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
        ? logs.map(l => listRow('👧', `${fullName(l.students)} · ${classOf(l.students)}`, `${l.good_deed_types?.name || ''} · ${formatDate(l.created_at)} · ${l.profiles?.full_name || ''}`, `+${l.points}`)).join('')
        : `<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีประวัติ</div>`}
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
        <div style="font-size:22px;font-weight:700;">🏫 ตาเบาวิทยา</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">แผงควบคุมผู้ดูแลระบบ</div>
      </div>
    </div>
    <div class="stat-grid-2">
      ${statBox('👩‍🎓', r.studentCount.toLocaleString(), 'นักเรียน', 'var(--g)')}
      ${statBox('👨‍🏫', r.teacherCount.toLocaleString(), 'ครู/เจ้าหน้าที่', '#3b82f6')}
      ${statBox('💚', r.totalPoints.toLocaleString(), 'คะแนนรวม', '#8b5cf6')}
      ${statBox('📋', r.logCount.toLocaleString(), 'รายการความดี', '#f59e0b')}
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
      ${state.pointLogs.slice(0, 4).map(l => listRow('👧', `${fullName(l.students)} ได้รับ ${l.points} คะแนน`, `${l.good_deed_types?.name || ''} · ${formatDate(l.created_at)}`, '')).join('')
        || `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">ยังไม่มีกิจกรรม</div>`}
    </div>
  </div>`;
}

function renderAdminStudents() {
  const students = state.students;
  return `
  <div class="screen-wrap anim-slideup">
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
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${classOf(s)} · ${s.total_points.toLocaleString()} คะแนน · ${s.badge_level}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderAdminDeedTypes() {
  const types = state.deedTypes;
  return `
  <div class="screen-wrap anim-slideup">
    <button class="btn-green" data-action="open-add-deed" style="padding:14px;">+ เพิ่มประเภทความดีใหม่</button>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${types.map(t => `
        <div class="list-item">
          <span style="font-size:24px;">${t.icon}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${t.name}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${t.points_min}–${t.points_max} คะแนน</div>
          </div>
          <div class="action-btns">
            <button class="btn-edit" data-action="open-edit-deed" data-id="${t.id}">✏️</button>
            <button class="btn-del" data-action="del-deed" data-id="${t.id}" data-name="${t.name}">🗑️</button>
          </div>
        </div>
      `).join('')}
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
      ${statBox('👩‍🎓', r.studentCount.toLocaleString(), 'นักเรียนทั้งหมด', 'var(--g)')}
      ${statBox('💚', r.totalPoints.toLocaleString(), 'คะแนนรวม', '#3b82f6')}
      ${statBox('📋', r.logCount.toLocaleString(), 'รายการความดี', '#8b5cf6')}
      ${statBox('👨‍🏫', r.teacherCount.toLocaleString(), 'ครู/เจ้าหน้าที่', '#f59e0b')}
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">🏆 อันดับนักเรียน (คะแนนสะสม)</div>
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
    { key: 'admin-reports',   label: 'รายงาน', desc: 'ดูรายงานสรุปคะแนนความดี' },
  ];

  return `
  <div class="screen-wrap anim-slideup">
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

function statBox(icon, val, lbl, color) {
  return `<div class="stat-box"><div class="stat-icon">${icon}</div><div class="stat-val" style="color:${color};">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
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

// เมื่อโหลด library สร้าง QR Code ไม่สำเร็จ (เช่น เครือข่ายบล็อก CDN)
// แสดงรหัสนักเรียนตัวใหญ่แทน เพื่อให้ครูยังคีย์รหัสด้วยมือได้
function showQrFallback(canvas, studentCode) {
  const frame = canvas.closest('.qr-frame');
  if (!frame) return;
  frame.innerHTML = `
    <div style="width:220px;height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px;">
      <div style="font-size:32px;">⚠️</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:6px;">โหลด QR ไม่สำเร็จ</div>
      <div style="font-size:24px;font-weight:700;color:var(--gd);margin-top:6px;">${studentCode}</div>
    </div>`;
}

function afterRender() {
  const qrCanvas = document.getElementById('student-qr');
  if (qrCanvas && state.student) {
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(qrCanvas, JSON.stringify({ student_code: state.student.student_code }), {
        width: 220, color: { dark: '#1a4d1a', light: '#ffffff' },
      }, (err) => { if (err) showQrFallback(qrCanvas, state.student.student_code); });
    } else {
      showQrFallback(qrCanvas, state.student.student_code);
    }
  }

  const rangeInput = document.getElementById('pts-range');
  if (rangeInput) {
    rangeInput.addEventListener('input', () => {
      const v = parseInt(rangeInput.value);
      state.points = v;
      const display = document.getElementById('pts-display');
      if (display) display.textContent = v;
      const pct = ((v - 5) / 45) * 100;
      rangeInput.style.background = `linear-gradient(to right, var(--g) ${pct}%, #e5e7eb ${pct}%)`;
    });
  }

  const codeInput = document.getElementById('add-student-code');
  if (codeInput) {
    codeInput.addEventListener('input', async () => {
      const code = codeInput.value.trim();
      const nameField = document.getElementById('add-student-name');
      if (code.length >= 3) {
        const { data } = await getStudentByCode(code);
        if (nameField) nameField.value = data ? fullName(data) : 'ไม่พบนักเรียน';
      } else if (nameField) {
        nameField.value = '';
      }
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

// ══════════════════════════════════════════════
// Auth actions
// ══════════════════════════════════════════════

async function submitStudentLogin() {
  const code = document.getElementById('student-code-input')?.value.trim();
  if (!code) { setState({ authError: 'กรุณากรอกรหัสนักเรียน' }); return; }
  setState({ loading: true, authError: '' });
  const { student, error } = await studentLogin(code);
  if (error || !student) { setState({ loading: false, authError: error || 'ไม่พบรหัสนักเรียนนี้' }); return; }

  const [{ data: history }, { data: leaderboard }, { data: rewards }, { data: badgeTiers }, { data: settings }] = await Promise.all([
    getStudentHistory(code, 30),
    getLeaderboard({ limit: 10 }),
    getRewards(),
    getBadgeTiers(),
    getAppSettings(),
  ]);

  setState({
    loading: false, role: 'student', screen: 'student-dashboard',
    student, studentHistory: history || [], leaderboard: leaderboard || [], rewards: rewards || [],
    badgeTiers: badgeTiers || [], settings: settings || state.settings, leaderboardScope: 'school',
  });
  showToast(`ยินดีต้อนรับ ${fullName(student)}! 🌿`);
}

async function submitStaffLogin() {
  const email = document.getElementById('staff-email-input')?.value.trim();
  const password = document.getElementById('staff-password-input')?.value;
  if (!email || !password) { setState({ authError: 'กรุณากรอกอีเมลและรหัสผ่าน' }); return; }
  setState({ loading: true, authError: '' });
  const { profile, error } = await staffLogin(email, password);
  if (error || !profile) { setState({ loading: false, authError: error || 'เข้าสู่ระบบไม่สำเร็จ' }); return; }

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
  showToast(`ยินดีต้อนรับ ${profile.full_name}! 🌿`);
}

async function doLogout() {
  stopScan();
  if (state.role === 'teacher' || state.role === 'admin') await staffLogout();
  Object.assign(state, {
    screen: 'login', authView: null, role: null, previewAsTeacher: false, authError: '', drawerOpen: false,
    student: null, studentHistory: [], studentRedemptions: [], leaderboard: null, leaderboardScope: 'school',
    staffUser: null, deedTypes: [], rewards: [], students: [], pointLogs: [], badgeTiers: [],
    reportSummary: null, reportError: null, reportLeaderboard: null, scanStep: 0, scanStudent: null, selectedDeedId: null, points: 10,
    settings: { leaderboardEnabled: true, leaderboardTopN: 10 },
    rolePermissions: { 'admin-deedtypes': true, 'admin-rewards': true, 'admin-reports': true },
  });
  render();
  showToast('ออกจากระบบแล้ว');
}

// ══════════════════════════════════════════════
// Data loaders per screen
// ══════════════════════════════════════════════

async function loadDataForScreen(screen) {
  if (screen === 'teacher-dashboard' || screen === 'teacher-history') {
    const { data } = await getPointLogs({ limit: 20 });
    state.pointLogs = data || [];
  }
  if (screen === 'teacher-scan' || screen === 'teacher-addpoints') {
    const { data } = await getDeedTypes();
    state.deedTypes = data || [];
  }
  if (screen === 'admin-dashboard' || screen === 'admin-reports') {
    const tasks = [getReportSummary(), getPointLogs({ limit: 6 })];
    if (screen === 'admin-reports') tasks.push(getLeaderboard({ limit: 100 }));
    const [{ data: summary, error: reportError }, { data: logs }, leaderboardResult] = await Promise.all(tasks);
    state.reportSummary = summary;
    state.reportError = reportError || null;
    state.pointLogs = logs || [];
    if (leaderboardResult) state.reportLeaderboard = leaderboardResult.data || [];
  }
  if (screen === 'admin-students') {
    const { data, count } = await getStudents({ search: state.studentSearch, limit: 20 });
    state.students = data || [];
    state.studentsCount = count || 0;
  }
  if (screen === 'admin-deedtypes') {
    const { data } = await getDeedTypes();
    state.deedTypes = data || [];
  }
  if (screen === 'admin-rewards') {
    const { data } = await getRewards();
    state.rewards = data || [];
  }
  if (screen === 'admin-badges') {
    const { data } = await getBadgeTiers();
    state.badgeTiers = data || [];
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

document.addEventListener('change', (e) => {
  if (e.target.id !== 'student-photo-file') return;
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
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;

  switch (action) {
    case 'show-auth':
      setState({ authView: btn.dataset.view, authError: '' });
      break;

    case 'back-to-roles':
      setState({ authView: null, authError: '' });
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
      const screen = btn.dataset.screen;
      setState({ loading: true });
      await loadDataForScreen(screen);
      setState({ loading: false, screen, scanStep: 0, selectedDeedId: null, scanStudent: null });
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
      const screen = btn.dataset.screen;
      setState({ loading: true });
      await loadDataForScreen(screen);
      setState({ loading: false, screen, scanStep: 0, selectedDeedId: null, scanStudent: null });
      break;
    }

    case 'go-profile':
      if (state.role === 'student') setState({ screen: 'student-profile' });
      break;

    case 'start-scan':
      startScan();
      break;

    case 'reset-scan':
      stopScan();
      setState({ scanStep: 0, selectedDeedId: null, scanStudent: null });
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

    case 'submit-addpoints': {
      const code = document.getElementById('add-student-code')?.value.trim();
      const deedTypeId = parseInt(document.getElementById('add-deed-type')?.value);
      const points = parseInt(document.getElementById('add-points')?.value);
      const note = document.getElementById('add-note')?.value || '';
      if (!code || !deedTypeId || !points) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      setState({ loading: true });
      const { error } = await addPointLog({ studentCode: code, deedTypeId, points, note });
      setState({ loading: false });
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast('บันทึกคะแนนสำเร็จ! ✅');
      await loadDataForScreen('teacher-dashboard');
      setState({ screen: 'teacher-dashboard' });
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
      const { data, count } = await getStudents({ search: state.studentSearch, limit: 20 });
      setState({ students: data || [], studentsCount: count || 0 });
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
               style="width:120px;height:120px;border-radius:50%;background:#f3f4f6;align-items:center;justify-content:center;font-size:48px;margin:0 auto;display:${s.photo_url ? 'none' : 'flex'};">👧</div>
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
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="new-deed-icon" value="🌱"></div>
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
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="edit-deed-icon" value="${dt.icon}"></div>
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

    case 'open-add-reward':
      showModal(`
        <div class="modal-title">➕ เพิ่มรางวัลใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน</label><input class="form-input" id="new-rw-icon" value="🎁"></div>
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
        <div class="form-group"><label class="form-label">ไอคอน</label><input class="form-input" id="edit-rw-icon" value="${r.icon}"></div>
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

    case 'open-add-badge':
      showModal(`
        <div class="modal-title">➕ เพิ่ม Badge ใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="new-badge-icon" value="🏅"></div>
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
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="edit-badge-icon" value="${t.icon}"></div>
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
      setState({ loading: false, previewAsTeacher: entering, screen, scanStep: 0, selectedDeedId: null, scanStudent: null });
      showToast(entering ? 'กำลังดูมุมมองครู 🧑‍🏫' : 'กลับสู่มุมมอง Admin');
      break;
    }

    case 'save-all-settings': {
      const topN = parseInt(document.getElementById('top-n-input')?.value) || 10;
      setState({ loading: true });
      const permKeys = ['admin-deedtypes', 'admin-rewards', 'admin-reports'];
      const results = await Promise.all([
        updateAppSetting('leaderboard_enabled', state.settings.leaderboardEnabled ? 'true' : 'false'),
        updateAppSetting('leaderboard_top_n', topN),
        ...permKeys.map(k => updateRolePermission(k, state.rolePermissions[k] !== false)),
      ]);
      const firstError = results.map(r => r.error).find(Boolean);
      setState({ loading: false, settings: { ...state.settings, leaderboardTopN: topN } });
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

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  render();
});
