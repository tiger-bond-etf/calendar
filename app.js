/* ===================================================
   채권ETF운용본부 업무 캘린더 — app.js
=================================================== */

const CONFIG = {
  owner: 'tiger-bond-etf',
  repo:  'calendar',
};

const CAT_COLOR = {
  '리밸런싱': '#3b82f6',
  '롤오버':   '#8b5cf6',
  '매매':     '#ec4899',
  '스왑':     '#14b8a6',
  '분배':     '#059669',
  '상장':     '#d97706',
  '기타':     '#6b7280',
};

// ===================== GitHub Storage =====================

class GitHubStorage {
  constructor() {
    this.token = localStorage.getItem('gh_token') || '';
    this.cache = {};
  }

  get headers() {
    return {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  filePath(year, month) {
    return `data/${year}-${String(month).padStart(2, '0')}.json`;
  }

  cacheKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  async loadMonth(year, month) {
    const key = this.cacheKey(year, month);
    if (this.cache[key]) return this.cache[key];
    if (!this.token) {
      this.cache[key] = { data: {}, sha: null };
      return this.cache[key];
    }
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${this.filePath(year, month)}`;
    try {
      const res = await fetch(url, { headers: this.headers });
      if (res.status === 404) { this.cache[key] = { data: {}, sha: null }; return this.cache[key]; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const file = await res.json();
      const raw = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
      this.cache[key] = { data: JSON.parse(raw), sha: file.sha };
      return this.cache[key];
    } catch (e) {
      console.error('loadMonth error:', e);
      this.cache[key] = { data: {}, sha: null };
      return this.cache[key];
    }
  }

  async saveMonth(year, month, data) {
    const key = this.cacheKey(year, month);
    const sha = this.cache[key]?.sha || null;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${this.filePath(year, month)}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ message: `Update ${key}`, content, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || `HTTP ${res.status}`); }
    const result = await res.json();
    this.cache[key] = { data, sha: result.content.sha };
  }

  async saveFile(path, data) {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;
    // get current sha
    let sha = null;
    try {
      const r = await fetch(url, { headers: this.headers });
      if (r.ok) { const f = await r.json(); sha = f.sha; }
    } catch (_) {}
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ message: `Update ${path}`, content, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || `HTTP ${res.status}`); }
  }

  async loadFundData() {
    // public raw URL — no token needed
    const url = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/main/data/funds.json?t=${Date.now()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
}

// ===================== Helpers =====================

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatDateKo(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = days[new Date(dateStr).getDay()];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${dow})`;
}

function isToday(year, month, day) {
  const t = new Date();
  return t.getFullYear() === year && t.getMonth() + 1 === month && t.getDate() === day;
}

function formatAmount(won) {
  const n = Number(won);
  if (!n) return '';
  if (n >= 100000000) return (n / 100000000).toFixed(0) + '억원';
  if (n >= 10000)     return (n / 10000).toFixed(0) + '만원';
  return n.toLocaleString() + '원';
}

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => { el.className = 'toast hidden'; }, 2800);
}

// ===================== App =====================

class CalendarApp {
  constructor() {
    this.storage    = new GitHubStorage();
    this.now        = new Date();
    this.year       = this.now.getFullYear();
    this.month      = this.now.getMonth() + 1;
    this.monthEntry = null;
    this.openDate   = null;
    this.activeTab  = '일정';
    this.fundData   = null;       // { funds: { code: { name, navPerCU } }, updatedAt }
    this.curNavPerCU = 0;         // navPerCU for currently entered fund code
  }

  async init() {
    this.bindEvents();
    await this.loadAndRender();
    this.fundData = await this.storage.loadFundData();
    this.updateFundUpdatedAt();
    if (!this.storage.token) showToast('설정에서 GitHub 토큰을 입력해주세요.', 'error');
  }

  bindEvents() {
    document.getElementById('btn-prev').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('btn-next').addEventListener('click', () => this.changeMonth(1));
    document.getElementById('btn-close').addEventListener('click', () => this.closeModal());
    document.getElementById('overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeModal();
    });
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());
    document.getElementById('btn-settings-close').addEventListener('click', () => this.closeSettings());
    document.getElementById('settings-overlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeSettings();
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // 펀드코드 자동완성
    document.getElementById('설환-코드').addEventListener('blur', () => this.onFundCodeBlur());

    // CU 자동계산
    document.getElementById('설환-cu').addEventListener('input', () => this.calcAmount());

    // Excel 파일 선택
    document.getElementById('fund-file-input').addEventListener('change', e => {
      if (e.target.files[0]) this.handleFundUpdate(e.target.files[0]);
      e.target.value = '';
    });
  }

