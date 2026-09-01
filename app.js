let DATA = { classes: [], teachers: [], rooms: [], updated_at: null };
const DAYS_PL = ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek'];
const DAYS_PL_SHORT = ['Pon','Wt','Śr','Czw','Pt'];

const STATE = {
  mainView: 'today',
  section: 'classes',
  selectedIndex: null,
  selectedName: null,
  pinned: [],
  subFilter: '',
  subOnlyMine: false,
  theme: 'dark',
};

/* ---------------- utilities ---------------- */
function esc(x) {
  return String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

const SUBJECT_COLORS = {};
const PALETTE = [
  '#5b5bdc','#0891b2','#059669','#d97706','#dc2626',
  '#7c3aed','#db2777','#2563eb','#16a34a','#ea580c',
  '#9333ea','#0d9488','#ca8a04','#e11d48','#6d28d9',
  '#0284c7','#65a30d','#c2410c','#be185d','#1d4ed8',
];
let colorIdx = 0;
function getSubjectColor(s) {
  if (!s) return null;
  const k = s.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/gi, '');
  if (!SUBJECT_COLORS[k]) { SUBJECT_COLORS[k] = PALETTE[colorIdx++ % PALETTE.length]; }
  return SUBJECT_COLORS[k];
}
function hexToRgba(hex, a) {
  if (!hex) return `rgba(255,255,255,${a})`;
  const n = hex.replace('#', '');
  const r = parseInt(n.substring(0, 2), 16), g = parseInt(n.substring(2, 4), 16), b = parseInt(n.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function getTodayIndex() {
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d - 1 : -1;
}

function parseLessonTime(timeStr) {
  const parts = (timeStr || '').split('-').map(s => s.trim());
  if (parts.length !== 2) return null;
  const [sh, sm] = parts[0].split(':').map(Number);
  const [eh, em] = parts[1].split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  return { start: sh * 60 + sm, end: eh * 60 + em };
}

function fmtMin(mins) {
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h + ' godz' + (m ? ' ' + m + ' min' : '');
}

/* ---------------- theme ---------------- */
function initTheme() {
  const saved = localStorage.getItem('sp3_theme');
  if (saved) STATE.theme = saved;
  else STATE.theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  applyTheme();
}
function toggleTheme() {
  STATE.theme = STATE.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('sp3_theme', STATE.theme);
  applyTheme();
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', STATE.theme);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    if (STATE.theme === 'dark') {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
  }
}

/* ---------------- pinned favorites ---------------- */
function loadPinned() {
  try { STATE.pinned = JSON.parse(localStorage.getItem('sp3_pinned') || '[]'); } catch { STATE.pinned = []; }
}
function savePinned() { localStorage.setItem('sp3_pinned', JSON.stringify(STATE.pinned)); }
function isPinned(type, name) { return STATE.pinned.some(p => p.type === type && p.name === name); }
function togglePin(type, name, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const i = STATE.pinned.findIndex(p => p.type === type && p.name === name);
  if (i === -1) STATE.pinned.push({ type, name }); else STATE.pinned.splice(i, 1);
  savePinned();
  initSidebar();
  if (document.getElementById('pickerOverlay').classList.contains('open')) renderPickerList();
  syncHeaderPinButton();
}



/* ---------------- date / clock ---------------- */
function initDate() {
  const now = new Date();
  document.getElementById('todayDate').textContent = now.toLocaleDateString('pl-PL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  tickClock();
  setInterval(tickClock, 1000);
}
function tickClock() {
  const el = document.getElementById('liveClock');
  if (el) el.textContent = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

/* ---------------- sidebar ---------------- */
function iconShort(type, name) {
  if (type === 'teachers') {
    const parts = name.replace(/\(.*?\)/, '').trim().split('.').map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts.map(s => s[0]).join('') : name.substring(0, 3);
  }
  return name.substring(0, 3);
}
function iconClass(type) { return type === 'classes' ? 'cls' : type === 'teachers' ? 'tch' : 'room'; }

function listItemHtml(type, name, idx) {
  const pinned = isPinned(type, name);
  return `<button class="list-item" data-type="${type}" data-idx="${idx}" data-name="${esc(name.toLowerCase())}" onclick="selectPlan('${type}',${idx})">
    <div class="icon ${iconClass(type)}">${esc(iconShort(type, name))}</div>
    <span class="name">${esc(name)}</span>
    <span class="pin-btn ${pinned ? 'pinned' : ''}" onclick="togglePin('${type}','${esc(name).replace(/'/g,"\\'")}',event)" title="${pinned ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">
      <svg viewBox="0 0 24 24" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M11.5 2.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>
    </span>
  </button>`;
}

function initSidebar() {
  const list = document.getElementById('sidebarList');
  const classes = DATA.classes || [];
  const teachers = DATA.teachers || [];
  const rooms = DATA.rooms || [];

  let html = '';

  if (STATE.pinned.length) {
    html += '<div class="list-label">&#9733; Ulubione</div>';
    STATE.pinned.forEach(p => {
      const idx = (DATA[p.type] || []).findIndex(x => x.name === p.name);
      if (idx !== -1) html += listItemHtml(p.type, p.name, idx);
    });
  }

  html += '<div class="list-label">Klasy</div>';
  classes.forEach((c, i) => { html += listItemHtml('classes', c.name, i); });

  html += '<div class="list-label">Nauczyciele</div>';
  teachers.forEach((t, i) => { html += listItemHtml('teachers', t.name, i); });

  html += '<div class="list-label">Sale</div>';
  rooms.forEach((r, i) => { html += listItemHtml('rooms', r.name, i); });

  list.innerHTML = html;
  markActiveSidebar();
  filterSidebar();
}

function markActiveSidebar() {
  document.querySelectorAll('.list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.type === STATE.section && parseInt(el.dataset.idx) === STATE.selectedIndex);
  });
}

function filterSidebar() {
  const q = (document.getElementById('sideSearch').value || '').toLowerCase().trim();
  document.querySelectorAll('.list-item').forEach(el => {
    el.style.display = !q || (el.dataset.name || '').includes(q) ? '' : 'none';
  });
}

/* ---------------- selecting a plan ---------------- */
function selectPlan(type, idx) {
  STATE.section = type;
  STATE.selectedIndex = idx;
  STATE.selectedName = DATA[type]?.[idx]?.name || '';
  localStorage.setItem('sp3_last', JSON.stringify({ type, name: STATE.selectedName }));

  markActiveSidebar();
  renderContent();
  updateMobileCurrent();
  updateHash();
  updateCountdown();
}

function updateHash() {
  if (STATE.selectedIndex !== null && STATE.selectedName) {
    location.hash = `${STATE.section}/${encodeURIComponent(STATE.selectedName)}/${STATE.mainView}`;
  } else {
    location.hash = STATE.mainView;
  }
}

function switchMainView(view) {
  STATE.mainView = view;
  document.getElementById('navToday').classList.toggle('active', view === 'today');
  document.getElementById('navWeek').classList.toggle('active', view === 'week');
  document.getElementById('navZast').classList.toggle('active', view === 'zastepstwa');
  document.getElementById('navTodayM').classList.toggle('active', view === 'today');
  document.getElementById('navWeekM').classList.toggle('active', view === 'week');
  document.getElementById('navZastM').classList.toggle('active', view === 'zastepstwa');
  if (view === 'zastepstwa') {
    renderSubstitutions();
  } else {
    renderContent();
  }
  updateHash();
  updateCountdown();
}

function updateMobileCurrent() {
  const el = document.getElementById('mobileCurrent');
  if (!el) return;
  el.innerHTML = STATE.selectedName ? '<strong>' + esc(STATE.selectedName) + '</strong>' : 'Wybierz klasę';
}

/* ---------------- mobile picker ---------------- */
let pickerTab = 'classes';
function openPicker() {
  document.getElementById('pickerOverlay').classList.add('open');
  document.getElementById('pickerSearch').value = '';
  renderPickerList();
}
function closePicker(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('pickerOverlay').classList.remove('open');
}
function switchPickerTab(tab, btn) {
  pickerTab = tab;
  document.querySelectorAll('.picker-tabs button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('pickerSearch').value = '';
  renderPickerList();
}
function pickerRowHtml(item, i) {
  const pinned = isPinned(pickerTab, item.name);
  return `<div class="picker-row">
    <button class="select" onclick="pickItem('${pickerTab}',${i})"><div class="icon ${iconClass(pickerTab)}">${esc(iconShort(pickerTab, item.name))}</div><span>${esc(item.name)}</span></button>
    <button class="pin-btn ${pinned ? 'pinned' : ''}" onclick="togglePin('${pickerTab}','${esc(item.name).replace(/'/g,"\\'")}',event)">
      <svg viewBox="0 0 24 24" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M11.5 2.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>
    </button>
  </div>`;
}
function renderPickerList() {
  const list = document.getElementById('pickerList');
  const items = DATA[pickerTab] || [];
  let html = items.map((item, i) => pickerRowHtml(item, i)).join('');
  if (!items.length) html = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:14px">Brak wyników</div>';
  list.innerHTML = html;
}
function filterPicker() {
  const q = document.getElementById('pickerSearch').value.toLowerCase().trim();
  const items = DATA[pickerTab] || [];
  const list = document.getElementById('pickerList');
  let html = '';
  items.forEach((item, i) => {
    if (q && !item.name.toLowerCase().includes(q)) return;
    html += pickerRowHtml(item, i);
  });
  if (!html) html = '<div style="padding:40px;text-align:center;color:var(--muted);font-size:14px">Brak wyników</div>';
  list.innerHTML = html;
}
function pickItem(type, idx) {
  closePicker();
  selectPlan(type, idx);
}

/* ---------------- header quick actions ---------------- */
function syncHeaderPinButton() {
  const btn = document.getElementById('headerPinBtn');
  if (!btn) return;
  const pinned = isPinned(STATE.section, STATE.selectedName);
  btn.classList.toggle('pinned', pinned);
  btn.querySelector('svg').setAttribute('fill', pinned ? 'currentColor' : 'none');
}

function headerActionsHtml() {
  if (STATE.selectedIndex === null) return '';
  const pinned = isPinned(STATE.section, STATE.selectedName);
  let actions = `<button class="icon-btn ${pinned ? 'pinned' : ''}" id="headerPinBtn" onclick="togglePin('${STATE.section}','${esc(STATE.selectedName).replace(/'/g,"\\'")}')" title="Przypnij do ulubionych">
    <svg viewBox="0 0 24 24" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M11.5 2.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>
    ${pinned ? 'Przypięte' : 'Przypnij'}
  </button>`;
  if (STATE.mainView === 'week') {
    actions += `<button class="icon-btn" onclick="exportICS()" title="Eksportuj plan do kalendarza">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
      Do kalendarza
    </button>
    <button class="icon-btn" onclick="window.print()" title="Drukuj plan">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Drukuj
    </button>`;
  }
  return actions;
}

/* ---------------- main render shell ---------------- */
function renderMain() {
  const area = document.getElementById('mainArea');
  area.innerHTML = `
    <div class="main-header">
      <div>
        <h2 id="mainTitle">Dzisiejszy plan</h2>
        <div class="subtitle" id="mainSubtitle"></div>
      </div>
      <div class="header-actions" id="headerActions"></div>
    </div>
    <div id="mainContent"></div>`;
}

function renderContent() {
  const titleEl = document.getElementById('mainTitle');
  const subEl = document.getElementById('mainSubtitle');
  const container = document.getElementById('mainContent');
  const actionsEl = document.getElementById('headerActions');
  if (!titleEl || !container) return;

  if (STATE.selectedIndex === null) {
    titleEl.textContent = 'Witaj!';
    subEl.textContent = 'Wybierz klasę z panelu bocznego, aby zobaczyć plan lekcji.';
    if (actionsEl) actionsEl.innerHTML = '';
    container.innerHTML = `<div class="empty-state">
      <div class="icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5"/></svg></div>
      <h3>Plan lekcji SP3</h3>
      <p>Wybierz klasę, nauczyciela lub salę z listy po lewej stronie, aby wyświetlić szczegółowy plan. Naciśnij <b>/</b> aby szybko wyszukać.</p>
    </div>`;
    return;
  }

  const plan = DATA[STATE.section]?.[STATE.selectedIndex];
  if (!plan) return;

  titleEl.textContent = plan.name;
  subEl.textContent = STATE.section === 'classes' ? 'Plan lekcji klasy' : STATE.section === 'teachers' ? 'Plan nauczyciela' : 'Zajęcie sali';
  if (actionsEl) actionsEl.innerHTML = headerActionsHtml();

  if (STATE.mainView === 'today') {
    renderToday(container, plan);
  } else {
    renderWeek(container, plan);
  }
}

/* ---------------- substitution helpers ---------------- */
function parseSubDate(dateStr) {
  const m = (dateStr || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return { d: +m[1], mo: +m[2], y: +m[3] };
}
function isTodayDate(dateStr) {
  const p = parseSubDate(dateStr);
  if (!p) return false;
  const now = new Date();
  return p.d === now.getDate() && p.mo === now.getMonth() + 1 && p.y === now.getFullYear();
}
function teacherSurname(planName) {
  const m = planName.match(/\.([^\s(]+)/);
  return (m ? m[1] : planName).toLowerCase();
}
function subMatchesPlan(sub, section, planName) {
  if (!planName) return false;
  if (section === 'classes') {
    const cls = (sub.class || '').split('|')[0].trim().toLowerCase();
    return cls === planName.toLowerCase();
  }
  if (section === 'teachers') {
    return (sub.teacher || '').toLowerCase().includes(teacherSurname(planName));
  }
  return false;
}
function getAllSubs() { return (DATA.substitutions && DATA.substitutions.substitutions) || []; }
function getTodaysSubsForPlan(section, planName) {
  return getAllSubs().filter(s => isTodayDate(s.date) && subMatchesPlan(s, section, planName));
}

/* ---------------- schedule status / rail ---------------- */
function computeDaySchedule(plan, dayIdx) {
  const raw = [];
  for (const lesson of (plan.lessons || [])) {
    const day = lesson.days?.[dayIdx];
    if (!day || !day.subject) continue;
    const t = parseLessonTime(lesson.time);
    if (!t) continue;
    raw.push({ lesson_nr: lesson.lesson_nr, time: lesson.time, start: t.start, end: t.end, day });
  }
  raw.sort((a, b) => a.start - b.start);
  const withGaps = [];
  for (let i = 0; i < raw.length; i++) {
    if (i > 0 && raw[i].start > withGaps[withGaps.length - 1].end) {
      withGaps.push({ gap: true, start: withGaps[withGaps.length - 1].end, end: raw[i].start });
    }
    withGaps.push(raw[i]);
  }
  return withGaps;
}
function scheduleStatus(schedule, nowMin) {
  const lessons = schedule.filter(s => !s.gap);
  if (!lessons.length) return { state: 'none' };
  if (nowMin < lessons[0].start) return { state: 'before', next: lessons[0], minutesTo: lessons[0].start - nowMin };
  if (nowMin >= lessons[lessons.length - 1].end) return { state: 'after' };
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i];
    if (nowMin >= l.start && nowMin < l.end) return { state: 'in', current: l, minutesLeft: l.end - nowMin };
    if (nowMin < l.start) return { state: 'break', next: l, minutesTo: l.start - nowMin };
  }
  return { state: 'after' };
}
function renderDayRail(schedule, nowMin) {
  if (!schedule.length) return '';
  const dayStart = schedule[0].start, dayEnd = schedule[schedule.length - 1].end;
  const totalDur = dayEnd - dayStart;
  const segs = schedule.map(s => {
    const dur = s.end - s.start;
    const flex = Math.max(dur, 4);
    if (s.gap) return `<div class="rail-seg gap" style="flex:${flex} 0 0%" title="Okienko"></div>`;
    const color = getSubjectColor(s.day.subject);
    const past = nowMin >= s.end ? ' past' : '';
    return `<div class="rail-seg${past}" style="flex:${flex} 0 0%;--c:${color}" title="${esc(s.day.subject)} (${esc(s.time)})"></div>`;
  }).join('');
  let nowMarker = '';
  if (nowMin >= dayStart && nowMin <= dayEnd) {
    const pct = ((nowMin - dayStart) / totalDur) * 100;
    nowMarker = `<div class="rail-now" style="left:${pct}%"></div>`;
  }
  const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  return `<div class="day-rail">
    <div class="rail-track">${segs}${nowMarker}</div>
    <div class="rail-labels"><span>${fmt(dayStart)}</span><span>${fmt(dayEnd)}</span></div>
  </div>`;
}
function statusLineHtml(status) {
  if (status.state === 'none') return '';
  if (status.state === 'before') return `<div class="status-main">Zaczynasz za <span class="accent">${fmtMin(status.minutesTo)}</span></div><div class="status-sub">Pierwsza lekcja: ${esc(status.next.day.subject)} o ${esc(status.next.time.split('-')[0].trim())}</div>`;
  if (status.state === 'in') return `<div class="status-main">Teraz: <span class="accent">${esc(status.current.day.subject)}</span></div><div class="status-sub">Koniec za ${fmtMin(status.minutesLeft)}</div>`;
  if (status.state === 'break') return `<div class="status-main">Przerwa &middot; kolejna lekcja za <span class="accent">${fmtMin(status.minutesTo)}</span></div><div class="status-sub">${esc(status.next.day.subject)} o ${esc(status.next.time.split('-')[0].trim())}</div>`;
  if (status.state === 'after') return `<div class="status-main">Lekcje zakończone na dziś &#127881;</div><div class="status-sub">Do zobaczenia jutro</div>`;
  return '';
}

/* ---------------- countdown timer ---------------- */
function updateCountdown() {
  const wrap = document.getElementById('countdownWrap');
  if (!wrap || STATE.mainView !== 'today' || STATE.selectedIndex === null) {
    if (wrap) wrap.classList.remove('visible');
    return;
  }
  const plan = DATA[STATE.section]?.[STATE.selectedIndex];
  if (!plan) { wrap.classList.remove('visible'); return; }

  const dayIdx = getTodayIndex();
  if (dayIdx === -1) { wrap.classList.remove('visible'); return; }

  const schedule = computeDaySchedule(plan, dayIdx).filter(s => !s.gap);
  if (!schedule.length) { wrap.classList.remove('visible'); return; }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const status = scheduleStatus(schedule, nowMin);

  const labelEl = document.getElementById('countdownLabel');
  const timeEl = document.getElementById('countdownTime');
  const detailEl = document.getElementById('countdownDetail');
  const barEl = document.getElementById('countdownBar');

  wrap.classList.add('visible');

  if (status.state === 'before') {
    labelEl.textContent = 'Następna lekcja za';
    timeEl.textContent = String(Math.floor(status.minutesTo / 60)).padStart(2, '0') + ':' + String(status.minutesTo % 60).padStart(2, '0');
    detailEl.textContent = status.next.day.subject + ' (' + status.next.time.split('-')[0].trim() + ')';
    barEl.style.width = '0%';
  } else if (status.state === 'in') {
    labelEl.textContent = 'Koniec lekcji za';
    timeEl.textContent = String(Math.floor(status.minutesLeft / 60)).padStart(2, '0') + ':' + String(status.minutesLeft % 60).padStart(2, '0');
    detailEl.textContent = status.current.day.subject;
    const total = status.current.end - status.current.start;
    const elapsed = nowMin - status.current.start;
    barEl.style.width = Math.min(100, (elapsed / total) * 100) + '%';
  } else if (status.state === 'break') {
    labelEl.textContent = 'Przerwa';
    timeEl.textContent = String(Math.floor(status.minutesTo / 60)).padStart(2, '0') + ':' + String(status.minutesTo % 60).padStart(2, '0');
    detailEl.textContent = 'Następna: ' + status.next.day.subject;
    barEl.style.width = '0%';
  } else {
    labelEl.textContent = status.state === 'after' ? 'Koniec lekcji' : 'Brak lekcji';
    timeEl.textContent = '--:--';
    detailEl.textContent = '';
    barEl.style.width = '0%';
  }
}

/* ---------------- today view ---------------- */
function renderToday(container, plan) {
  const dayIdx = getTodayIndex();
  if (dayIdx === -1) {
    container.innerHTML = `<div class="no-school">
      <div class="icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg></div>
      <h3>Weekend!</h3>
      <p>Dziś nie ma lekcji. Przejdź do widoku „Tydzień", aby zobaczyć plan na cały tydzień.</p>
    </div>`;
    return;
  }

  const schedule = computeDaySchedule(plan, dayIdx);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todaySubs = getTodaysSubsForPlan(STATE.section, STATE.selectedName);
  const subByLessonNr = {};
  todaySubs.forEach(s => {
    const m = (s.lesson || '').match(/^(\d+)/);
    if (m) subByLessonNr[m[1]] = s;
  });

  let html = '';

  if (todaySubs.length) {
    html += `<div class="alert-banner warn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <div><strong>Dziś masz ${todaySubs.length} ${todaySubs.length === 1 ? 'zastępstwo' : 'zastępstwa'}</strong> — sprawdź szczegóły poniżej lub w zakładce Zastępstwa.</div>
        <div class="alert-list">${todaySubs.slice(0, 4).map(s => `<span>Lekcja ${esc(s.lesson.split(',')[0])}: ${esc(s.subject || '—')} ${s.substitute ? '— ' + esc(s.substitute) : ''}</span>`).join('')}</div>
      </div>
    </div>`;
  }

  if (schedule.length) {
    html += `<div class="day-rail-wrap">
      <div class="day-rail-status">${statusLineHtml(scheduleStatus(schedule, nowMin))}</div>
      ${renderDayRail(schedule, nowMin)}
    </div>`;
  }

  let cardsHtml = '';
  for (const item of schedule) {
    if (item.gap) {
      const dur = item.end - item.start;
      if (dur >= 5) {
        cardsHtml += `<div class="gap-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Okienko &middot; ${fmtMin(dur)} wolnego
        </div>`;
      }
      continue;
    }
    const s = item;
    let status = 'future';
    if (nowMin >= s.end) status = 'past';
    else if (nowMin >= s.start && nowMin < s.end) status = 'current';
    const color = getSubjectColor(s.day.subject);
    const subInfo = subByLessonNr[String(s.lesson_nr)];
    cardsHtml += `<div class="today-card ${status}${subInfo ? ' is-sub' : ''}" style="--c:${color || 'var(--border-2)'}">
      <div class="card-top">
        <span class="card-nr">Lekcja ${esc(s.lesson_nr)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          ${status === 'current' ? '<span class="live-badge">Teraz</span>' : ''}
          ${subInfo ? '<span class="sub-badge">Zastępstwo</span>' : ''}
          <span class="card-time">${esc(s.time)}</span>
        </div>
      </div>
      <div class="card-subject" style="color:${color || 'inherit'}">${esc(s.day.subject)}</div>
      <div class="card-meta">
        ${s.day.teacher ? `<span><span class="label">Nauczyciel:</span> ${esc(s.day.teacher)}</span>` : ''}
        ${s.day.room ? `<span><span class="label">Sala:</span> ${esc(s.day.room)}</span>` : ''}
        ${s.day.group ? `<span><span class="label">Grupa:</span> ${esc(s.day.group)}</span>` : ''}
      </div>
      ${subInfo ? `<div class="card-meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)"><span><span class="label">Status:</span> ${esc(subInfo.substitute || 'brak informacji')}</span></div>` : ''}
    </div>`;
  }

  if (!cardsHtml) {
    html += `<div class="empty-state">
      <div class="icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
      <h3>Brak lekcji</h3>
      <p>Na dziś nie ma zaplanowanych lekcji.</p>
    </div>`;
  } else {
    html += `<div class="today-cards">${cardsHtml}</div>`;
  }

  container.innerHTML = html;
}

/* ---------------- week view ---------------- */
function renderWeek(container, plan) {
  const todayIdx = getTodayIndex();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const usedSubjects = new Set();
  const usedTeachers = new Set();
  const usedRooms = new Set();
  let lessonCount = 0;
  let durationMin = null;

  let html = '<div class="week-layout"><div><div class="week-table-wrap"><table class="week"><thead><tr><th>Nr</th><th>Godz.</th>';
  DAYS_PL.forEach((d, i) => { html += `<th class="${i === todayIdx ? 'today-col' : ''}">${d}</th>`; });
  html += '</tr></thead><tbody>';

  for (const lesson of (plan.lessons || [])) {
    const t = parseLessonTime(lesson.time);
    if (t && durationMin === null) durationMin = t.end - t.start;
    const isNowRow = t && todayIdx !== -1 && nowMin >= t.start && nowMin < t.end;
    html += '<tr>';
    html += `<td>${esc(lesson.lesson_nr)}</td>`;
    html += `<td style="font-size:12px;white-space:nowrap">${esc(lesson.time)}</td>`;

    const days = lesson.days || [];
    for (let i = 0; i < 5; i++) {
      const d = days[i];
      const isToday = i === todayIdx;
      const isNowCell = isToday && isNowRow;
      const cellCls = [isToday ? 'today-col' : '', isNowCell ? 'now-cell' : ''].filter(Boolean).join(' ');
      if (!d || (!d.subject && !d.teacher && !d.room)) { html += `<td class="${cellCls}"></td>`; continue; }
      const color = getSubjectColor(d.subject);
      if (d.subject) { usedSubjects.add(d.subject); lessonCount++; }
      if (d.teacher) usedTeachers.add(d.teacher);
      if (d.room) usedRooms.add(d.room);
      html += `<td class="${cellCls}"><div class="w-cell" style="background:${color ? hexToRgba(color, .14) : 'transparent'}">`;
      if (d.subject) {
        html += `<div class="w-subject" style="color:${color || 'inherit'}">${esc(d.subject)}`;
        if (d.group) html += ` <span class="w-group">${esc(d.group)}</span>`;
        html += '</div>';
      }
      if (d.teacher) html += `<div class="w-teacher">${esc(d.teacher)}</div>`;
      if (d.room) html += `<div class="w-room">${esc(d.room)}</div>`;
      html += '</div></td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';

  html += '<div class="legend-card"><h4>Legenda przedmiotów</h4><div class="legend-grid">';
  Array.from(usedSubjects).sort().forEach(s => {
    const color = getSubjectColor(s);
    html += `<div class="legend-row"><span class="legend-dot2" style="background:${color}"></span><span>${esc(s)}</span></div>`;
  });
  if (!usedSubjects.size) html += `<div class="legend-row"><span>Brak danych</span></div>`;
  html += '</div></div></div>';

  html += `<div class="stats-row">
    <div class="stat-card"><div class="stat-icon" style="background:var(--green-soft);color:var(--green)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><div><div class="stat-label">Liczba lekcji w tygodniu</div><div class="stat-value">${lessonCount}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--purple-soft);color:var(--purple)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div><div class="stat-label">Liczba nauczycieli</div><div class="stat-value">${usedTeachers.size}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--amber-soft);color:var(--amber)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg></div><div><div class="stat-label">Liczba sal</div><div class="stat-value">${usedRooms.size}</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:var(--accent-soft);color:var(--accent)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div><div class="stat-label">Długość lekcji</div><div class="stat-value">${durationMin ? durationMin + ' min' : '—'}</div></div></div>
  </div>`;

  container.innerHTML = html;
}

/* ---------------- ICS export ---------------- */
function pad2(n) { return String(n).padStart(2, '0'); }
function icsDate(date) {
  return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) + 'T' + pad2(date.getHours()) + pad2(date.getMinutes()) + '00';
}
function icsEscape(s) { return String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n'); }
function exportICS() {
  const plan = DATA[STATE.section]?.[STATE.selectedIndex];
  if (!plan) return;

  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  if (dow === 0) monday.setDate(now.getDate() + 1);
  else if (dow === 6) monday.setDate(now.getDate() + 2);
  else monday.setDate(now.getDate() - (dow - 1));
  monday.setHours(0, 0, 0, 0);

  const untilDate = new Date(monday);
  untilDate.setDate(untilDate.getDate() + 7 * 16);
  const untilStr = untilDate.getFullYear() + pad2(untilDate.getMonth() + 1) + pad2(untilDate.getDate()) + 'T000000Z';

  let events = '';
  let count = 0;
  for (let i = 0; i < 5; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    for (const lesson of (plan.lessons || [])) {
      const d = lesson.days?.[i];
      if (!d || !d.subject) continue;
      const t = parseLessonTime(lesson.time);
      if (!t) continue;
      const start = new Date(date); start.setHours(Math.floor(t.start / 60), t.start % 60, 0, 0);
      const end = new Date(date); end.setHours(Math.floor(t.end / 60), t.end % 60, 0, 0);
      const uid = `sp3-${STATE.section}-${plan.name}-${i}-${lesson.lesson_nr}@sp3plan`.replace(/\s+/g, '');
      const descParts = [];
      if (d.teacher) descParts.push('Nauczyciel: ' + d.teacher);
      if (d.group) descParts.push('Grupa: ' + d.group);
      events += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${icsDate(new Date())}Z
DTSTART:${icsDate(start)}
DTEND:${icsDate(end)}
RRULE:FREQ=WEEKLY;UNTIL=${untilStr}
SUMMARY:${icsEscape(d.subject)}${d.group ? ' (' + icsEscape(d.group) + ')' : ''}
LOCATION:${icsEscape(d.room || '')}
DESCRIPTION:${icsEscape(descParts.join('\\n'))}
END:VEVENT
`;
      count++;
    }
  }

  if (!count) { showToast('Brak lekcji do wyeksportowania', false); return; }

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SP3 Plan Lekcji//PL
CALSCALE:GREGORIAN
${events}END:VCALENDAR`;

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plan-${plan.name}.ics`.replace(/\s+/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Plan wyeksportowany do kalendarza (powtarza się co tydzień)', true);
}

/* ---------------- substitutions view ---------------- */
function tagFor(sub) {
  let tagClass = 'replaced', tagText = sub || '';
  if (sub.includes('konsekwencji')) { tagClass = 'no-consequence'; tagText = 'Odwołana'; }
  else if (sub.includes('zwolnieni')) { tagClass = 'cancelled'; tagText = 'Zwolnieni'; }
  else if (sub.includes('Uczniowie') && sub.includes('później')) { tagClass = 'late'; tagText = 'Później'; }
  return { tagClass, tagText };
}

function renderSubstitutions() {
  const titleEl = document.getElementById('mainTitle');
  const subEl = document.getElementById('mainSubtitle');
  const container = document.getElementById('mainContent');
  const actionsEl = document.getElementById('headerActions');
  if (!titleEl || !container) return;
  if (actionsEl) actionsEl.innerHTML = '';

  const allSubs = getAllSubs();

  titleEl.textContent = 'Zastępstwa';
  subEl.textContent = allSubs.length ? 'Aktualne zastępstwa ze strony szkoły' : 'Brak danych o zastępstwach';

  if (!allSubs.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
      <h3>Brak zastępstw</h3>
      <p>Na dziś nie ma zastępstw lub nie udało się pobrać danych.</p>
    </div>`;
    return;
  }

  let filtered = allSubs;
  const q = STATE.subFilter.toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(s => (s.teacher || '').toLowerCase().includes(q) || (s.class || '').toLowerCase().includes(q) || (s.subject || '').toLowerCase().includes(q));
  }
  if (STATE.subOnlyMine && STATE.selectedName) {
    filtered = filtered.filter(s => subMatchesPlan(s, STATE.section, STATE.selectedName));
  }

  const toolbarHtml = `<div class="sub-toolbar">
    <div class="sub-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="subSearchInput" placeholder="Szukaj po klasie, nauczycielu, przedmiocie..." value="${esc(STATE.subFilter)}" oninput="onSubFilterInput(this.value)">
    </div>
    ${STATE.selectedName ? `<button class="chip ${STATE.subOnlyMine ? 'active' : ''}" onclick="toggleSubOnlyMine()">Tylko: ${esc(STATE.selectedName)}</button>` : ''}
  </div>`;

  const legendHtml = `<div class="sub-legend">
    <div class="legend-item"><div class="legend-dot replaced"></div>Zastąpiony</div>
    <div class="legend-item"><div class="legend-dot no-consequence"></div>Bez konsekwencji</div>
    <div class="legend-item"><div class="legend-dot cancelled"></div>Zwolnieni do domu</div>
    <div class="legend-item"><div class="legend-dot late"></div>Uczniowie przychodzą później</div>
  </div>`;

  if (!filtered.length) {
    container.innerHTML = toolbarHtml + `<div class="empty-state">
      <div class="icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>
      <h3>Brak wyników</h3>
      <p>Nie znaleziono zastępstw pasujących do filtra.</p>
    </div>`;
    return;
  }

  let html = toolbarHtml + legendHtml;
  const dates = [...new Set(filtered.map(s => s.date || 'Brak daty'))];

  for (const date of dates) {
    const dateSubs = filtered.filter(s => (s.date || 'Brak daty') === date);
    const todayFlag = isTodayDate(date);

    if (dates.length > 1) {
      html += `<div style="margin:28px 0 14px;padding:10px 16px;background:${todayFlag ? 'var(--accent)' : 'var(--accent-soft)'};border-radius:10px;font-weight:700;font-size:14px;color:${todayFlag ? '#fff' : 'var(--accent)'}">${esc(date)}${todayFlag ? ' &middot; dziś' : ''}</div>`;
    } else {
      html += `<div style="margin-bottom:18px;font-size:12.5px;color:var(--muted);font-weight:500">${esc(date)}${todayFlag ? ' &middot; dziś' : ''}</div>`;
    }

    const byTeacher = {};
    for (const s of dateSubs) {
      const key = s.teacher || 'Inny';
      if (!byTeacher[key]) byTeacher[key] = [];
      byTeacher[key].push(s);
    }
    const sortedTeachers = Object.keys(byTeacher).sort((a, b) => a.localeCompare(b, 'pl'));

    for (const teacher of sortedTeachers) {
      const items = byTeacher[teacher];
      html += `<div style="margin-bottom:26px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:30px;height:30px;border-radius:8px;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;flex-shrink:0">${esc(teacher.split(' ').map(w => w[0]).join('').substring(0, 2))}</div>
          <h3 style="font-size:14.5px;font-weight:700;color:var(--text)">${esc(teacher)}</h3>
          <span style="font-size:11.5px;color:var(--muted);font-weight:500">${items.length} zast.</span>
        </div>
        <div class="sub-table-wrap"><table class="sub-table"><thead><tr>
          <th>Lekcja</th><th>Klasa</th><th>Przedmiot</th><th>Sala</th><th>Zastępca / Status</th>
        </tr></thead><tbody>`;

      for (const s of items) {
        const { tagClass, tagText } = tagFor(s.substitute || '');
        const mine = STATE.selectedName && subMatchesPlan(s, STATE.section, STATE.selectedName);
        html += `<tr class="${mine ? 'mine' : ''}">
          <td class="nr-col">${esc(s.lesson)}</td>
          <td class="class-col">${esc(s.class)}</td>
          <td>${esc(s.subject)}</td>
          <td class="room-col">${esc(s.room)}</td>
          <td><span class="sub-tag ${tagClass}">${esc(tagText)}</span>${s.notes ? `<div class="sub-notes">${esc(s.notes)}</div>` : ''}</td>
        </tr>`;
      }
      html += '</tbody></table></div></div>';
    }
  }

  container.innerHTML = html;
  const input = document.getElementById('subSearchInput');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}
function onSubFilterInput(v) { STATE.subFilter = v; renderSubstitutions(); }
function toggleSubOnlyMine() { STATE.subOnlyMine = !STATE.subOnlyMine; renderSubstitutions(); }

/* ---------------- toast / sync ---------------- */
function showToast(msg, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (ok ? 'ok' : 'err') + ' show';
  setTimeout(() => t.classList.remove('show'), 4000);
}

function updateSyncLabel() {
  const syncEl = document.getElementById('lastSync');
  if (syncEl && DATA.updated_at) {
    const d = new Date(DATA.updated_at);
    syncEl.textContent = 'Zaktualizowano: ' + d.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' });
  }
}

async function syncData() {
  const btn = document.getElementById('refreshBtn');
  const btnM = document.getElementById('refreshBtnMobile');
  btn.disabled = true;
  if (btnM) { btnM.disabled = true; btnM.classList.add('spinning'); }
  btn.classList.add('spinning');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const r = await fetch('/api/sync', { method: 'POST', signal: controller.signal });
    clearTimeout(timeout);
    const j = await r.json();
    if (j.ok) {
      DATA = j.data || j;
      saveDataCache(DATA);
      initSidebar();
      if (STATE.mainView === 'zastepstwa') renderSubstitutions();
      else if (STATE.selectedIndex !== null) renderContent();
      updateSyncLabel();
      showToast('Dane zaktualizowane!', true);
    } else {
      showToast('Błąd: ' + (j.error || 'Nieznany'), false);
    }
  } catch (e) {
    showToast('Błąd połączenia — spróbuj ponownie', false);
  } finally {
    btn.disabled = false;
    btn.classList.remove('spinning');
    if (btnM) { btnM.disabled = false; btnM.classList.remove('spinning'); }
  }
}

async function backgroundRefresh() {
  try {
    const r = await fetch('/api/timetable');
    if (!r.ok) return;
    const j = await r.json();
    if (j.updated_at && j.updated_at !== DATA.updated_at) {
      DATA = j;
      saveDataCache(DATA);
      initSidebar();
      if (STATE.mainView === 'zastepstwa') renderSubstitutions();
      else if (STATE.selectedIndex !== null) renderContent();
      updateSyncLabel();
      showToast('Dane zaktualizowane w tle', true);
    }
  } catch {}
}

/* ---------------- restore state ---------------- */
function restoreFromHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!hash) return false;
  const parts = hash.split('/');
  if (parts.length === 3) {
    const [type, name, view] = parts;
    const items = DATA[type] || [];
    const idx = items.findIndex(c => c.name === name);
    if (idx !== -1) {
      STATE.mainView = ['today', 'week', 'zastepstwa'].includes(view) ? view : 'today';
      STATE.section = type;
      STATE.selectedIndex = idx;
      STATE.selectedName = name;
      return true;
    }
  } else if (['today', 'week', 'zastepstwa'].includes(hash)) {
    STATE.mainView = hash;
  }
  return false;
}
function restoreDefault() {
  const gotPlan = restoreFromHash();
  if (!gotPlan) {
    try {
      const saved = JSON.parse(localStorage.getItem('sp3_last') || 'null');
      if (saved) {
        const items = DATA[saved.type] || [];
        const idx = items.findIndex(c => c.name === saved.name);
        if (idx !== -1) { STATE.section = saved.type; STATE.selectedIndex = idx; STATE.selectedName = saved.name; }
      }
    } catch {}
  }
  markActiveSidebar();
  document.getElementById('navToday').classList.toggle('active', STATE.mainView === 'today');
  document.getElementById('navWeek').classList.toggle('active', STATE.mainView === 'week');
  document.getElementById('navZast').classList.toggle('active', STATE.mainView === 'zastepstwa');
  document.getElementById('navTodayM').classList.toggle('active', STATE.mainView === 'today');
  document.getElementById('navWeekM').classList.toggle('active', STATE.mainView === 'week');
  document.getElementById('navZastM').classList.toggle('active', STATE.mainView === 'zastepstwa');
  updateMobileCurrent();
}

/* ---------------- keyboard shortcuts ---------------- */
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape') { e.target.blur(); closePicker(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); document.getElementById('sideSearch')?.focus(); }
  else if (e.key === '1') switchMainView('today');
  else if (e.key === '2') switchMainView('week');
  else if (e.key === '3') switchMainView('zastepstwa');
  else if (e.key === 'Escape') closePicker();
});



