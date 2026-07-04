/* =============================================
   ตาเบาวิทยา — Main App Logic (Vanilla JS SPA)
   ============================================= */
'use strict';

// ── State ──
const state = {
  screen: 'login',
  role: null,
  layout: 'A',
  user: null,
  toast: null,
  _toastTimer: null,
  scanStep: 0,
  selectedDeed: '',
  points: 10,
  scanning: false,
  _videoStream: null,
  _scanRaf: null,
  students: [],
  deedTypes: [],
  rewards: [],
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

// ── Nav menus per role ──
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
  ],
  admin: [
    { id: 'admin-dashboard',  icon: '📊', label: 'Dashboard' },
    { id: 'admin-students',   icon: '👩‍🎓', label: 'นักเรียน' },
    { id: 'admin-deedtypes',  icon: '💚', label: 'ความดี' },
    { id: 'admin-rewards',    icon: '🎁', label: 'รางวัล' },
    { id: 'admin-reports',    icon: '📈', label: 'รายงาน' },
  ],
};

const ROLE_META = {
  student: { label: 'นักเรียน', name: 'ด.ญ. สมหญิง ใจดี', avatar: '👧' },
  teacher: { label: 'ครู',      name: 'ครูอภิชัย มีธรรม',  avatar: '👨‍🏫' },
  admin:   { label: 'Admin',    name: 'ผู้ดูแลระบบ',        avatar: '🛡️' },
};

// ── Badge system ──
function getBadge(pts) {
  if (pts >= 5000) return { label: 'คนดีต้นแบบ',   color: '#f59e0b', icon: '👑', next: null,         nextPts: null };
  if (pts >= 1000) return { label: 'คนดีระดับสูง', color: '#8b5cf6', icon: '⭐', next: 'คนดีต้นแบบ', nextPts: 5000 };
  if (pts >= 500)  return { label: 'คนดีระดับกลาง',color: '#3b82f6', icon: '🌟', next: 'คนดีระดับสูง', nextPts: 1000 };
  if (pts >= 100)  return { label: 'คนดีระดับต้น', color: 'var(--g)', icon: '🌱', next: 'คนดีระดับกลาง', nextPts: 500 };
  return           { label: 'ผู้เริ่มต้น',         color: '#6b7280', icon: '🌿', next: 'คนดีระดับต้น', nextPts: 100 };
}

// ── setState + render ──
function setState(updates) {
  Object.assign(state, updates);
  render();
}

// ── Main render ──
function render() {
  const loggedIn = !!state.role;

  // Show/hide views
  document.getElementById('login-view').style.display = loggedIn ? 'none' : '';
  document.getElementById('app-a').style.display      = (loggedIn && state.layout === 'A') ? 'block' : 'none';
  document.getElementById('app-b').style.display      = (loggedIn && state.layout === 'B') ? 'flex' : 'none';

  if (!loggedIn) return;

  const meta = ROLE_META[state.role];
  const title = TITLES[state.screen] || state.screen;

  // Header A
  document.getElementById('title-a').textContent = title;
  document.getElementById('badge-a').textContent = meta.label;
  document.getElementById('avatar-a').textContent = meta.avatar;

  // Header B
  document.getElementById('title-b').textContent = title;
  document.getElementById('badge-b').textContent = meta.label;
  document.getElementById('avatar-b').textContent = meta.avatar;
  document.getElementById('role-name-b').textContent = meta.name;

  // Layout toggle label
  document.getElementById('layout-toggle-btn').textContent =
    state.layout === 'A' ? '⇄ Layout B: Sidebar' : '⇄ Layout A: Bottom Nav';

  // Nav
  renderBottomNav();
  renderSidebar();

  // Screen content — only inject into active layout so getElementById finds correct elements
  const html = renderScreen(state.screen);
  if (state.layout === 'A') {
    document.getElementById('content-a').innerHTML = html;
    document.getElementById('content-b').innerHTML = '';
  } else {
    document.getElementById('content-a').innerHTML = '';
    document.getElementById('content-b').innerHTML = html;
  }

  // Post-render: QR code, range slider tracking, scan loop
  afterRender();
}

// ── Bottom nav ──
function renderBottomNav() {
  const items = NAV[state.role] || [];
  document.getElementById('nav-a').innerHTML = items.map(it => `
    <button class="bnav-btn ${state.screen === it.id ? 'active' : ''}"
            data-action="nav" data-screen="${it.id}">
      <span class="bnav-icon">${it.icon}</span>
      <span class="bnav-label">${it.label}</span>
    </button>
  `).join('');
}

