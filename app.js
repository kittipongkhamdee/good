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
  layout: 'A',
  toast: null,
  _toastTimer: null,
  loading: false,
  authError: '',

  student: null,          // { student_id, student_code, student_name, prefix, grade_level, room, total_points, badge_level, rank, redeem_count, total_deeds }
  studentHistory: [],
  studentRedemptions: [],
  leaderboard: [],

  staffUser: null,        // { id, full_name, role, is_admin }

  deedTypes: [],
  rewards: [],
  students: [],
  studentsCount: 0,
  studentSearch: '',
  pointLogs: [],
  reportSummary: null,

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
  ],
  admin: [
    { id: 'admin-dashboard',  icon: '📊', label: 'Dashboard' },
    { id: 'admin-students',   icon: '👩‍🎓', label: 'นักเรียน' },
    { id: 'admin-deedtypes',  icon: '💚', label: 'ความดี' },
    { id: 'admin-rewards',    icon: '🎁', label: 'รางวัล' },
    { id: 'admin-reports',    icon: '📈', label: 'รายงาน' },
  ],
};

// ── Badge tiers (must match SQL thresholds in student_points view) ──
function getBadge(pts) {
  if (pts >= 5000) return { label: 'คนดีต้นแบบ',    color: '#f59e0b', icon: '👑', nextLabel: null,           nextPts: null };
  if (pts >= 1000) return { label: 'คนดีระดับสูง',  color: '#8b5cf6', icon: '⭐', nextLabel: 'คนดีต้นแบบ',   nextPts: 5000 };
  if (pts >= 500)  return { label: 'คนดีระดับกลาง', color: '#3b82f6', icon: '🌟', nextLabel: 'คนดีระดับสูง', nextPts: 1000 };
  if (pts >= 100)  return { label: 'คนดีระดับต้น',  color: 'var(--g)', icon: '🌱', nextLabel: 'คนดีระดับกลาง', nextPts: 500 };
  return             { label: 'ผู้เริ่มต้น',         color: '#6b7280', icon: '🌿', nextLabel: 'คนดีระดับต้น', nextPts: 100 };
}

function fullName(s) { return `${s.prefix || ''}${s.student_name || ''}`; }
function classOf(s)   { return `${s.grade_level || ''}/${s.room || ''}`; }

// ── setState + render ──
function setState(updates) {
  Object.assign(state, updates);
  render();
}

