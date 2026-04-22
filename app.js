/* ===================================================
   채권ETF운용본부 업무 캘린더 — app.js
   GitHub API를 통해 데이터를 저장/불러옵니다.
=================================================== */

const CONFIG = {
  owner: 'tiger-bond-etf',
  repo: 'calendar',
};

const CATEGORIES = ['리밸런싱', '롤오버', '분배', '상장', '기타'];

const CAT_COLOR = {
  '리밸런싱': '#3b82f6',
  '롤오버':   '#8b5cf6',
  '분배':     '#059669',
  '상장':     '#d97706',
  '기타':     '#6b7280',
};

// ===================== GitHub Storage =====================

class GitHubStorage {
  constructor() {
    this.token = localStorage.getItem('gh_token') || '';
    this.cache = {}; // key: 'YYYY-MM' → { data: {}, sha: null }
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
      if (res.status === 404) {
        this.cache[key] = { data: {}, sha: null };
        return this.cache[key];
      }
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

    const body = {
      message: `Update ${key}`,
      content,
      ...(sha ? { sha } : {}),
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const result = await res.json();
    this.cache[key] = { data, sha: result.content.sha };
  }

  invalidate(year, month) {
    delete this.cache[this.cacheKey(year, month)];
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

function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => { el.className = 'toast hidden'; }, 2800);
}

// ===================== App =====================

class CalendarApp {
  constructor() {
    this.storage = new GitHubStorage();
    this.now = new Date();
    this.year = this.now.getFullYear();
    this.month = this.now.getMonth() + 1;
    this.monthEntry = null;   // { data, sha }
    this.openDate = null;     // 'YYYY-MM-DD'
    this.activeTab = '업무일정';
  }

  async init() {
    this.bindEvents();
    await this.loadAndRender();

    // 토큰 없으면 설정 유도
    if (!this.storage.token) {
      showToast('설정에서 GitHub 토큰을 입력해주세요.', 'error');
    }
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
  }

  async changeMonth(delta) {
    this.month += delta;
    if (this.month > 12) { this.month = 1; this.year++; }
    if (this.month < 1)  { this.month = 12; this.year--; }
    await this.loadAndRender();
  }

  async loadAndRender() {
    document.getElementById('month-title').textContent =
      `${this.year}년 ${this.month}월`;
    this.monthEntry = await this.storage.loadMonth(this.year, this.month);
    this.renderCalendar();
  }

  // ---- Calendar Render ----

  renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const firstDow = new Date(this.year, this.month - 1, 1).getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const data = this.monthEntry?.data || {};

