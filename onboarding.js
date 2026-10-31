// ══════════════════════════════════════════════
// ตัวช่วยติดตั้งแอป + ตัวช่วยตั้งค่าครั้งแรก (โหลดก่อน app.js — ใช้ state/render/showModal ฯลฯ ตอนรันจริงเท่านั้น)
// ══════════════════════════════════════════════

const _UA = navigator.userAgent;

function isMobileDevice() {
  return /android|iphone|ipad|ipod/i.test(_UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isAndroidDevice() { return /android/i.test(_UA); }

// เบราว์เซอร์ในตัวของแอปแชท/โซเชียล — ติดตั้งแอป (PWA), แจ้งเตือน และกล้องมักใช้ไม่ได้
function inAppBrowserName() {
  if (/\bLine\//i.test(_UA)) return 'LINE';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(_UA)) return 'Facebook';
  if (/Instagram/i.test(_UA)) return 'Instagram';
  if (/MicroMessenger/i.test(_UA)) return 'WeChat';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(_UA)) return 'TikTok';
  return null;
}

// LINE รองรับพารามิเตอร์ openExternalBrowser=1 — เปิดลิงก์ที่มีพารามิเตอร์นี้แล้ว LINE จะเด้งไปเบราว์เซอร์หลักเอง
(function redirectLineToExternalBrowser() {
  try {
    if (inAppBrowserName() !== 'LINE') return;
    const u = new URL(location.href);
    if (u.searchParams.get('openExternalBrowser') === '1') return;
    u.searchParams.set('openExternalBrowser', '1');
    location.replace(u.toString());
  } catch {}
})();

function cleanAppUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('openExternalBrowser');
  u.hash = '';
  return u.toString();
}
function shareableAppUrl() {
  const u = new URL(cleanAppUrl());
  u.searchParams.set('openExternalBrowser', '1');
  return u.toString();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ── หน้าบังคับติดตั้ง (เต็มจอ ก่อน login) ──
window._sessionChecked = false;
window._justInstalled = false;

function shouldShowInstallGate() {
  if (state.role || !window._sessionChecked) return false;
  if (!isMobileDevice() || isStandaloneDisplay()) return false;
  try { if (sessionStorage.getItem('install_gate_skip') === '1') return false; } catch {}
  return true;
}

function gateStepsHTML(steps) {
  return `<ol style="text-align:left;font-size:14px;color:#374151;line-height:1.9;padding-left:22px;margin:0 0 14px;">${steps.map(s => `<li>${s}</li>`).join('')}</ol>`;
}

function installGateBodyHTML() {
  const app = inAppBrowserName();
  const btn = 'display:block;width:100%;padding:14px;border:none;border-radius:12px;font-family:var(--font);font-weight:700;font-size:15px;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box;margin-bottom:10px;';
  const primary = btn + 'background:linear-gradient(90deg,var(--gd),var(--g));color:#fff;';
  const secondary = btn + 'background:#f3f4f6;color:#374151;';

  if (window._justInstalled) {
    return `
      <div style="font-size:54px;">🎉</div>
      <div style="font-size:18px;font-weight:700;color:var(--gd);margin:8px 0;">ติดตั้งแอปเรียบร้อยแล้ว</div>
      <div style="font-size:14px;color:#374151;line-height:1.7;margin-bottom:16px;">ปิดหน้านี้ แล้วเปิดแอป <b>"คะแนนความดี"</b> จากหน้าจอโฮมของคุณได้เลย</div>
      <button data-action="gate-skip" style="${secondary}">ใช้งานต่อในหน้านี้</button>`;
  }

  if (app) {
    const intentUrl = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(cleanAppUrl())};end`;
    return `
      <div style="font-size:46px;">🌐</div>
      <div style="font-size:18px;font-weight:700;color:var(--gd);margin:6px 0;">เปิดลิงก์ในเบราว์เซอร์ก่อนนะ</div>
      <div style="font-size:13px;color:#6b7280;line-height:1.7;margin-bottom:14px;">ตอนนี้คุณเปิดอยู่ใน <b>${app}</b> ซึ่งติดตั้งแอป ใช้กล้อง และรับการแจ้งเตือนไม่ได้</div>
      ${isAndroidDevice()
        ? `<a href="${intentUrl}" style="${primary}">🌐 เปิดใน Chrome</a>
           ${gateStepsHTML(['หรือแตะ <b>⋮</b> / <b>⋯</b> มุมขวาบน', 'เลือก <b>"เปิดในเบราว์เซอร์"</b>'])}`
        : gateStepsHTML(['แตะ <b>⋯</b> หรือปุ่มแชร์ มุมขวาบน/ล่างของ ' + app, 'เลือก <b>"เปิดใน Safari"</b>', 'แล้วทำตามขั้นตอนติดตั้งแอปต่อ'])}
      <button data-action="gate-copy-link" style="${secondary}">📋 คัดลอกลิงก์ไปเปิดเอง</button>`;
  }

  if (deferredInstallPrompt) {
    return `
      <div style="font-size:46px;">📲</div>
      <div style="font-size:18px;font-weight:700;color:var(--gd);margin:6px 0;">ติดตั้งแอปลงหน้าจอโฮม</div>
      <div style="font-size:13px;color:#6b7280;line-height:1.7;margin-bottom:16px;">เปิดใช้ได้เร็วเหมือนแอปทั่วไป สแกน QR ได้ลื่น และรับการแจ้งเตือนสตรีคความดี</div>
      <button data-action="install-pwa" style="${primary}">📲 ติดตั้งแอปเลย</button>`;
  }

  if (isIOSDevice()) {
    const notSafari = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(_UA);
    return `
      <div style="font-size:46px;">📲</div>
      <div style="font-size:18px;font-weight:700;color:var(--gd);margin:6px 0;">ติดตั้งแอปลงหน้าจอโฮม</div>
      ${notSafari ? '<div style="font-size:12.5px;color:#b45309;background:#fef3c7;border-radius:10px;padding:8px 12px;margin-bottom:12px;">แนะนำให้เปิดลิงก์นี้ด้วย <b>Safari</b> เพื่อให้รับการแจ้งเตือนได้</div>' : ''}
      ${gateStepsHTML(['แตะปุ่มแชร์ <b>⬆️</b> ที่แถบด้านล่าง', 'เลื่อนหา <b>"เพิ่มไปยังหน้าจอโฮม"</b>', 'แตะ <b>"เพิ่ม"</b> มุมขวาบน', 'เปิดแอปจากไอคอนบนหน้าจอโฮม'])}`;
  }

  return `
    <div style="font-size:46px;">📲</div>
    <div style="font-size:18px;font-weight:700;color:var(--gd);margin:6px 0;">ติดตั้งแอปลงหน้าจอโฮม</div>
    ${gateStepsHTML(['แตะเมนู <b>⋮</b> มุมขวาบนของเบราว์เซอร์', 'เลือก <b>"ติดตั้งแอป"</b> หรือ <b>"เพิ่มไปยังหน้าจอหลัก"</b>', 'เปิดแอปจากไอคอนบนหน้าจอโฮม'])}`;
}

function renderInstallGate() {
  const el = document.getElementById('install-gate');
  if (!el) return;
  if (!shouldShowInstallGate()) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  el.innerHTML = `
    <div style="width:100%;max-width:380px;background:#fff;border-radius:20px;padding:24px 22px 18px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.18);max-height:94vh;overflow-y:auto;">
      <div style="margin-bottom:6px;">${schoolLogoHTML(56)}</div>
      <div style="font-size:12px;color:#9ca3af;margin-bottom:12px;">${state.settings.schoolName} · ระบบสะสมคะแนนความดี</div>
      ${installGateBodyHTML()}
      ${window._justInstalled ? '' : `<button data-action="gate-skip" style="background:none;border:none;color:#9ca3af;font-family:var(--font);font-size:12.5px;cursor:pointer;text-decoration:underline;padding:6px;">ข้าม ใช้งานบนเบราว์เซอร์ไปก่อน</button>`}
    </div>`;
}

window.addEventListener('appinstalled', () => {
  window._justInstalled = true;
  deferredInstallPrompt = null;
  renderInstallGate();
  if (typeof refreshSetupUI === 'function') refreshSetupUI();
});

// ── ตัวช่วยตั้งค่า (เช็กลิสต์) ──
const _perm = { location: 'unknown', camera: 'unknown' };

async function refreshPermissionStates() {
  for (const [key, name] of [['location', 'geolocation'], ['camera', 'camera']]) {
    try {
      const r = await navigator.permissions.query({ name });
      _perm[key] = r.state;
      r.onchange = () => { _perm[key] = r.state; refreshSetupUI(); };
    } catch {
      // Safari/Firefox บางเวอร์ชันไม่รองรับการถามสถานะ — เชื่อค่าที่เคยขออนุญาตสำเร็จบนเครื่องนี้แทน
      if (lsGet('perm_ok_' + key) === '1') _perm[key] = 'granted';
    }
  }
}

function setupUserKey() {
  return state.role === 'student' ? 'stu_' + (state.student?.student_code || '') : 'staff_' + (state.staffUser?.id || '');
}

function themeIsCustomized() {
  return typeof userTheme !== 'undefined' && JSON.stringify(userTheme) !== JSON.stringify(THEME_DEFAULT);
}

function setupSteps() {
  const isStudent = state.role === 'student';
  const photoUrl = isStudent ? state.student?.photo_url : state.staffUser?.photo_url;
  const steps = [];

  steps.push({
    id: 'install', icon: '📲', title: 'ติดตั้งแอปลงหน้าจอโฮม',
    desc: 'เปิดใช้ได้เร็วเหมือนแอปทั่วไป และรับการแจ้งเตือนได้',
    done: isStandaloneDisplay(), hidden: !isMobileDevice(),
    action: 'setup-install', label: 'ติดตั้ง',
  });
  steps.push({
    id: 'photo', icon: '📷', title: 'ใส่รูปโปรไฟล์',
    desc: isStudent ? 'ให้ครูและเพื่อนจำคุณได้ในอันดับและการ์ดต่าง ๆ' : 'แสดงรูปของคุณในแอปและหน้าจอนักเรียน',
    done: !!photoUrl,
    action: isStudent ? 'open-student-own-photo' : 'open-staff-photo', label: 'เลือกรูป',
  });
  if (isStudent) {
    const pushOk = pushSupported();
    steps.push({
      id: 'push', icon: '🔔', title: 'เปิดการแจ้งเตือนสตรีค',
      desc: pushOk ? 'เตือนก่อนสตรีคทำความดีของคุณจะขาด' : (isIOSDevice() ? 'บน iPhone ต้องติดตั้งแอปลงหน้าจอโฮมก่อน แล้วจึงเปิดได้' : 'เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน'),
      done: !!state.pushSubscribed, disabled: !pushOk,
      action: 'setup-enable-push', label: 'เปิดแจ้งเตือน',
    });
    steps.push({
      id: 'location', icon: '📍', title: 'อนุญาตการเข้าถึงตำแหน่ง',
      desc: 'ใช้ยืนยันตำแหน่งตอนแจ้งขอลา (ไม่ได้ติดตามตำแหน่งตลอดเวลา)',
      done: _perm.location === 'granted', blocked: _perm.location === 'denied',
      action: 'setup-grant-location', label: 'อนุญาต',
    });
  }
  steps.push({
    id: 'camera', icon: '🎥', title: 'อนุญาตการใช้กล้อง',
    desc: isStudent ? 'ใช้สแกน QR รับคะแนน และถ่ายรูปประกอบคำขอทำดี/ขอลา' : 'ใช้สแกน QR ของนักเรียนและโค้ดรับคะแนน',
    done: _perm.camera === 'granted', blocked: _perm.camera === 'denied',
    action: 'setup-grant-camera', label: 'อนุญาต',
  });
  if (state.role === 'teacher') {
    steps.push({
      id: 'homeroom', icon: '🏫', title: 'ตั้งห้องที่ปรึกษา',
      desc: 'เพื่อให้เห็นคำขอทำดีของนักเรียนห้องคุณก่อนเสมอ',
      done: !!(state.staffUser?.homeroom_grade_level && state.staffUser?.homeroom_room),
      action: 'setup-go-profile', label: 'ตั้งค่า',
    });
  }
  steps.push({
    id: 'theme', icon: '🎨', title: 'เลือกธีมที่ชอบ',
    desc: 'ปรับสี ตัวอักษร และหน้าตาแอปให้เป็นแบบของคุณ (ไม่บังคับ)',
    done: themeIsCustomized(),
    action: 'setup-go-profile', label: 'เลือกธีม',
  });
  return steps.filter(s => !s.hidden);
}

function setupDismissed() {
  const t = Number(lsGet('setup_dismissed_' + setupUserKey()) || 0);
  return t && Date.now() - t < 3 * 24 * 3600 * 1000;
}

function setupCardHTML() {
  if (!state.role || setupDismissed()) return '';
  const steps = setupSteps();
  const left = steps.filter(s => !s.done);
  if (!left.length) return '';
  const done = steps.length - left.length;
  return `
  <div class="card" style="padding:12px 14px;border:1.5px solid var(--g);">
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:22px;">🧭</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;color:var(--gd);font-size:14px;">ตั้งค่าให้พร้อมใช้งาน <span style="color:#9ca3af;font-weight:600;">${done}/${steps.length}</span></div>
        <div style="font-size:11.5px;color:#9ca3af;margin-top:1px;">ถัดไป: ${left[0].title}</div>
      </div>
      <button data-action="setup-open" style="padding:8px 14px;border:none;border-radius:10px;background:var(--g);color:#fff;font-family:var(--font);font-weight:700;font-size:12.5px;cursor:pointer;flex-shrink:0;">ตั้งค่า</button>
    </div>
    <div style="height:6px;background:#e5e7eb;border-radius:4px;margin-top:8px;overflow:hidden;"><div style="height:100%;width:${(done / steps.length) * 100}%;background:var(--g);"></div></div>
  </div>`;
}

function setupProfileButtonHTML() {
  return `<button data-action="setup-open" style="width:100%;padding:12px;background:var(--gl);color:var(--gd);border:none;border-radius:12px;font-family:var(--font);font-weight:700;font-size:13.5px;cursor:pointer;">🧭 เปิดตัวช่วยตั้งค่า</button>`;
}

function setupWizardHTML() {
  const steps = setupSteps();
  const done = steps.filter(s => s.done).length;
  return `
  <div id="setup-wizard-root">
    <div class="modal-title">🧭 ตั้งค่าให้พร้อมใช้งาน</div>
    <div style="font-size:12.5px;color:#6b7280;margin-bottom:10px;">เสร็จแล้ว ${done} จาก ${steps.length} ขั้นตอน ทำตอนไหนก็ได้ ข้ามได้ทุกข้อ</div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:58vh;overflow-y:auto;">
      ${steps.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:${s.done ? 'var(--gl)' : '#f9fafb'};border:1.5px solid ${s.done ? 'var(--g)' : '#e5e7eb'};">
          <span style="font-size:22px;flex-shrink:0;">${s.icon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13.5px;color:#1f2937;">${s.title}</div>
            <div style="font-size:11.5px;color:${s.blocked ? '#dc2626' : '#9ca3af'};line-height:1.45;margin-top:1px;">${s.blocked ? 'ถูกปิดกั้นไว้ในเบราว์เซอร์ — เปิดได้ที่ ตั้งค่าเว็บไซต์ > สิทธิ์' : s.desc}</div>
          </div>
          ${s.done
            ? `<span style="font-size:20px;color:var(--g);flex-shrink:0;">✅</span>`
            : `<button data-action="${s.action}" ${s.disabled ? 'disabled' : ''} style="padding:7px 12px;border:none;border-radius:9px;background:${s.disabled ? '#e5e7eb' : 'var(--g)'};color:${s.disabled ? '#9ca3af' : '#fff'};font-family:var(--font);font-weight:700;font-size:12px;cursor:pointer;flex-shrink:0;">${s.label}</button>`}
        </div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button data-action="setup-dismiss" style="flex:1;padding:11px;border:none;border-radius:10px;background:#f3f4f6;color:#6b7280;font-family:var(--font);font-weight:600;font-size:13px;cursor:pointer;">ไว้ทีหลัง</button>
      <button data-action="close-modal" class="btn-green" style="flex:1;padding:11px;">${done === steps.length ? 'เสร็จสิ้น' : 'ปิด'}</button>
    </div>
  </div>`;
}

function refreshSetupUI() {
  if (state.role) render();
  if (document.getElementById('setup-wizard-root')) updateModalBody(setupWizardHTML());
}

function showAppInstallGuide() {
  if (isIOSDevice()) {
    showModal(`
      <div class="modal-title">📲 เพิ่มแอปไปยังหน้าจอโฮม</div>
      <div style="font-size:14px;color:#374151;line-height:2;padding-bottom:18px;">
        1. แตะปุ่มแชร์ <b>⬆️</b> ที่แถบด้านล่างของ Safari<br>
        2. เลื่อนหาเมนู <b>"เพิ่มไปยังหน้าจอโฮม"</b><br>
        3. แตะ <b>"เพิ่ม"</b> ที่มุมขวาบน
      </div>
      <button class="btn-green" data-action="close-modal" style="padding:13px;">เข้าใจแล้ว</button>`);
  } else {
    showModal(`
      <div class="modal-title">📲 ติดตั้งแอปลงหน้าจอโฮม</div>
      <div style="font-size:14px;color:#374151;line-height:2;padding-bottom:18px;">
        1. แตะเมนู <b>⋮</b> มุมขวาบนของเบราว์เซอร์<br>
        2. เลือก <b>"ติดตั้งแอป"</b> หรือ <b>"เพิ่มไปยังหน้าจอหลัก"</b><br>
        3. แตะ <b>"ติดตั้ง"</b>
      </div>
      <button class="btn-green" data-action="close-modal" style="padding:13px;">เข้าใจแล้ว</button>`);
  }
}

function maybeAutoOpenSetupWizard() {
  const key = 'setup_seen_' + setupUserKey();
  if (lsGet(key)) return;
  setTimeout(async () => {
    if (!state.role || document.querySelector('.modal-sheet')) return;
    await refreshPermissionStates();
    lsSet(key, '1');
    if (!setupSteps().some(s => !s.done)) return;
    showModal(setupWizardHTML());
  }, 1200);
}

function teacherShareLinkCardHTML() {
  return `
  <div class="card">
    <div style="font-weight:700;color:var(--gd);margin-bottom:4px;font-size:14px;">📨 ลิงก์ส่งให้นักเรียน</div>
    <div style="font-size:11.5px;color:#9ca3af;margin-bottom:10px;line-height:1.5;">ส่งลิงก์นี้ใน LINE/Facebook ได้เลย — เมื่อนักเรียนเปิด ระบบจะพาไปเปิดในเบราว์เซอร์และแนะนำให้ติดตั้งแอปให้อัตโนมัติ</div>
    <div style="font-size:11.5px;background:#f3f4f6;border-radius:8px;padding:8px 10px;word-break:break-all;color:#374151;margin-bottom:10px;">${shareableAppUrl()}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn-green" data-action="copy-share-link" style="padding:10px;flex:1;">📋 คัดลอกลิงก์</button>
      ${navigator.share ? `<button class="btn-green" data-action="native-share-link" style="padding:10px;flex:1;">📤 แชร์</button>` : ''}
    </div>
  </div>`;
}

// คืน true ถ้าจัดการ action นี้แล้ว (app.js เรียกก่อน switch หลัก)
async function handleOnboardingAction(action, btn) {
  switch (action) {
    case 'gate-skip':
      try { sessionStorage.setItem('install_gate_skip', '1'); } catch {}
      window._justInstalled = false;
      renderInstallGate();
      return true;

    case 'gate-copy-link':
      showToast((await copyText(cleanAppUrl())) ? 'คัดลอกลิงก์แล้ว นำไปวางในเบราว์เซอร์ได้เลย 📋' : 'คัดลอกไม่สำเร็จ');
      return true;

    case 'copy-share-link':
      showToast((await copyText(shareableAppUrl())) ? 'คัดลอกลิงก์แล้ว 📋' : 'คัดลอกไม่สำเร็จ');
      return true;

    case 'native-share-link':
      try { await navigator.share({ title: 'ระบบสะสมคะแนนความดี', text: 'เข้าใช้งานระบบสะสมคะแนนความดี', url: shareableAppUrl() }); } catch {}
      return true;

    case 'setup-open':
      await refreshPermissionStates();
      showModal(setupWizardHTML());
      return true;

    case 'setup-dismiss':
      lsSet('setup_dismissed_' + setupUserKey(), String(Date.now()));
      closeModal();
      render();
      showToast('ซ่อนไว้ 3 วัน เปิดดูได้อีกที่หน้าโปรไฟล์');
      return true;

    case 'setup-install':
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice.outcome === 'accepted') showToast('ติดตั้งแอปสำเร็จ! 🎉');
        refreshSetupUI();
      } else {
        showAppInstallGuide();
      }
      return true;

    case 'setup-enable-push':
      await enablePushNotifications();
      refreshSetupUI();
      return true;

    case 'setup-grant-location':
      if (!navigator.geolocation) { showToast('เบราว์เซอร์นี้ไม่รองรับตำแหน่ง'); return true; }
      navigator.geolocation.getCurrentPosition(
        () => { _perm.location = 'granted'; lsSet('perm_ok_location', '1'); showToast('อนุญาตตำแหน่งแล้ว 📍'); refreshSetupUI(); },
        () => { _perm.location = 'denied'; showToast('ไม่ได้รับอนุญาต — เปิดได้ที่ ตั้งค่าเว็บไซต์ > สิทธิ์'); refreshSetupUI(); },
        { enableHighAccuracy: false, timeout: 15000 }
      );
      return true;

    case 'setup-grant-camera':
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        _perm.camera = 'granted'; lsSet('perm_ok_camera', '1');
        showToast('อนุญาตกล้องแล้ว 🎥');
      } catch {
        _perm.camera = 'denied';
        showToast('ไม่ได้รับอนุญาต — เปิดได้ที่ ตั้งค่าเว็บไซต์ > สิทธิ์');
      }
      refreshSetupUI();
      return true;

    case 'setup-go-profile':
      closeModal();
      document.querySelector('[data-action="go-profile"]')?.click();
      return true;
  }
  return false;
}