// ── Main render ──
function render() {
  const loggedIn = !!state.role;

  document.getElementById('login-view').style.display = loggedIn ? 'none' : '';
  document.getElementById('app-a').style.display      = (loggedIn && state.layout === 'A') ? 'block' : 'none';
  document.getElementById('app-b').style.display      = (loggedIn && state.layout === 'B') ? 'flex' : 'none';

  if (!loggedIn) {
    renderLogin();
    return;
  }

  const title = TITLES[state.screen] || state.screen;
  const roleLabel = { student: 'นักเรียน', teacher: 'ครู', admin: 'Admin' }[state.role];
  const avatar = { student: '👧', teacher: '👨‍🏫', admin: '🛡️' }[state.role];
  const displayName = state.role === 'student' ? fullName(state.student) : (state.staffUser?.full_name || '');

  document.getElementById('title-a').textContent = title;
  document.getElementById('badge-a').textContent = roleLabel;
  document.getElementById('avatar-a').textContent = avatar;

  document.getElementById('title-b').textContent = title;
  document.getElementById('badge-b').textContent = roleLabel;
  document.getElementById('avatar-b').textContent = avatar;
  document.getElementById('role-name-b').textContent = displayName;

  document.getElementById('layout-toggle-btn').textContent =
    state.layout === 'A' ? '⇄ Layout B: Sidebar' : '⇄ Layout A: Bottom Nav';

  renderBottomNav();
  renderSidebar();

  const html = renderScreen(state.screen);
  if (state.layout === 'A') {
    document.getElementById('content-a').innerHTML = html;
    document.getElementById('content-b').innerHTML = '';
  } else {
    document.getElementById('content-a').innerHTML = '';
    document.getElementById('content-b').innerHTML = html;
  }

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
function renderBottomNav() {
  const items = NAV[state.role] || [];
  document.getElementById('nav-a').innerHTML = items.map(it => `
    <button class="bnav-btn ${state.screen === it.id ? 'active' : ''}" data-action="nav" data-screen="${it.id}">
      <span class="bnav-icon">${it.icon}</span>
      <span class="bnav-label">${it.label}</span>
    </button>
  `).join('');
}

// ── Sidebar ──
function renderSidebar() {
  const items = NAV[state.role] || [];
  const nav = items.map(it => `
    <button class="snav-btn ${state.screen === it.id ? 'active' : ''}" data-action="nav" data-screen="${it.id}">
      <span class="snav-icon">${it.icon}</span>${it.label}
    </button>
  `).join('');

  document.getElementById('sidebar-b').innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-name">🌿 ตาเบาวิทยา</div>
      <div class="sidebar-brand-sub">ระบบคะแนนความดี</div>
    </div>
    <nav class="sidebar-nav">${nav}</nav>
    <div class="sidebar-footer">
      <button class="sidebar-logout" data-action="logout">🚪 ออกจากระบบ</button>
    </div>
  `;
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
        <div style="width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:28px;border:2.5px solid rgba(255,255,255,0.45);flex-shrink:0;">👧</div>
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
      <div class="qr-display"><div class="qr-frame"><canvas id="student-qr" width="110" height="110"></canvas></div></div>
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
  const allBadges = [
    { icon: '🌿', label: 'ผู้เริ่มต้น',    range: '0 – 99 คะแนน',        min: 0,    color: '#6b7280' },
    { icon: '🌱', label: 'คนดีระดับต้น',   range: '100 – 499 คะแนน',    min: 100,  color: 'var(--g)' },
    { icon: '🌟', label: 'คนดีระดับกลาง', range: '500 – 999 คะแนน',    min: 500,  color: '#3b82f6' },
    { icon: '⭐', label: 'คนดีระดับสูง',  range: '1,000 – 4,999 คะแนน',min: 1000, color: '#8b5cf6' },
    { icon: '👑', label: 'คนดีต้นแบบ',    range: '5,000+ คะแนน',        min: 5000, color: '#f59e0b' },
  ];
  const progressPct = badge.nextPts ? Math.round(((pts - prevTier(pts)) / (badge.nextPts - prevTier(pts))) * 100) : 100;

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
          <span>${prevTier(pts)}</span>
          <span>${badge.nextLabel ? `อีก ${badge.nextPts - pts} → ${badge.nextLabel}` : 'ระดับสูงสุดแล้ว'}</span>
          <span>${badge.nextPts || ''}</span>
        </div>
      </div>
    </div>
    <div class="badge-grid">
      ${allBadges.map(b => {
        const unlocked = pts >= b.min;
        return `
        <div class="badge-card ${unlocked ? 'unlocked' : ''}" style="${unlocked ? `border-color:${b.color}30;box-shadow:0 2px 12px ${b.color}28;` : 'opacity:0.55;'}">
          <div class="badge-card-icon" style="${unlocked ? '' : 'filter:grayscale(1);'}">${b.icon}</div>
          <div class="badge-card-name" style="color:${unlocked ? b.color : '#9ca3af'};">${b.label}</div>
          <div class="badge-card-range">${b.range}</div>
          <div class="badge-status ${unlocked ? 'unlocked' : ''}" style="${unlocked ? `background:${b.color}18;color:${b.color};` : ''}">
            ${unlocked ? '✓ ปลดล็อคแล้ว' : '🔒 ล็อคอยู่'}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function prevTier(pts) {
  if (pts >= 5000) return 5000;
  if (pts >= 1000) return 1000;
  if (pts >= 500) return 500;
  if (pts >= 100) return 100;
  return 0;
}

function renderStudentLeaderboard() {
  const top = state.leaderboard;
  if (!top.length) return loadingBlock();

  const podium = top.length >= 3 ? [top[1], top[0], top[2]] : top;
  const heights = [130, 155, 110];
  const colors  = ['#C0C0C0', '#FFD700', '#CD7F32'];
  const textClr = ['#fff', '#78350f', '#fff'];
  const rest = top.slice(3);
  const myCode = state.student?.student_code;

  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        <div style="font-size:22px;font-weight:700;">🏆 อันดับนักเรียนดีเด่น</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">เรียงตามคะแนนสะสม</div>
      </div>
    </div>

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
        <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto;border:2.5px solid rgba(255,255,255,0.45);">👧</div>
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
        <div style="width:60px;height:60px;border-radius:50%;background:var(--g);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;box-shadow:0 4px 14px oklch(0.52 0.17 145 / 0.4);">👧</div>
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
          <span style="font-size:22px;">👤</span>
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

function afterRender() {
  const qrCanvas = document.getElementById('student-qr');
  if (qrCanvas && typeof QRCode !== 'undefined' && state.student) {
    QRCode.toCanvas(qrCanvas, JSON.stringify({ student_code: state.student.student_code }), {
      width: 110, color: { dark: '#1a4d1a', light: '#ffffff' },
    });
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
      <div class="modal-sheet" onclick="event.stopPropagation()">
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

  const [{ data: history }, { data: leaderboard }, { data: rewards }] = await Promise.all([
    getStudentHistory(code, 30),
    getLeaderboard(10),
    getRewards(),
  ]);

  setState({
    loading: false, role: 'student', screen: 'student-dashboard',
    student, studentHistory: history || [], leaderboard: leaderboard || [], rewards: rewards || [],
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

  setState({ loading: false, role, screen, staffUser: profile });
  await loadDataForScreen(screen);
  showToast(`ยินดีต้อนรับ ${profile.full_name}! 🌿`);
}

async function doLogout() {
  stopScan();
  if (state.role === 'teacher' || state.role === 'admin') await staffLogout();
  Object.assign(state, {
    screen: 'login', authView: null, role: null, authError: '',
    student: null, studentHistory: [], studentRedemptions: [], leaderboard: [],
    staffUser: null, deedTypes: [], rewards: [], students: [], pointLogs: [],
    reportSummary: null, scanStep: 0, scanStudent: null, selectedDeedId: null, points: 10,
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
    const [{ data: summary }, { data: logs }] = await Promise.all([getReportSummary(), getPointLogs({ limit: 6 })]);
    state.reportSummary = summary;
    state.pointLogs = logs || [];
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
}

// ══════════════════════════════════════════════
// Event Handling
// ══════════════════════════════════════════════

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;

  switch (action) {
    case 'toggle-layout':
      setState({ layout: state.layout === 'A' ? 'B' : 'A' });
      break;

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

    case 'search-students-submit': {
      state.studentSearch = document.getElementById('student-search')?.value.trim() || '';
      const { data, count } = await getStudents({ search: state.studentSearch, limit: 20 });
      setState({ students: data || [], studentsCount: count || 0 });
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

    case 'toggle-reward': {
      const active = btn.dataset.active === 'true';
      const { error } = await updateReward(btn.dataset.id, { active: !active });
      if (error) { showToast(`เกิดข้อผิดพลาด: ${error}`); break; }
      showToast(`${!active ? 'เปิด' : 'ปิด'}ใช้งาน: ${btn.dataset.name}`);
      await loadDataForScreen('admin-rewards');
      render();
      break;
    }

    case 'close-modal':
      closeModal();
      break;
  }
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  render();
});