  // ---- Fund auto-fill ----

  onFundCodeBlur() {
    const code = document.getElementById('설환-코드').value.trim();
    if (!code || !this.fundData?.funds) return;
    const fund = this.fundData.funds[code];
    if (fund) {
      document.getElementById('설환-펀드명').value = fund.name;
      this.curNavPerCU = fund.navPerCU || 0;
      this.calcAmount();
    }
  }

  calcAmount() {
    const cu = parseFloat(document.getElementById('설환-cu').value) || 0;
    const amount = cu * this.curNavPerCU;
    document.getElementById('설환-금액').value = amount > 0 ? formatAmount(amount) : '';
  }

  // ---- Fund Excel update ----

  async handleFundUpdate(file) {
    if (!this.storage.token) {
      showToast('GitHub 토큰이 설정되어 있어야 업데이트할 수 있습니다.', 'error');
      return;
    }
    showToast('파일 읽는 중...', '');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const funds = {};
      // 1행 = 헤더, 2행부터 데이터
      for (let i = 1; i < rows.length; i++) {
        const [code, name, navPerCU] = rows[i];
        const c = String(code || '').trim();
        const n = String(name || '').trim();
        if (c && n) {
          funds[c] = { name: n, navPerCU: Number(navPerCU) || 0 };
        }
      }

      const today = new Date().toISOString().split('T')[0];
      const fundData = { updatedAt: today, funds };
      await this.storage.saveFile('data/funds.json', fundData);
      this.fundData = fundData;
      this.updateFundUpdatedAt();
      showToast(`펀드 데이터 업데이트 완료 (${Object.keys(funds).length}개 펀드)`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`업데이트 실패: ${e.message}`, 'error');
    }
  }

  updateFundUpdatedAt() {
    const el = document.getElementById('fund-updated-at');
    if (el) el.textContent = `마지막 업데이트: ${this.fundData?.updatedAt || '-'}`;
  }

  // ---- Month ----

  async changeMonth(delta) {
    this.month += delta;
    if (this.month > 12) { this.month = 1; this.year++; }
    if (this.month < 1)  { this.month = 12; this.year--; }
    await this.loadAndRender();
  }

  async loadAndRender() {
    document.getElementById('month-title').textContent = `${this.year}년 ${this.month}월`;
    this.monthEntry = await this.storage.loadMonth(this.year, this.month);
    this.renderCalendar();
  }

  // ---- Calendar ----

  renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const firstDow   = new Date(this.year, this.month - 1, 1).getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const data = this.monthEntry?.data || {};

    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div');
      el.className = 'cell empty';
      grid.appendChild(el);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this.year}-${String(this.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow = (firstDow + d - 1) % 7;
      grid.appendChild(this.renderCell(d, dateStr, dow, data[dateStr] || {}));
    }
  }

  renderCell(d, dateStr, dow, dayData) {
    const cell = document.createElement('div');
    let cls = 'cell';
    if (dow === 0) cls += ' sunday';
    if (dow === 6) cls += ' saturday';
    if (isToday(this.year, this.month, d)) cls += ' today';
    cell.className = cls;
    cell.addEventListener('click', () => this.openModal(dateStr));

    const dayEl = document.createElement('div');
    dayEl.className = 'cell-day';
    dayEl.textContent = d;
    cell.appendChild(dayEl);

    const eventsEl = document.createElement('div');
    eventsEl.className = 'cell-events';
    const events = this.getCellEvents(dayData);
    const maxShow = 4;
    events.slice(0, maxShow).forEach(ev => {
      const el = document.createElement('div');
      el.className = `cell-event cat-${ev.cat}`;
      el.textContent = ev.label;
      eventsEl.appendChild(el);
    });
    if (events.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'cell-more';
      more.textContent = `+${events.length - maxShow}개 더`;
      eventsEl.appendChild(more);
    }
    cell.appendChild(eventsEl);
    return cell;
  }

  getCellEvents(dayData) {
    const events = [];
    (dayData['일정'] || []).forEach(item =>
      events.push({ cat: '일정', label: item.title || '' }));
    (dayData['업무'] || []).forEach(item =>
      events.push({ cat: item.category || '기타', label: item.title || '' }));
    (dayData['설정환매'] || []).forEach(item =>
      events.push({ cat: '설정환매', label: item.fundName || item.fundCode || '설정/환매' }));
    return events;
  }

  // ---- Modal ----

  async openModal(dateStr) {
    this.openDate = dateStr;
    this.curNavPerCU = 0;
    document.getElementById('modal-date').textContent = formatDateKo(dateStr);
    document.getElementById('overlay').classList.remove('hidden');
    this.switchTab('일정');
    this.renderSummary();
  }

  closeModal() {
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('save-status').textContent = '';
    this.openDate = null;
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('hidden', p.id !== `panel-${tab}`);
    });
  }

  getDayData() {
    if (!this.openDate) return {};
    return (this.monthEntry?.data || {})[this.openDate] || {};
  }

  setDayData(dayData) {
    if (!this.openDate) return;
    if (!this.monthEntry) this.monthEntry = { data: {}, sha: null };
    this.monthEntry.data[this.openDate] = dayData;
  }

  // ---- Summary ----

  renderSummary() {
    const el = document.getElementById('summary-section');
    const dayData = this.getDayData();
    el.innerHTML = '';

    const sections = [
      { key: '일정',    label: '일정',          cls: 'label-일정' },
      { key: '업무',    label: '업무',          cls: '' },
      { key: '설정환매', label: '설정환매',      cls: 'label-설정환매' },
    ];

    let hasAny = false;
    for (const sec of sections) {
      const items = dayData[sec.key] || [];
      if (!items.length) continue;
      hasAny = true;

      const group = document.createElement('div');
      group.className = 'summary-group';

      const lbl = document.createElement('div');
      lbl.className = `summary-group-label ${sec.cls}`;
      lbl.textContent = sec.label;
      group.appendChild(lbl);

      for (const item of items) {
        const card = document.createElement('div');
        card.className = `summary-item${item.checked ? ' checked' : ''}`;

        if (sec.key === '업무') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'item-checkbox';
          cb.checked = !!item.checked;
          cb.addEventListener('change', () => this.toggleCheck(item.id));
          card.appendChild(cb);
        }

        const body = document.createElement('div');
        body.className = 'item-body';
        body.appendChild(this.renderItemBody(sec.key, item));
        card.appendChild(body);

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = '✕';
        del.addEventListener('click', () => this.deleteItem(sec.key, item.id));
        card.appendChild(del);

        group.appendChild(card);
      }
      el.appendChild(group);
    }

    if (!hasAny) {
      el.innerHTML = '<div class="empty-state">등록된 내역이 없습니다. 아래에서 추가해주세요.</div>';
    }
  }

  renderItemBody(tab, item) {
    const frag = document.createDocumentFragment();

    if (tab === '일정') {
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.title || '';
      frag.appendChild(title);
      if (item.detail) {
        const det = document.createElement('div');
        det.className = 'item-detail';
        det.textContent = item.detail;
        frag.appendChild(det);
      }

    } else if (tab === '업무') {
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.title || '';
      frag.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      if (item.member) {
        const span = document.createElement('span');
        span.textContent = item.member;
        meta.appendChild(span);
      }
      if (item.category) {
        const badge = document.createElement('span');
        badge.className = 'item-badge';
        badge.style.background = CAT_COLOR[item.category] || '#6b7280';
        badge.textContent = item.category;
        meta.appendChild(badge);
      }
      frag.appendChild(meta);
      if (item.detail) {
        const det = document.createElement('div');
        det.className = 'item-detail';
        det.textContent = item.detail;
        frag.appendChild(det);
      }

    } else if (tab === '설정환매') {
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.fundName || item.fundCode || '-';
      frag.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const parts = [];
      if (item.fundCode) parts.push(`코드: ${item.fundCode}`);
      if (item.cu)       parts.push(`CU: ${item.cu}`);
      if (item.amount)   parts.push(`금액: ${item.amount}`);
      if (item.counterparty) parts.push(`거래처: ${item.counterparty}`);
      if (item.note)     parts.push(`비고: ${item.note}`);
      meta.textContent = parts.join('  |  ');
      frag.appendChild(meta);
    }

    return frag;
  }

  // ---- Add / Delete / Check ----

  addItem(tab) {
    const dayData = this.getDayData();
    if (!dayData[tab]) dayData[tab] = [];

    let item = { id: genId() };

    if (tab === '일정') {
      const title  = document.getElementById('일정-일정명').value.trim();
      const detail = document.getElementById('일정-상세').value.trim();
      if (!title) { showToast('일정명을 입력해주세요.', 'error'); return; }
      item = { ...item, title, detail };
      document.getElementById('일정-일정명').value = '';
      document.getElementById('일정-상세').value  = '';

    } else if (tab === '업무') {
      const member   = document.getElementById('업무-본부원명').value;
      const title    = document.getElementById('업무-제목').value.trim();
      const category = document.getElementById('업무-분류').value;
      const detail   = document.getElementById('업무-상세').value.trim();
      if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
      item = { ...item, member, title, category, detail, checked: false };
      document.getElementById('업무-본부원명').value = '';
      document.getElementById('업무-제목').value    = '';
      document.getElementById('업무-분류').value    = '';
      document.getElementById('업무-상세').value    = '';

    } else if (tab === '설정환매') {
      const fundCode     = document.getElementById('설환-코드').value.trim();
      const fundName     = document.getElementById('설환-펀드명').value.trim();
      const cu           = document.getElementById('설환-cu').value.trim();
      const amount       = document.getElementById('설환-금액').value.trim();
      const counterparty = document.getElementById('설환-거래상대방').value.trim();
      const note         = document.getElementById('설환-비고').value.trim();
      if (!fundCode && !fundName) { showToast('펀드코드 또는 펀드명을 입력해주세요.', 'error'); return; }
      item = { ...item, fundCode, fundName, cu, amount, counterparty, note };
      ['설환-코드','설환-펀드명','설환-cu','설환-금액','설환-거래상대방','설환-비고'].forEach(id =>
        document.getElementById(id).value = '');
      this.curNavPerCU = 0;
    }

    dayData[tab].push(item);
    this.setDayData(dayData);
    this.renderSummary();
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  deleteItem(tab, id) {
    const dayData = this.getDayData();
    if (!dayData[tab]) return;
    dayData[tab] = dayData[tab].filter(i => i.id !== id);
    this.setDayData(dayData);
    this.renderSummary();
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  toggleCheck(id) {
    const dayData = this.getDayData();
    const items = dayData['업무'] || [];
    const item = items.find(i => i.id === id);
    if (item) {
      item.checked = !item.checked;
      this.setDayData(dayData);
      this.renderSummary();
      document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
    }
  }

  // ---- Save ----

  async saveDay() {
    const statusEl = document.getElementById('save-status');
    const saveBtn  = document.getElementById('btn-save');

    const setStatus = (msg, color) => {
      statusEl.textContent = msg;
      statusEl.style.color = color || '';
    };

    if (!this.storage.token) {
      setStatus('⚠ 설정에서 GitHub 토큰을 먼저 입력해주세요.', '#dc2626');
      return;
    }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
    setStatus('', '');

    try {
      await this.storage.saveMonth(this.year, this.month, this.monthEntry.data);
      setStatus('✓ 저장되었습니다.', '#059669');
      this.renderCalendar();
      setTimeout(() => setStatus('', ''), 3000);
    } catch (e) {
      console.error(e);
      setStatus(`✕ 저장 실패: ${e.message}`, '#dc2626');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    }
  }

  // ---- Settings ----

  openSettings() {
    document.getElementById('input-token').value = this.storage.token;
    this.updateFundUpdatedAt();
    document.getElementById('settings-overlay').classList.remove('hidden');
  }

  closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
  }

  saveSettings() {
    const token = document.getElementById('input-token').value.trim();
    this.storage.token = token;
    localStorage.setItem('gh_token', token);
    this.closeSettings();
    showToast('설정이 저장되었습니다.', 'success');
    this.storage.cache = {};
    this.loadAndRender();
  }
}

// ===================== Boot =====================
const app = new CalendarApp();
document.addEventListener('DOMContentLoaded', () => app.init());