    // Empty cells before 1st
    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div');
      el.className = 'cell empty';
      grid.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this.year}-${String(this.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = (firstDow + d - 1) % 7;
      const dayData = data[dateStr] || {};
      grid.appendChild(this.renderCell(d, dateStr, dow, dayData));
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

    // Day number
    const dayEl = document.createElement('div');
    dayEl.className = 'cell-day';
    dayEl.textContent = d;
    cell.appendChild(dayEl);

    // Events
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
    (dayData['업무일정'] || []).forEach(item => {
      events.push({ cat: item.category || '기타', label: item.title || '' });
    });
    (dayData['설정환매'] || []).forEach(item => {
      events.push({ cat: '설정환매', label: item.fundName || item.fundCode || '설정/환매' });
    });
    (dayData['기타일정'] || []).forEach(item => {
      events.push({ cat: '기타일정', label: item.title || '' });
    });
    return events;
  }

  // ---- Modal ----

  async openModal(dateStr) {
    this.openDate = dateStr;
    document.getElementById('modal-date').textContent = formatDateKo(dateStr);
    document.getElementById('overlay').classList.remove('hidden');
    this.switchTab('업무일정');
    this.renderAllTabs();
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
      const id = p.id.replace('panel-', '');
      p.classList.toggle('hidden', id !== tab);
    });
  }

  renderAllTabs() {
    const dayData = this.getDayData();
    this.renderList('업무일정', dayData['업무일정'] || []);
    this.renderList('설정환매', dayData['설정환매'] || []);
    this.renderList('기타일정', dayData['기타일정'] || []);
    this.renderList('체크리스트', dayData['체크리스트'] || []);
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

  // ---- List Render ----

  renderList(tab, items) {
    const listEl = document.getElementById(`list-${tab}`);
    listEl.innerHTML = '';

    if (!items || items.length === 0) {
      listEl.innerHTML = '<div class="empty-state">항목이 없습니다.</div>';
      return;
    }

    items.forEach(item => {
      listEl.appendChild(this.renderItem(tab, item));
    });
  }

  renderItem(tab, item) {
    const card = document.createElement('div');
    card.className = `item-card${item.checked ? ' checked' : ''}`;
    card.dataset.id = item.id;

    if (tab === '체크리스트') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'item-checkbox';
      cb.checked = !!item.checked;
      cb.addEventListener('change', () => this.toggleCheck(item.id));
      card.appendChild(cb);
    }

    const body = document.createElement('div');
    body.className = 'item-body';
    body.appendChild(this.renderItemBody(tab, item));
    card.appendChild(body);

    const del = document.createElement('button');
    del.className = 'btn-delete';
    del.textContent = '✕';
    del.title = '삭제';
    del.addEventListener('click', () => this.deleteItem(tab, item.id));
    card.appendChild(del);

    return card;
  }

  renderItemBody(tab, item) {
    const frag = document.createDocumentFragment();

    if (tab === '업무일정') {
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.title || '';
      frag.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
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
      title.textContent = `${item.fundName || item.fundCode || '-'}`;
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

    } else if (tab === '기타일정') {
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

    } else if (tab === '체크리스트') {
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = item.task || '';
      frag.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'item-meta';
      const parts = [];
      if (item.member)   parts.push(item.member);
      if (item.category) {
        const badge = document.createElement('span');
        badge.className = 'item-badge';
        badge.style.background = CAT_COLOR[item.category] || '#6b7280';
        badge.textContent = item.category;
        meta.appendChild(badge);
      }
      if (parts.length) {
        const span = document.createElement('span');
        span.textContent = parts.join(' · ');
        meta.prepend(span);
      }
      frag.appendChild(meta);
    }

    return frag;
  }

  // ---- Add / Delete / Check ----

  addItem(tab) {
    const dayData = this.getDayData();
    if (!dayData[tab]) dayData[tab] = [];

    let item = { id: genId() };

    if (tab === '업무일정') {
      const title = document.getElementById('업무-제목').value.trim();
      const category = document.getElementById('업무-분류').value;
      const detail = document.getElementById('업무-상세').value.trim();
      if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
      item = { ...item, title, category, detail };
      document.getElementById('업무-제목').value = '';
      document.getElementById('업무-분류').value = '';
      document.getElementById('업무-상세').value = '';

    } else if (tab === '설정환매') {
      const fundCode      = document.getElementById('설환-코드').value.trim();
      const fundName      = document.getElementById('설환-펀드명').value.trim();
      const cu            = document.getElementById('설환-cu').value.trim();
      const amount        = document.getElementById('설환-금액').value.trim();
      const counterparty  = document.getElementById('설환-거래상대방').value.trim();
      const note          = document.getElementById('설환-비고').value.trim();
      if (!fundCode && !fundName) { showToast('펀드코드 또는 펀드명을 입력해주세요.', 'error'); return; }
      item = { ...item, fundCode, fundName, cu, amount, counterparty, note };
      ['설환-코드','설환-펀드명','설환-cu','설환-금액','설환-거래상대방','설환-비고'].forEach(id => {
        document.getElementById(id).value = '';
      });

    } else if (tab === '기타일정') {
      const title  = document.getElementById('기타-일정명').value.trim();
      const detail = document.getElementById('기타-상세').value.trim();
      if (!title) { showToast('일정명을 입력해주세요.', 'error'); return; }
      item = { ...item, title, detail };
      document.getElementById('기타-일정명').value = '';
      document.getElementById('기타-상세').value = '';

    } else if (tab === '체크리스트') {
      const member   = document.getElementById('체크-팀원').value;
      const category = document.getElementById('체크-분류').value;
      const task     = document.getElementById('체크-할일').value.trim();
      if (!task) { showToast('할일을 입력해주세요.', 'error'); return; }
      item = { ...item, member, category, task, checked: false };
      document.getElementById('체크-팀원').value = '';
      document.getElementById('체크-분류').value = '';
      document.getElementById('체크-할일').value = '';
    }

    dayData[tab].push(item);
    this.setDayData(dayData);
    this.renderList(tab, dayData[tab]);
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  deleteItem(tab, id) {
    const dayData = this.getDayData();
    if (!dayData[tab]) return;
    dayData[tab] = dayData[tab].filter(i => i.id !== id);
    this.setDayData(dayData);
    this.renderList(tab, dayData[tab]);
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  toggleCheck(id) {
    const dayData = this.getDayData();
    const items = dayData['체크리스트'] || [];
    const item = items.find(i => i.id === id);
    if (item) {
      item.checked = !item.checked;
      this.setDayData(dayData);
      this.renderList('체크리스트', items);
      document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
    }
  }

  // ---- Save ----

  async saveDay() {
    const statusEl = document.getElementById('save-status');
    const saveBtn = document.getElementById('btn-save');

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
      console.log('[저장 시작]', this.year, this.month);
      await this.storage.saveMonth(this.year, this.month, this.monthEntry.data);
      console.log('[저장 완료]');
      setStatus('✓ 저장되었습니다.', '#059669');
      this.renderCalendar();
      setTimeout(() => setStatus('', ''), 3000);
    } catch (e) {
      console.error('[저장 실패]', e);
      setStatus(`✕ 저장 실패: ${e.message}`, '#dc2626');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    }
  }

  // ---- Settings ----

  openSettings() {
    document.getElementById('input-token').value = this.storage.token;
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
    // 토큰 바뀌면 캐시 초기화 후 재로드
    this.storage.cache = {};
    this.loadAndRender();
  }
}

// ===================== Boot =====================
const app = new CalendarApp();
document.addEventListener('DOMContentLoaded', () => app.init());