// ── Sidebar ──
function renderSidebar() {
  const items = NAV[state.role] || [];
  const nav = items.map(it => `
    <button class="snav-btn ${state.screen === it.id ? 'active' : ''}"
            data-action="nav" data-screen="${it.id}">
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
  const PTS = 847;
  const badge = getBadge(PTS);
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:28px;border:2.5px solid rgba(255,255,255,0.45);flex-shrink:0;">👧</div>
        <div>
          <div style="font-size:18px;font-weight:700;line-height:1.2;">ด.ญ. สมหญิง ใจดี</div>
          <div style="font-size:12px;opacity:0.8;margin-top:3px;">ม.3/2 · รหัส 65001</div>
          <div style="margin-top:6px;display:inline-block;background:rgba(255,255,255,0.2);border-radius:20px;padding:2px 10px;font-size:12px;">${badge.icon} ${badge.label}</div>
        </div>
      </div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.18);display:flex;align-items:flex-end;justify-content:space-between;">
        <div>
          <div style="font-size:12px;opacity:0.75;">คะแนนสะสมทั้งหมด</div>
          <div style="font-size:44px;font-weight:700;line-height:1;margin-top:2px;">${PTS.toLocaleString()}</div>
          <div style="font-size:13px;opacity:0.7;margin-top:2px;">คะแนน</div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:0.75;">
          <div>ทำความดีแล้ว</div>
          <div style="font-size:30px;font-weight:700;line-height:1;">23</div>
          <div>ครั้ง</div>
        </div>
      </div>
    </div>

    <div class="stat-grid-3">
      ${statBox('🥇', '5', 'อันดับที่', '#f59e0b')}
      ${statBox('🎖️', '4', 'Badge', '#8b5cf6')}
      ${statBox('🎁', '2', 'แลกรางวัล', '#ef4444')}
    </div>

    <div class="card">
      <div style="font-size:14px;font-weight:700;color:var(--gd);margin-bottom:12px;text-align:center;">📲 QR Code ประจำตัวนักเรียน</div>
      <div class="qr-display"><div class="qr-frame"><canvas id="student-qr" width="110" height="110"></canvas></div></div>
      <div style="text-align:center;margin-top:10px;font-size:12px;color:#9ca3af;">รหัส 65001 · ม.3/2 · ตาเบาวิทยา</div>
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;font-size:15px;color:var(--gd);">📋 กิจกรรมล่าสุด</div>
      ${listRow('🧹', 'เก็บขยะในห้องน้ำ', 'เมื่อวาน · ครูอภิชัย', '+10 คะแนน')}
      ${listRow('🤝', 'ช่วยเพื่อนเรียนคณิต', '2 วันก่อน · ครูสมศรี', '+15 คะแนน')}
      ${listRow('🌿', 'จิตอาสาทำความสะอาด', '5 วันก่อน · ครูวิชัย', '+20 คะแนน')}
      <button data-action="nav" data-screen="student-history"
        style="width:100%;padding:12px;border:none;background:var(--gl);color:var(--g);font-family:Kanit;font-weight:700;font-size:13px;cursor:pointer;border-radius:0 0 16px 16px;">
        ดูประวัติทั้งหมด →
      </button>
    </div>
  </div>`;
}

function renderStudentHistory() {
  const deeds = DEMO_DATA.studentHistory;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;opacity:0.8;">คะแนนสะสมทั้งหมด</div>
          <div style="font-size:36px;font-weight:700;">847</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;opacity:0.8;">ทำความดีทั้งหมด</div>
          <div style="font-size:36px;font-weight:700;">23 ครั้ง</div>
        </div>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">ประวัติความดีทั้งหมด</div>
      ${deeds.map(d => listRow(d.icon, d.name, `${d.teacher} · ${d.date}`, `+${d.pts} คะแนน`)).join('')}
    </div>
  </div>`;
}

function renderStudentBadges() {
  const PTS = 847;
  const badge = getBadge(PTS);
  const pct = Math.round(((PTS - 500) / (1000 - 500)) * 100);
  const allBadges = [
    { icon: '🌿', label: 'ผู้เริ่มต้น',    range: '0 – 99 คะแนน',       color: '#6b7280', unlocked: true },
    { icon: '🌱', label: 'คนดีระดับต้น',   range: '100 – 499 คะแนน',    color: 'var(--g)', unlocked: true },
    { icon: '🌟', label: 'คนดีระดับกลาง', range: '500 – 999 คะแนน',    color: '#3b82f6', unlocked: true },
    { icon: '⭐', label: 'คนดีระดับสูง',  range: '1,000 – 4,999 คะแนน',color: '#8b5cf6', unlocked: false },
    { icon: '👑', label: 'คนดีต้นแบบ',    range: '5,000+ คะแนน',        color: '#f59e0b', unlocked: false },
  ];
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        <div class="anim-pulse" style="font-size:52px;">${badge.icon}</div>
        <div style="font-size:20px;font-weight:700;margin-top:10px;">${badge.label}</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">847 คะแนน · เลเวลปัจจุบัน</div>
        <div class="progress-track" style="margin-top:14px;">
          <div class="progress-fill" style="width:${pct}%;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.7;margin-top:4px;">
          <span>500</span><span>อีก 153 → คนดีระดับสูง</span><span>1000</span>
        </div>
      </div>
    </div>
    <div class="badge-grid">
      ${allBadges.map(b => `
        <div class="badge-card ${b.unlocked ? 'unlocked' : ''}" style="${b.unlocked ? `border-color:${b.color}30;box-shadow:0 2px 12px ${b.color}28;` : 'opacity:0.55;'}">
          <div class="badge-card-icon" style="${b.unlocked ? '' : 'filter:grayscale(1);'}">${b.icon}</div>
          <div class="badge-card-name" style="color:${b.unlocked ? b.color : '#9ca3af'};">${b.label}</div>
          <div class="badge-card-range">${b.range}</div>
          <div class="badge-status ${b.unlocked ? 'unlocked' : ''}"
               style="${b.unlocked ? `background:${b.color}18;color:${b.color};` : ''}">
            ${b.unlocked ? '✓ ปลดล็อคแล้ว' : '🔒 ล็อคอยู่'}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderStudentLeaderboard() {
  const top = [
    { rank: 1, name: 'ด.ช. กล้าหาญ ดีงาม',  cls: 'ม.3/1', pts: 1250, icon: '🥇', mine: false },
    { rank: 2, name: 'ด.ญ. ใจดี มีน้ำใจ',    cls: 'ม.2/3', pts: 1180, icon: '🥈', mine: false },
    { rank: 3, name: 'ด.ช. รักษ์โลก สีเขียว', cls: 'ม.3/2', pts: 1050, icon: '🥉', mine: false },
    { rank: 4, name: 'ด.ญ. มานะ อดทน',       cls: 'ม.1/1', pts: 970,  mine: false },
    { rank: 5, name: 'ด.ญ. สมหญิง ใจดี',     cls: 'ม.3/2', pts: 847,  mine: true  },
    { rank: 6, name: 'ด.ช. ฉลาด คิดเก่ง',    cls: 'ม.2/1', pts: 820,  mine: false },
    { rank: 7, name: 'ด.ญ. ขยัน ตั้งใจ',     cls: 'ม.3/3', pts: 790,  mine: false },
  ];
  const podium = [top[1], top[0], top[2]];
  const heights = [130, 155, 110];
  const colors  = ['#C0C0C0', '#FFD700', '#CD7F32'];
  const textClr = ['#fff', '#78350f', '#fff'];

  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        <div style="font-size:22px;font-weight:700;">🏆 อันดับนักเรียนดีเด่น</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">ภาคเรียนที่ 1 ปีการศึกษา 2567</div>
      </div>
    </div>

    <div class="podium">
      ${podium.map((s, i) => `
        <div class="podium-col">
          <div style="font-size:26px;margin-bottom:4px;">${s.icon}</div>
          <div class="podium-name">${s.name}</div>
          <div class="podium-bar" style="height:${heights[i]}px;background:${colors[i]};color:${textClr[i]};">
            <div class="podium-rank">${s.rank}</div>
            <div class="podium-pts">${s.pts.toLocaleString()}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${top.slice(3).map(s => `
        <div class="list-item" style="background:${s.mine ? 'var(--gl)' : '#fff'};">
          <div style="width:28px;height:28px;border-radius:50%;background:${s.mine ? 'var(--g)' : '#e5e7eb'};color:${s.mine ? '#fff' : '#6b7280'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${s.rank}</div>
          <div style="flex:1;">
            <div style="font-weight:${s.mine ? 700 : 600};font-size:14px;color:${s.mine ? 'var(--gd)' : '#1f2937'};">${s.name}${s.mine ? ' ★' : ''}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${s.cls}</div>
          </div>
          <div style="font-weight:700;color:var(--g);">${s.pts.toLocaleString()}</div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderStudentRewards() {
  const rewards = DEMO_DATA.rewards;
  const PTS = 847;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;opacity:0.8;">คะแนนที่มี</div>
          <div style="font-size:34px;font-weight:700;">${PTS.toLocaleString()}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;opacity:0.8;">แลกไปแล้ว</div>
          <div style="font-size:34px;font-weight:700;">2 ครั้ง</div>
        </div>
      </div>
    </div>
    <div class="reward-grid">
      ${rewards.map(r => {
        const can = PTS >= r.pts;
        return `
        <div class="reward-card">
          <div class="reward-img" style="background:${can ? 'var(--gl)' : '#f3f4f6'};">${r.icon}</div>
          <div class="reward-body">
            <div class="reward-name">${r.name}</div>
            <div class="reward-stock">เหลือ ${r.stock} ชิ้น</div>
            <div class="reward-footer">
              <div class="reward-pts">${r.pts} แต้ม</div>
              <button class="btn-redeem ${can ? 'can' : 'cant'}"
                      data-action="redeem" data-reward-id="${r.id}"
                      data-reward-name="${r.name}" data-can="${can}">แลก</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderStudentProfile() {
  const PTS = 847;
  const badge = getBadge(PTS);
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="text-align:center;">
        <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto;border:2.5px solid rgba(255,255,255,0.45);">👧</div>
        <div style="font-size:20px;font-weight:700;margin-top:12px;">ด.ญ. สมหญิง ใจดี</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">ม.3/2 · รหัส 65001</div>
        <div style="margin-top:8px;display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:3px 14px;font-size:12px;">${badge.icon} ${badge.label} · ${PTS} คะแนน</div>
      </div>
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${[
        ['👤', 'ชื่อ-สกุล', 'ด.ญ. สมหญิง ใจดี'],
        ['🏫', 'ระดับชั้น', 'มัธยมศึกษาปีที่ 3 ห้อง 2'],
        ['🔢', 'รหัสนักเรียน', '65001'],
        ['📧', 'อีเมล', 'somying.j@taobao.ac.th'],
        ['📅', 'ปีการศึกษา', '2567'],
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

    <button data-action="logout"
      style="width:100%;padding:14px;background:#fee2e2;color:#dc2626;border:none;border-radius:12px;font-family:Kanit;font-weight:700;font-size:14px;cursor:pointer;">
      🚪 ออกจากระบบ
    </button>
  </div>`;
}

// ══════════════════════════════════════════════
// TEACHER SCREENS
// ══════════════════════════════════════════════

function renderTeacherDashboard() {
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:26px;border:2.5px solid rgba(255,255,255,0.45);flex-shrink:0;">👨‍🏫</div>
        <div>
          <div style="font-size:18px;font-weight:700;">ครูอภิชัย มีธรรม</div>
          <div style="font-size:12px;opacity:0.8;margin-top:3px;">ครูประจำวิชาคณิตศาสตร์</div>
          <div style="margin-top:6px;display:inline-block;background:rgba(255,255,255,0.18);border-radius:20px;padding:2px 10px;font-size:12px;">🏫 ม.3 ห้อง 2</div>
        </div>
      </div>
    </div>

    <div class="stat-grid-2">
      ${statBox('✅', '47', 'ให้คะแนนวันนี้', 'var(--g)')}
      ${statBox('📋', '312', 'สัปดาห์นี้', '#3b82f6')}
      ${statBox('👩‍🎓', '28', 'นักเรียนในดูแล', '#8b5cf6')}
      ${statBox('🏅', '3', 'ห้องที่รับผิดชอบ', '#f59e0b')}
    </div>

    <button data-action="nav" data-screen="teacher-scan"
      style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;background:linear-gradient(90deg,var(--gd),var(--g));color:#fff;border:none;border-radius:14px;font-family:Kanit;font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 4px 20px oklch(0.52 0.17 145 / 0.4);">
      <span style="font-size:22px;">📷</span> สแกน QR Code นักเรียน
    </button>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">⏱️ ให้คะแนนล่าสุด</div>
      ${listRow('👧', 'ด.ญ. สมหญิง ใจดี · ม.3/2', 'เก็บขยะ · วันนี้ 09:30', '+10')}
      ${listRow('👦', 'ด.ช. กล้าหาญ ดีงาม · ม.3/1', 'ช่วยครู · วันนี้ 09:15', '+15')}
      ${listRow('👧', 'ด.ญ. ขยัน ตั้งใจ · ม.3/3', 'จิตอาสา · เมื่อวาน', '+20')}
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
          <div class="qr-corner qr-tl"></div>
          <div class="qr-corner qr-tr"></div>
          <div class="qr-corner qr-bl"></div>
          <div class="qr-corner qr-br"></div>
          <div id="scan-placeholder" style="color:rgba(255,255,255,0.4);text-align:center;font-size:13px;">
            <div style="font-size:36px;margin-bottom:8px;">📷</div>
            <div>กดปุ่มด้านล่างเพื่อเปิดกล้อง</div>
          </div>
        </div>

        <button class="btn-green" data-action="start-scan" style="margin-top:14px;padding:14px;">
          📷 เปิดกล้องสแกน QR Code
        </button>
        <div style="text-align:center;margin-top:10px;font-size:12px;color:#9ca3af;">หรือ</div>
        <button data-action="sim-scan"
          style="width:100%;margin-top:8px;padding:12px;background:var(--gl);color:var(--gd);border:none;border-radius:12px;font-family:Kanit;font-weight:600;font-size:13px;cursor:pointer;">
          ✅ จำลองการสแกน (Demo)
        </button>
        <button data-action="nav" data-screen="teacher-addpoints"
          style="width:100%;margin-top:8px;padding:12px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;border-radius:12px;font-family:Kanit;font-weight:600;font-size:13px;cursor:pointer;">
          ✏️ เพิ่มคะแนนด้วยรหัสนักเรียน
        </button>
      </div>
    </div>`;
  }

  // Step 1: Student found
  const deedTypes = DEMO_DATA.deedTypes;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="card">
      <div style="background:var(--gl);border-radius:12px;padding:18px;display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div style="width:60px;height:60px;border-radius:50%;background:var(--g);display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;box-shadow:0 4px 14px oklch(0.52 0.17 145 / 0.4);">👧</div>
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--gd);">ด.ญ. สมหญิง ใจดี</div>
          <div style="font-size:13px;color:#6b7280;margin-top:3px;">รหัส 65001 · ม.3/2</div>
          <div style="font-size:12px;color:var(--g);font-weight:600;margin-top:4px;">🌟 คนดีระดับกลาง · 847 คะแนน</div>
        </div>
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:12px;">เลือกประเภทความดี</div>
      <div class="deed-grid" style="margin-bottom:16px;">
        ${deedTypes.map(d => `
          <button class="deed-chip ${state.selectedDeed === d.name ? 'selected' : ''}"
                  data-action="select-deed" data-deed="${d.name}">
            ${d.icon} ${d.name}
          </button>
        `).join('')}
      </div>

      <div style="font-weight:700;color:var(--gd);margin-bottom:8px;">คะแนน: <span id="pts-display">${state.points}</span> คะแนน</div>
      <input type="range" min="5" max="50" step="5" value="${state.points}"
             id="pts-range" data-action="change-points"
             style="background:linear-gradient(to right, var(--g) ${((state.points - 5) / 45) * 100}%, #e5e7eb ${((state.points - 5) / 45) * 100}%);">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:2px;">
        <span>5</span><span>25</span><span>50</span>
      </div>

      <button class="btn-green" data-action="save-points"
        style="margin-top:16px;padding:14px;opacity:${state.selectedDeed ? 1 : 0.5};">
        ✅ บันทึกคะแนน
      </button>
      <button data-action="reset-scan"
        style="margin-top:8px;width:100%;padding:10px;background:transparent;color:#9ca3af;border:none;font-family:Kanit;cursor:pointer;font-size:13px;">
        ← สแกนใหม่
      </button>
    </div>
  </div>`;
}

function renderTeacherAddPoints() {
  const deedTypes = DEMO_DATA.deedTypes;
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
        <div style="position:relative;">
          <select class="form-input" id="add-deed-type" style="padding-right:36px;">
            <option value="">เลือกประเภท...</option>
            ${deedTypes.map(d => `<option value="${d.name}">${d.icon} ${d.name}</option>`).join('')}
          </select>
          <div style="position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:#9ca3af;">▼</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">คะแนน *</label>
        <input class="form-input" type="number" value="10" min="1" max="100" id="add-points">
      </div>
      <div class="form-group">
        <label class="form-label">หมายเหตุ</label>
        <textarea class="form-input" rows="3" placeholder="รายละเอียดเพิ่มเติม..." id="add-note"
          style="resize:none;"></textarea>
      </div>

      <button class="btn-green" data-action="submit-addpoints" style="padding:14px;">
        ✅ บันทึกคะแนน
      </button>
    </div>
  </div>`;
}

function renderTeacherHistory() {
  const logs = DEMO_DATA.pointLogs;
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;opacity:0.8;">ให้คะแนนทั้งหมด</div>
          <div style="font-size:36px;font-weight:700;">312 ครั้ง</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;opacity:0.8;">สัปดาห์นี้</div>
          <div style="font-size:36px;font-weight:700;">47 ครั้ง</div>
        </div>
      </div>
    </div>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:14px 16px 10px;font-weight:700;color:var(--gd);">ประวัติการให้คะแนน</div>
      ${logs.map(h => listRow(h.icon, `${h.student} · ${h.class}`, `${h.deed} · ${h.date} ${h.time}`, `+${h.pts}`)).join('')}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// ADMIN SCREENS
// ══════════════════════════════════════════════

function renderAdminDashboard() {
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div>
        <div style="font-size:22px;font-weight:700;">🏫 ตาเบาวิทยา</div>
        <div style="font-size:13px;opacity:0.8;margin-top:4px;">แผงควบคุมผู้ดูแลระบบ · 24 มิ.ย. 2567</div>
      </div>
    </div>

    <div class="stat-grid-2">
      ${statBox('👩‍🎓', '542', 'นักเรียน', 'var(--g)')}
      ${statBox('👨‍🏫', '38', 'ครู', '#3b82f6')}
      ${statBox('💚', '12,847', 'คะแนนรวม', '#8b5cf6')}
      ${statBox('📋', '1,203', 'รายการความดี', '#f59e0b')}
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
      ${listRow('👧', 'สมหญิง ใจดี ได้รับ 10 คะแนน', 'เก็บขยะ · วันนี้ 09:30', '')}
      ${listRow('👦', 'กล้าหาญ ดีงาม ได้รับ 15 คะแนน', 'ช่วยครู · วันนี้ 09:15', '')}
      ${listRow('🎁', 'ขยัน ตั้งใจ แลกรางวัลสมุดบันทึก', 'ใช้ 100 คะแนน · เมื่อวาน', '')}
      ${listRow('👩‍🏫', 'ครูสมศรี เพิ่มนักเรียนใหม่ 5 คน', 'ม.3/2 · เมื่อวาน', '')}
    </div>
  </div>`;
}

function renderAdminStudents() {
  const students = DEMO_DATA.students;
  return `
  <div class="screen-wrap anim-slideup">
    <div style="display:flex;gap:10px;">
      <input class="form-input" placeholder="🔍 ค้นหานักเรียน..." id="student-search"
             style="flex:1;" data-action="search-students">
      <button data-action="open-add-student"
        style="padding:10px 16px;background:var(--g);color:#fff;border:none;border-radius:10px;font-family:Kanit;font-weight:700;cursor:pointer;font-size:13px;white-space:nowrap;">
        + เพิ่ม
      </button>
    </div>

    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      <div style="padding:12px 16px;font-size:12px;color:#9ca3af;border-bottom:1px solid #f3f4f6;">
        แสดง ${students.length} จาก 542 คน
      </div>
      ${students.map(s => `
        <div class="list-item">
          <span style="font-size:22px;">${s.icon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${s.class} · ${s.pts.toLocaleString()} คะแนน
              ${!s.active ? '<span style="color:#ef4444;"> · ไม่ใช้งาน</span>' : ''}
            </div>
          </div>
          <div class="action-btns">
            <button class="btn-edit" data-action="edit-student" data-id="${s.id}" data-name="${s.name}">✏️</button>
            <button class="btn-del"  data-action="del-student"  data-id="${s.id}" data-name="${s.name}">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderAdminDeedTypes() {
  const types = DEMO_DATA.deedTypes;
  return `
  <div class="screen-wrap anim-slideup">
    <button class="btn-green" data-action="open-add-deed" style="padding:14px;">
      + เพิ่มประเภทความดีใหม่
    </button>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${types.map(t => `
        <div class="list-item">
          <span style="font-size:24px;">${t.icon}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${t.name}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:1px;">${t.range} คะแนน · ใช้แล้ว ${t.count} ครั้ง</div>
          </div>
          <div class="action-btns">
            <button class="btn-edit" data-action="edit-deed" data-id="${t.id}" data-name="${t.name}">✏️</button>
            <button class="btn-del"  data-action="del-deed"  data-id="${t.id}" data-name="${t.name}">🗑️</button>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderAdminRewards() {
  const rewards = DEMO_DATA.rewards;
  return `
  <div class="screen-wrap anim-slideup">
    <button class="btn-green" data-action="open-add-reward" style="padding:14px;">
      + เพิ่มรางวัลใหม่
    </button>
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.055);">
      ${rewards.map(r => `
        <div class="list-item">
          <span style="font-size:28px;">${r.icon}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${r.name}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${r.pts} คะแนน · เหลือ ${r.stock} ชิ้น</div>
            <div style="margin-top:4px;display:inline-block;font-size:11px;border-radius:20px;padding:2px 8px;background:${r.active ? '#d1fae5' : '#fee2e2'};color:${r.active ? 'var(--g)' : '#ef4444'};">
              ● ${r.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </div>
          </div>
          <div class="action-btns" style="flex-direction:column;">
            <button class="btn-edit" data-action="edit-reward" data-id="${r.id}" data-name="${r.name}">✏️</button>
            <button class="btn-tog ${r.active ? 'btn-del' : ''}"
                    data-action="toggle-reward" data-id="${r.id}" data-name="${r.name}" data-active="${r.active}"
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
  const { labels, values } = DEMO_DATA.monthlyData;
  const mx = Math.max(...values);
  return `
  <div class="screen-wrap anim-slideup">
    <div class="hero-banner">
      <div>
        <div style="font-size:16px;font-weight:700;">📈 รายงานคะแนนความดี</div>
        <div style="font-size:13px;opacity:0.8;margin-top:3px;">ภาคเรียนที่ 1 ปีการศึกษา 2567</div>
      </div>
    </div>

    <div class="card">
      <div style="font-weight:700;color:var(--gd);margin-bottom:16px;">คะแนนรายเดือน</div>
      <div class="bar-chart">
        ${labels.map((m, i) => `
          <div class="bar-col">
            <div class="bar-val">${values[i]}</div>
            <div class="bar-fill" style="height:${(values[i] / mx) * 110}px;background:${i === labels.length - 1 ? 'var(--g)' : 'var(--gm)'};"></div>
            <div class="bar-lbl">${m}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="stat-grid-2">
      ${statBox('🏆', 'ม.3/1', 'ห้องดีเด่น', 'var(--g)')}
      ${statBox('💚', '950', 'คะแนนมิ.ย.', '#3b82f6')}
      ${statBox('👩‍🎓', '128', 'นักเรียนใช้ระบบ', '#8b5cf6')}
      ${statBox('🎁', '23', 'แลกรางวัล', '#f59e0b')}
    </div>

    <div style="display:flex;gap:10px;">
      <button data-action="export-excel"
        style="flex:1;padding:13px;background:#d1fae5;color:var(--gd);border:none;border-radius:10px;font-family:Kanit;font-weight:700;cursor:pointer;font-size:13px;">
        📊 Export Excel
      </button>
      <button data-action="export-pdf"
        style="flex:1;padding:13px;background:#fee2e2;color:#dc2626;border:none;border-radius:10px;font-family:Kanit;font-weight:700;cursor:pointer;font-size:13px;">
        📄 Export PDF
      </button>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════
// HTML helpers
// ══════════════════════════════════════════════

function statBox(icon, val, lbl, color) {
  return `
  <div class="stat-box">
    <div class="stat-icon">${icon}</div>
    <div class="stat-val" style="color:${color};">${val}</div>
    <div class="stat-lbl">${lbl}</div>
  </div>`;
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

// ══════════════════════════════════════════════
// Post-render hooks
// ══════════════════════════════════════════════

function afterRender() {
  // QR code generation for student dashboard
  const qrCanvas = document.getElementById('student-qr');
  if (qrCanvas && typeof QRCode !== 'undefined') {
    QRCode.toCanvas(qrCanvas, JSON.stringify({ student_id: '65001', token: 'demo-token' }), {
      width: 110,
      color: { dark: '#1a4d1a', light: '#ffffff' },
    });
  }

  // Range slider live update
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

  // Auto-lookup student code
  const codeInput = document.getElementById('add-student-code');
  if (codeInput) {
    codeInput.addEventListener('input', async () => {
      const code = codeInput.value.trim();
      const nameField = document.getElementById('add-student-name');
      if (code.length >= 4) {
        const { data } = await getStudentByCode(code);
        if (nameField) nameField.value = data ? data.name : 'ไม่พบนักเรียน';
      } else {
        if (nameField) nameField.value = '';
      }
    });
  }
}

// ══════════════════════════════════════════════
// Toast
// ══════════════════════════════════════════════

function showToast(msg) {
  if (state._toastTimer) clearTimeout(state._toastTimer);
  const c = document.getElementById('toast-container');
  c.innerHTML = `<div class="toast-msg">${msg}</div>`;
  state._toastTimer = setTimeout(() => { c.innerHTML = ''; }, 2800);
}

// ══════════════════════════════════════════════
// Modal
// ══════════════════════════════════════════════

function showModal(html) {
  const c = document.getElementById('modal-container');
  c.innerHTML = `
    <div class="modal-overlay" data-action="close-modal">
      <div class="modal-sheet" onclick="event.stopPropagation()">
        <div class="modal-handle"></div>
        ${html}
      </div>
    </div>`;
}

function closeModal() {
  document.getElementById('modal-container').innerHTML = '';
}

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
  if (!video || !canvas || state.screen !== 'teacher-scan') {
    stopScan(); return;
  }
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'undefined') {
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        stopScan();
        handleQRResult(code.data);
        return;
      }
    }
  }
  state._scanRaf = requestAnimationFrame(scanLoop);
}

function stopScan() {
  if (state._videoStream) {
    state._videoStream.getTracks().forEach(t => t.stop());
    state._videoStream = null;
  }
  if (state._scanRaf) { cancelAnimationFrame(state._scanRaf); state._scanRaf = null; }
}

function handleQRResult(data) {
  try {
    const parsed = JSON.parse(data);
    if (parsed.student_id) {
      setState({ scanStep: 1 });
      return;
    }
  } catch {}
  showToast('QR Code ไม่ถูกต้อง ❌');
}

// ══════════════════════════════════════════════
// Event Handling (event delegation)
// ══════════════════════════════════════════════

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action } = btn.dataset;

  switch (action) {
    case 'toggle-layout':
      setState({ layout: state.layout === 'A' ? 'B' : 'A' });
      break;

    case 'login': {
      const role = btn.dataset.role;
      const screen = { student: 'student-dashboard', teacher: 'teacher-dashboard', admin: 'admin-dashboard' }[role];
      const names = { student: 'ด.ญ. สมหญิง ใจดี', teacher: 'ครูอภิชัย มีธรรม', admin: 'ผู้ดูแลระบบ' };
      setState({ role, screen });
      showToast(`ยินดีต้อนรับ ${names[role]}! 🌿`);
      break;
    }

    case 'logout':
      stopScan();
      setState({ role: null, screen: 'login', scanStep: 0, selectedDeed: '' });
      showToast('ออกจากระบบแล้ว');
      break;

    case 'nav':
      if (state.screen === 'teacher-scan') stopScan();
      setState({ screen: btn.dataset.screen, scanStep: 0, selectedDeed: '' });
      break;

    case 'go-profile':
      if (state.role === 'student') setState({ screen: 'student-profile' });
      break;

    case 'start-scan':
      startScan();
      break;

    case 'sim-scan':
      setState({ scanStep: 1 });
      break;

    case 'reset-scan':
      stopScan();
      setState({ scanStep: 0, selectedDeed: '' });
      break;

    case 'select-deed':
      setState({ selectedDeed: btn.dataset.deed });
      break;

    case 'save-points':
      if (!state.selectedDeed) { showToast('กรุณาเลือกประเภทความดีก่อน'); return; }
      showToast(`✅ บันทึกสำเร็จ! +${state.points} คะแนน สมหญิง ใจดี`);
      stopScan();
      setState({ scanStep: 0, selectedDeed: '', points: 10, screen: 'teacher-dashboard' });
      break;

    case 'submit-addpoints': {
      const code  = document.getElementById('add-student-code')?.value.trim();
      const deed  = document.getElementById('add-deed-type')?.value;
      const pts   = document.getElementById('add-points')?.value;
      const note  = document.getElementById('add-note')?.value;
      if (!code || !deed || !pts) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      showToast('บันทึกคะแนนสำเร็จ! ✅');
      setState({ screen: 'teacher-dashboard' });
      break;
    }

    case 'redeem': {
      const can = btn.dataset.can === 'true';
      const name = btn.dataset.rewardName;
      if (can) showToast(`แลก "${name}" สำเร็จ! 🎉`);
      else showToast('คะแนนไม่พอ ❌');
      break;
    }

    case 'open-add-student':
      showModal(`
        <div class="modal-title">➕ เพิ่มนักเรียนใหม่</div>
        <div class="form-group"><label class="form-label">รหัสนักเรียน *</label><input class="form-input" id="new-code" placeholder="เช่น 65008"></div>
        <div class="form-group"><label class="form-label">ชื่อ-สกุล *</label><input class="form-input" id="new-name" placeholder="ด.ช. / ด.ญ. ..."></div>
        <div class="form-group"><label class="form-label">ห้องเรียน *</label><input class="form-input" id="new-class" placeholder="เช่น ม.3/2"></div>
        <button class="btn-green" data-action="save-student" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;

    case 'save-student': {
      const code  = document.getElementById('new-code')?.value.trim();
      const name  = document.getElementById('new-name')?.value.trim();
      const cls   = document.getElementById('new-class')?.value.trim();
      if (!code || !name || !cls) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      DEMO_DATA.students.push({ id: `stu-${Date.now()}`, code, name, class: cls, pts: 0, icon: '👦', active: true });
      closeModal();
      showToast(`เพิ่ม ${name} สำเร็จ! ✅`);
      render();
      break;
    }

    case 'edit-student':
      showToast(`แก้ไข: ${btn.dataset.name}`);
      break;

    case 'del-student': {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      showModal(`
        <div class="modal-title">🗑️ ลบนักเรียน</div>
        <p style="color:#374151;margin-bottom:20px;">ต้องการลบ <strong>${name}</strong> ออกจากระบบ?</p>
        <button class="btn-green" data-action="confirm-del-student" data-id="${id}" data-name="${name}"
          style="padding:13px;background:linear-gradient(90deg,#dc2626,#ef4444);">🗑️ ลบ</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;
    }

    case 'confirm-del-student': {
      const i = DEMO_DATA.students.findIndex(s => s.id === btn.dataset.id);
      if (i > -1) DEMO_DATA.students.splice(i, 1);
      closeModal();
      showToast(`ลบ ${btn.dataset.name} แล้ว`);
      render();
      break;
    }

    case 'open-add-deed':
      showModal(`
        <div class="modal-title">➕ เพิ่มประเภทความดีใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน (Emoji)</label><input class="form-input" id="new-deed-icon" placeholder="เช่น 🌱" value="🌱"></div>
        <div class="form-group"><label class="form-label">ชื่อประเภท *</label><input class="form-input" id="new-deed-name" placeholder="เช่น ช่วยงานโรงเรียน"></div>
        <div class="form-group"><label class="form-label">ช่วงคะแนน *</label><input class="form-input" id="new-deed-range" placeholder="เช่น 5–20"></div>
        <button class="btn-green" data-action="save-deed" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;

    case 'save-deed': {
      const icon  = document.getElementById('new-deed-icon')?.value.trim() || '💚';
      const name  = document.getElementById('new-deed-name')?.value.trim();
      const range = document.getElementById('new-deed-range')?.value.trim();
      if (!name || !range) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      DEMO_DATA.deedTypes.push({ id: Date.now(), icon, name, range, count: 0 });
      closeModal();
      showToast(`เพิ่ม "${name}" สำเร็จ! ✅`);
      render();
      break;
    }

    case 'edit-deed':
      showToast(`แก้ไข: ${btn.dataset.name}`);
      break;

    case 'del-deed': {
      const i = DEMO_DATA.deedTypes.findIndex(d => d.id == btn.dataset.id);
      if (i > -1) DEMO_DATA.deedTypes.splice(i, 1);
      showToast(`ลบ "${btn.dataset.name}" แล้ว`);
      render();
      break;
    }

    case 'open-add-reward':
      showModal(`
        <div class="modal-title">➕ เพิ่มรางวัลใหม่</div>
        <div class="form-group"><label class="form-label">ไอคอน</label><input class="form-input" id="new-rw-icon" value="🎁"></div>
        <div class="form-group"><label class="form-label">ชื่อรางวัล *</label><input class="form-input" id="new-rw-name" placeholder="ชื่อรางวัล"></div>
        <div class="form-group"><label class="form-label">คะแนนที่ใช้ *</label><input class="form-input" type="number" id="new-rw-pts" placeholder="100"></div>
        <div class="form-group"><label class="form-label">จำนวนคงเหลือ</label><input class="form-input" type="number" id="new-rw-stock" placeholder="10"></div>
        <button class="btn-green" data-action="save-reward" style="padding:13px;margin-top:4px;">✅ บันทึก</button>
        <button data-action="close-modal" style="width:100%;padding:10px;margin-top:8px;background:transparent;border:none;font-family:Kanit;color:#9ca3af;cursor:pointer;">ยกเลิก</button>
      `);
      break;

    case 'save-reward': {
      const icon  = document.getElementById('new-rw-icon')?.value.trim() || '🎁';
      const name  = document.getElementById('new-rw-name')?.value.trim();
      const pts   = parseInt(document.getElementById('new-rw-pts')?.value) || 0;
      const stock = parseInt(document.getElementById('new-rw-stock')?.value) || 0;
      if (!name || !pts) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
      DEMO_DATA.rewards.push({ id: Date.now(), icon, name, pts, stock, active: true });
      closeModal();
      showToast(`เพิ่ม "${name}" สำเร็จ! ✅`);
      render();
      break;
    }

    case 'edit-reward':
      showToast(`แก้ไข: ${btn.dataset.name}`);
      break;

    case 'toggle-reward': {
      const r = DEMO_DATA.rewards.find(r => r.id == btn.dataset.id);
      if (r) r.active = !r.active;
      showToast(`${r?.active ? 'เปิด' : 'ปิด'}ใช้งาน: ${btn.dataset.name}`);
      render();
      break;
    }

    case 'export-excel':
      showToast('กำลังดาวน์โหลด Excel... 📊');
      break;

    case 'export-pdf':
      showToast('กำลังดาวน์โหลด PDF... 📄');
      break;

    case 'close-modal':
      closeModal();
      break;
  }
});

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  render();
});