/* ---------------- load fresh data ---------------- */
const CACHE_KEY = 'sp3_data_cache';

function saveDataCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}
function loadDataCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

async function loadFreshData() {
  try {
    const r = await fetch('/api/sync', { method: 'POST' });
    const j = await r.json();
    if (j.ok) {
      const data = j.data || j;
      saveDataCache(data);
      return data;
    }
  } catch {}

  try {
    const r = await fetch('/api/timetable');
    if (r.ok) {
      const data = await r.json();
      saveDataCache(data);
      return data;
    }
  } catch {}

  const cached = loadDataCache();
  if (cached) return cached;

  try {
    const r = await fetch('data.json?v=' + Date.now());
    if (r.ok) {
      const data = await r.json();
      saveDataCache(data);
      return data;
    }
  } catch {}

  return { classes: [], teachers: [], rooms: [], updated_at: null };
}

/* ---------------- init ---------------- */
async function init() {
  initTheme();
  loadPinned();
  initDate();

  DATA = await loadFreshData();

  initSidebar();
  renderMain();
  restoreDefault();
  if (STATE.mainView === 'zastepstwa') renderSubstitutions();
  else renderContent();
  updateSyncLabel();
  updateCountdown();

  setInterval(tickClock, 1000);
  setInterval(updateCountdown, 1000);
  setInterval(() => {
    if (STATE.mainView === 'today' && STATE.selectedIndex !== null) renderContent();
  }, 30000);
  setInterval(backgroundRefresh, 5 * 60 * 1000);
}

init();
