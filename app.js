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
    if (!this.token) { this.cache[key] = { data: {}, sha: null }; return this.cache[key]; }
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
    let sha = null;
    try { const r = await fetch(url, { headers: this.headers }); if (r.ok) { const f = await r.json(); sha = f.sha; } } catch (_) {}
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ message: `Update ${path}`, content, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || `HTTP ${res.status}`); }
  }

  async listDataFiles() {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/data`;
    try {
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return [];
      const files = await res.json();
      return files.filter(f => f.name !== 'funds.json' && f.name.endsWith('.json'));
    } catch (e) { return []; }
  }

  async deleteFile(path, sha) {
    const url = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers,
      body: JSON.stringify({ message: `Delete ${path}`, sha }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.message || `HTTP ${res.status}`); }
  }

  async loadFundData() {
    const url = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/main/data/funds.json?t=${Date.now()}`;
    try { const res = await fetch(url); if (!res.ok) return null; return await res.json(); } catch (e) { return null; }
  }

  async loadRange(fromDate, toDate) {
    const from = new Date(fromDate + 'T00:00:00');
    const to   = new Date(toDate   + 'T00:00:00');
    const result = {};
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= endMonth) {
      const y = cur.getFullYear(), m = cur.getMonth() + 1;
      const entry = await this.loadMonth(y, m);
      for (const [dateStr, dayData] of Object.entries(entry.data || {})) {
        if (dateStr >= fromDate && dateStr <= toDate) result[dateStr] = dayData;
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return result;
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

function formatAmount(val) {
  const n = Number(val);
  if (!n && n !== 0) return '';
  if (n === 0) return '0억원';
  const abs = Math.abs(n);
  const str = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/\.?0+$/, '');
  return (n < 0 ? '-' : '') + str + '억원';
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
    this.storage     = new GitHubStorage();
    this.now         = new Date();
    this.year        = this.now.getFullYear();
    this.month       = this.now.getMonth() + 1;
    this.monthEntry  = null;
    this.openDate    = null;
    this.activeTab   = '일정';
    this.fundData    = null;
    this.curNavPerCU = 0;

    // 수정 모드
    this.editingTab = null;
    this.editingId  = null;

    // List panel
    this.listCat        = '전체';
    this.listData       = {};
    this.listUsingRange = false;
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

    // 설정환매
    document.getElementById('설환-코드').addEventListener('blur', () => this.onFundCodeBlur('설환'));
    document.getElementById('설환-cu').addEventListener('input', () => this.calcAmount());
    document.getElementById('설환-type').addEventListener('change', () => this.calcAmount());

    // 리소스
    document.getElementById('리소스-res코드').addEventListener('blur', () => this.onFundCodeBlur('리소스-res'));
    document.getElementById('리소스-set코드').addEventListener('blur', () => this.onFundCodeBlur('리소스-set'));

    // Excel
    document.getElementById('fund-file-input').addEventListener('change', e => {
      if (e.target.files[0]) this.handleFundUpdate(e.target.files[0]);
      e.target.value = '';
    });

    // 목록 패널 탭
    document.querySelectorAll('.list-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchListCat(btn.dataset.cat));
    });

    this.updateSumBtnVisibility('전체');
  }

  // ---- Fund auto-fill ----

  onFundCodeBlur(prefix) {
    let codeEl, nameEl;
    if (prefix === '설환') {
      codeEl = document.getElementById('설환-코드');
      nameEl = document.getElementById('설환-펀드명');
    } else if (prefix === '리소스-res') {
      codeEl = document.getElementById('리소스-res코드');
      nameEl = document.getElementById('리소스-res펀드명');
    } else if (prefix === '리소스-set') {
      codeEl = document.getElementById('리소스-set코드');
      nameEl = document.getElementById('리소스-set펀드명');
    }
    if (!codeEl || !nameEl) return;
    const code = codeEl.value.trim();
    if (!code || !this.fundData?.funds) return;
    const fund = this.fundData.funds[code];
    if (fund) {
      nameEl.value = fund.name;
      if (prefix === '설환') { this.curNavPerCU = fund.navPerCU || 0; this.calcAmount(); }
    }
  }

  calcAmount() {
    const cu   = parseFloat(document.getElementById('설환-cu').value) || 0;
    const type = document.getElementById('설환-type')?.value || '설정';
    const amountEok = (cu * this.curNavPerCU) / 100000000;
    if (amountEok > 0) {
      const signed = type === '환매' ? -amountEok : amountEok;
      document.getElementById('설환-금액').value = parseFloat(signed.toFixed(2));
    } else {
      document.getElementById('설환-금액').value = '';
    }
  }

  // ---- Fund Excel update ----

  async handleFundUpdate(file) {
    if (!this.storage.token) { showToast('GitHub 토큰이 설정되어 있어야 업데이트할 수 있습니다.', 'error'); return; }
    showToast('파일 읽는 중...', '');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const funds = {};
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const c = String(row[3] || '').trim();
        const n = String(row[4] || '').trim();
        const v = Number(row[9]) || 0;
        if (c && n) funds[c] = { name: n, navPerCU: v };
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
    if (!this.listUsingRange) {
      this.listData = this.monthEntry?.data || {};
      this.renderListPanel();
    }
  }

  // ---- Calendar ----

  renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const firstDow    = new Date(this.year, this.month - 1, 1).getDay();
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const data = this.monthEntry?.data || {};
    for (let i = 0; i < firstDow; i++) {
      const el = document.createElement('div'); el.className = 'cell empty'; grid.appendChild(el);
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
    (dayData['업무'] || []).forEach(item => {
      const label = [item.fundCode, item.title].filter(Boolean).join(' ');
      events.push({ cat: '업무', label: label || '' });
    });
    (dayData['설정환매'] || []).forEach(item => {
      const amt = item.amountRaw != null ? formatAmount(item.amountRaw) : (item.amount || '');
      const label = [item.fundCode, amt].filter(Boolean).join(' ');
      events.push({ cat: '설정환매', label: label || '설정/환매' });
    });
    (dayData['리소스'] || []).forEach(item =>
      events.push({ cat: '리소스', label: item.summary || item.category || '리소스' }));
    return events;
  }

  // ---- Modal ----

  async openModal(dateStr) {
    this.openDate = dateStr;
    this.curNavPerCU = 0;
    this.cancelEdit(null); // 수정 모드 초기화
    document.getElementById('modal-date').textContent = formatDateKo(dateStr);
    document.getElementById('overlay').classList.remove('hidden');
    this.switchTab('일정');
    this.renderSummary();
  }

  closeModal() {
    this.cancelEdit(null);
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

  // ---- Summary (모달 상단) ----

  renderSummary() {
    const el = document.getElementById('summary-section');
    const dayData = this.getDayData();
    el.innerHTML = '';

    const sections = [
      { key: '일정',    label: '일정',    cls: 'label-일정' },
      { key: '업무',    label: '업무',    cls: '' },
      { key: '설정환매', label: '설정환매', cls: 'label-설정환매' },
      { key: '리소스',  label: '리소스',  cls: 'label-리소스' },
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

      items.forEach((item, idx) => {
        const card = document.createElement('div');
        card.className = `summary-item${item.checked ? ' checked' : ''}`;
        if (this.editingId === item.id) card.classList.add('editing');

        // 업무 체크박스
        if (sec.key === '업무') {
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'item-checkbox';
          cb.checked = !!item.checked;
          cb.addEventListener('change', () => this.toggleCheck(item.id));
          card.appendChild(cb);
        }

        // 본문
        const body = document.createElement('div');
        body.className = 'item-body';
        body.appendChild(this.renderItemBody(sec.key, item));
        card.appendChild(body);

        // 버튼 그룹: ↑ ↓ ✏ ✕
        const btnGroup = document.createElement('div');
        btnGroup.className = 'item-btn-group';

        const mkBtn = (text, cls, title, handler) => {
          const b = document.createElement('button');
          b.className = cls; b.textContent = text; b.title = title;
          b.addEventListener('click', e => { e.stopPropagation(); handler(); });
          return b;
        };

        btnGroup.appendChild(mkBtn('↑', 'btn-move', '위로', () => this.moveItem(sec.key, item.id, -1)));
        btnGroup.appendChild(mkBtn('↓', 'btn-move', '아래로', () => this.moveItem(sec.key, item.id, 1)));
        btnGroup.appendChild(mkBtn('✏', 'btn-edit', '수정', () => this.editItem(sec.key, item.id)));
        btnGroup.appendChild(mkBtn('✕', 'btn-delete', '삭제', () => this.deleteItem(sec.key, item.id)));

        card.appendChild(btnGroup);
        group.appendChild(card);
      });

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
        const det = document.createElement('div'); det.className = 'item-detail'; det.textContent = item.detail; frag.appendChild(det);
      }

    } else if (tab === '업무') {
      const title = document.createElement('div'); title.className = 'item-title'; title.textContent = item.title || ''; frag.appendChild(title);
      const meta = document.createElement('div'); meta.className = 'item-meta';
      if (item.member) { const s = document.createElement('span'); s.textContent = item.member; meta.appendChild(s); }
      if (item.fundCode) { const s = document.createElement('span'); s.textContent = item.fundCode; s.style.color = '#0891b2'; meta.appendChild(s); }
      if (item.category) {
        const badge = document.createElement('span'); badge.className = 'item-badge';
        badge.style.background = CAT_COLOR[item.category] || '#6b7280'; badge.textContent = item.category; meta.appendChild(badge);
      }
      frag.appendChild(meta);
      if (item.detail) { const d = document.createElement('div'); d.className = 'item-detail'; d.textContent = item.detail; frag.appendChild(d); }

    } else if (tab === '설정환매') {
      const title = document.createElement('div'); title.className = 'item-title'; title.textContent = item.fundName || item.fundCode || '-'; frag.appendChild(title);
      const meta = document.createElement('div'); meta.className = 'item-meta';
      const parts = [];
      if (item.fundCode)     parts.push(`코드: ${item.fundCode}`);
      if (item.type)         parts.push(item.type);
      if (item.cu)           parts.push(`CU: ${item.cu}`);
      if (item.amountRaw != null) parts.push(`금액: ${formatAmount(item.amountRaw)}`);
      else if (item.amount)  parts.push(`금액: ${item.amount}`);
      if (item.counterparty) parts.push(`거래처: ${item.counterparty}`);
      if (item.note)         parts.push(`비고: ${item.note}`);
      meta.textContent = parts.join('  |  ');
      frag.appendChild(meta);

    } else if (tab === '리소스') {
      const title = document.createElement('div'); title.className = 'item-title'; title.textContent = item.summary || '-'; frag.appendChild(title);
      const meta = document.createElement('div'); meta.className = 'item-meta';
      if (item.category) {
        const badge = document.createElement('span'); badge.className = 'item-badge'; badge.style.background = '#f97316'; badge.textContent = item.category; meta.appendChild(badge);
      }
      frag.appendChild(meta);
      if (item.resFundCode || item.resAmountRaw) {
        const row = document.createElement('div'); row.className = 'item-detail';
        row.textContent = ['[리소스]', item.resFundCode, item.resFundName, item.resAmountRaw ? formatAmount(item.resAmountRaw) : ''].filter(Boolean).join(' ');
        frag.appendChild(row);
      }
      if (item.setFundCode || item.setAmountRaw) {
        const row = document.createElement('div'); row.className = 'item-detail';
        row.textContent = ['[설정]', item.setFundCode, item.setFundName, item.setAmountRaw ? formatAmount(item.setAmountRaw) : ''].filter(Boolean).join(' ');
        frag.appendChild(row);
      }
      if (item.note) { const d = document.createElement('div'); d.className = 'item-detail'; d.textContent = `비고: ${item.note}`; frag.appendChild(d); }
    }

    return frag;
  }

  // ---- Edit Mode ----

  editItem(tab, id) {
    const dayData = this.getDayData();
    const item = (dayData[tab] || []).find(i => i.id === id);
    if (!item) return;

    // 다른 탭 수정 중이면 먼저 취소
    if (this.editingTab && this.editingTab !== tab) this.cancelEdit(this.editingTab);

    this.editingTab = tab;
    this.editingId  = id;

    this.switchTab(tab);
    this.populateForm(tab, item);

    // 추가 버튼 → 수정 완료
    const panel = document.getElementById(`panel-${tab}`);
    const addBtn = panel?.querySelector('.btn-add');
    if (addBtn) addBtn.textContent = '수정 완료';

    // 수정 중 표시 업데이트
    this.renderSummary();

    // 입력 영역으로 부드럽게 스크롤
    panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  populateForm(tab, item) {
    if (tab === '일정') {
      document.getElementById('일정-일정명').value = item.title  || '';
      document.getElementById('일정-상세').value   = item.detail || '';

    } else if (tab === '업무') {
      document.getElementById('업무-본부원명').value = item.member   || '';
      document.getElementById('업무-펀드코드').value = item.fundCode || '';
      document.getElementById('업무-제목').value     = item.title    || '';
      document.getElementById('업무-분류').value     = item.category || '';
      document.getElementById('업무-상세').value     = item.detail   || '';

    } else if (tab === '설정환매') {
      document.getElementById('설환-코드').value          = item.fundCode     || '';
      document.getElementById('설환-펀드명').value        = item.fundName     || '';
      document.getElementById('설환-type').value          = item.type         || '설정';
      document.getElementById('설환-cu').value            = item.cu           || '';
      document.getElementById('설환-금액').value          = item.amountRaw    != null ? item.amountRaw : '';
      document.getElementById('설환-거래상대방').value    = item.counterparty || '';
      document.getElementById('설환-비고').value          = item.note         || '';

    } else if (tab === '리소스') {
      document.getElementById('리소스-요약').value       = item.summary      || '';
      document.getElementById('리소스-분류').value       = item.category     || '';
      document.getElementById('리소스-res코드').value    = item.resFundCode  || '';
      document.getElementById('리소스-res펀드명').value  = item.resFundName  || '';
      document.getElementById('리소스-res금액').value    = item.resAmountRaw || '';
      document.getElementById('리소스-set코드').value    = item.setFundCode  || '';
      document.getElementById('리소스-set펀드명').value  = item.setFundName  || '';
      document.getElementById('리소스-set금액').value    = item.setAmountRaw || '';
      document.getElementById('리소스-비고').value       = item.note         || '';
    }
  }

  updateItem(tab) {
    const dayData = this.getDayData();
    const items = dayData[tab] || [];
    const idx = items.findIndex(i => i.id === this.editingId);
    if (idx === -1) { this.cancelEdit(tab); return; }

    const oldItem = items[idx];
    let updated = { id: oldItem.id };

    if (tab === '일정') {
      const title  = document.getElementById('일정-일정명').value.trim();
      const detail = document.getElementById('일정-상세').value.trim();
      if (!title) { showToast('일정명을 입력해주세요.', 'error'); return; }
      updated = { ...updated, title, detail };

    } else if (tab === '업무') {
      const member   = document.getElementById('업무-본부원명').value;
      const fundCode = document.getElementById('업무-펀드코드').value.trim();
      const title    = document.getElementById('업무-제목').value.trim();
      const category = document.getElementById('업무-분류').value;
      const detail   = document.getElementById('업무-상세').value.trim();
      if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
      updated = { ...updated, member, fundCode, title, category, detail, checked: oldItem.checked };

    } else if (tab === '설정환매') {
      const fundCode     = document.getElementById('설환-코드').value.trim();
      const fundName     = document.getElementById('설환-펀드명').value.trim();
      const type         = document.getElementById('설환-type').value;
      const cu           = document.getElementById('설환-cu').value.trim();
      const amountRaw    = parseFloat(document.getElementById('설환-금액').value) || 0;
      const counterparty = document.getElementById('설환-거래상대방').value.trim();
      const note         = document.getElementById('설환-비고').value.trim();
      if (!fundCode && !fundName) { showToast('펀드코드 또는 펀드명을 입력해주세요.', 'error'); return; }
      updated = { ...updated, fundCode, fundName, type, cu, amountRaw, counterparty, note };

    } else if (tab === '리소스') {
      const summary      = document.getElementById('리소스-요약').value.trim();
      const category     = document.getElementById('리소스-분류').value;
      const resFundCode  = document.getElementById('리소스-res코드').value.trim();
      const resFundName  = document.getElementById('리소스-res펀드명').value.trim();
      const resAmountRaw = parseFloat(document.getElementById('리소스-res금액').value) || 0;
      const setFundCode  = document.getElementById('리소스-set코드').value.trim();
      const setFundName  = document.getElementById('리소스-set펀드명').value.trim();
      const setAmountRaw = parseFloat(document.getElementById('리소스-set금액').value) || 0;
      const note         = document.getElementById('리소스-비고').value.trim();
      if (!summary && !category) { showToast('요약 또는 분류를 입력해주세요.', 'error'); return; }
      updated = { ...updated, summary, category, resFundCode, resFundName, resAmountRaw, setFundCode, setFundName, setAmountRaw, note };
    }

    items[idx] = updated;
    this.setDayData(dayData);
    this.cancelEdit(tab);
    this.renderSummary();
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  cancelEdit(tab) {
    const prevTab = this.editingTab;
    this.editingId  = null;
    this.editingTab = null;
    const t = tab || prevTab;
    if (t) {
      const panel = document.getElementById(`panel-${t}`);
      const addBtn = panel?.querySelector('.btn-add');
      if (addBtn) addBtn.textContent = '추가';
      this.clearForm(t);
    }
  }

  clearForm(tab) {
    if (tab === '일정') {
      document.getElementById('일정-일정명').value = '';
      document.getElementById('일정-상세').value   = '';
    } else if (tab === '업무') {
      ['업무-본부원명','업무-펀드코드','업무-제목','업무-분류','업무-상세']
        .forEach(id => document.getElementById(id).value = '');
    } else if (tab === '설정환매') {
      ['설환-코드','설환-펀드명','설환-cu','설환-금액','설환-거래상대방','설환-비고']
        .forEach(id => document.getElementById(id).value = '');
      document.getElementById('설환-type').value = '설정';
      this.curNavPerCU = 0;
    } else if (tab === '리소스') {
      ['리소스-요약','리소스-res코드','리소스-res펀드명','리소스-res금액',
       '리소스-set코드','리소스-set펀드명','리소스-set금액','리소스-비고']
        .forEach(id => document.getElementById(id).value = '');
      document.getElementById('리소스-분류').value = '';
    }
  }

  // ---- Add / Delete / Move ----

  addItem(tab) {
    // 수정 모드이면 업데이트
    if (this.editingId && this.editingTab === tab) {
      this.updateItem(tab);
      return;
    }

    const dayData = this.getDayData();
    if (!dayData[tab]) dayData[tab] = [];
    let item = { id: genId() };

    if (tab === '일정') {
      const title  = document.getElementById('일정-일정명').value.trim();
      const detail = document.getElementById('일정-상세').value.trim();
      if (!title) { showToast('일정명을 입력해주세요.', 'error'); return; }
      item = { ...item, title, detail };
      this.clearForm(tab);

    } else if (tab === '업무') {
      const member   = document.getElementById('업무-본부원명').value;
      const fundCode = document.getElementById('업무-펀드코드').value.trim();
      const title    = document.getElementById('업무-제목').value.trim();
      const category = document.getElementById('업무-분류').value;
      const detail   = document.getElementById('업무-상세').value.trim();
      if (!title) { showToast('제목을 입력해주세요.', 'error'); return; }
      item = { ...item, member, fundCode, title, category, detail, checked: false };
      this.clearForm(tab);

    } else if (tab === '설정환매') {
      const fundCode     = document.getElementById('설환-코드').value.trim();
      const fundName     = document.getElementById('설환-펀드명').value.trim();
      const type         = document.getElementById('설환-type').value;
      const cu           = document.getElementById('설환-cu').value.trim();
      const amountRaw    = parseFloat(document.getElementById('설환-금액').value) || 0;
      const counterparty = document.getElementById('설환-거래상대방').value.trim();
      const note         = document.getElementById('설환-비고').value.trim();
      if (!fundCode && !fundName) { showToast('펀드코드 또는 펀드명을 입력해주세요.', 'error'); return; }
      item = { ...item, fundCode, fundName, type, cu, amountRaw, counterparty, note };
      this.clearForm(tab);

    } else if (tab === '리소스') {
      const summary      = document.getElementById('리소스-요약').value.trim();
      const category     = document.getElementById('리소스-분류').value;
      const resFundCode  = document.getElementById('리소스-res코드').value.trim();
      const resFundName  = document.getElementById('리소스-res펀드명').value.trim();
      const resAmountRaw = parseFloat(document.getElementById('리소스-res금액').value) || 0;
      const setFundCode  = document.getElementById('리소스-set코드').value.trim();
      const setFundName  = document.getElementById('리소스-set펀드명').value.trim();
      const setAmountRaw = parseFloat(document.getElementById('리소스-set금액').value) || 0;
      const note         = document.getElementById('리소스-비고').value.trim();
      if (!summary && !category) { showToast('요약 또는 분류를 입력해주세요.', 'error'); return; }
      item = { ...item, summary, category, resFundCode, resFundName, resAmountRaw, setFundCode, setFundName, setAmountRaw, note };
      this.clearForm(tab);
    }

    dayData[tab].push(item);
    this.setDayData(dayData);
    this.renderSummary();
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  deleteItem(tab, id) {
    if (this.editingId === id) this.cancelEdit(tab);
    const dayData = this.getDayData();
    if (!dayData[tab]) return;
    dayData[tab] = dayData[tab].filter(i => i.id !== id);
    this.setDayData(dayData);
    this.renderSummary();
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  moveItem(tab, id, dir) {
    const dayData = this.getDayData();
    const items = dayData[tab] || [];
    const idx = items.findIndex(i => i.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    this.setDayData(dayData);
    this.renderSummary();
    document.getElementById('save-status').textContent = '저장되지 않은 변경사항이 있습니다.';
  }

  toggleCheck(id) {
    const dayData = this.getDayData();
    const item = (dayData['업무'] || []).find(i => i.id === id);
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
    const setStatus = (msg, color) => { statusEl.textContent = msg; statusEl.style.color = color || ''; };
    if (!this.storage.token) { setStatus('⚠ 설정에서 GitHub 토큰을 먼저 입력해주세요.', '#dc2626'); return; }
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
    setStatus('', '');
    try {
      await this.storage.saveMonth(this.year, this.month, this.monthEntry.data);
      setStatus('✓ 저장되었습니다.', '#059669');
      this.renderCalendar();
      if (!this.listUsingRange) { this.listData = this.monthEntry.data; this.renderListPanel(); }
      setTimeout(() => setStatus('', ''), 3000);
    } catch (e) {
      console.error(e);
      setStatus(`✕ 저장 실패: ${e.message}`, '#dc2626');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
    }
  }

  // ---- Delete All Data ----

  async deleteAllData() {
    if (!this.storage.token) { showToast('GitHub 토큰이 설정되어 있어야 합니다.', 'error'); return; }
    const confirmed = confirm('⚠ 전체 캘린더 데이터를 삭제합니다.\n\n· 모든 월별 데이터 파일이 삭제됩니다.\n· 펀드 데이터는 유지됩니다.\n· 되돌릴 수 없습니다.\n\n계속하시겠습니까?');
    if (!confirmed) return;
    const btn = document.getElementById('btn-delete-all');
    if (btn) { btn.disabled = true; btn.textContent = '삭제 중...'; }
    try {
      const files = await this.storage.listDataFiles();
      if (files.length === 0) { showToast('삭제할 데이터가 없습니다.', ''); return; }
      for (const file of files) await this.storage.deleteFile(file.path, file.sha);
      this.storage.cache = {};
      await this.loadAndRender();
      this.closeSettings();
      showToast(`완료: ${files.length}개 파일 삭제됨`, 'success');
    } catch (e) {
      console.error(e);
      showToast(`삭제 실패: ${e.message}`, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🗑 전체 데이터 삭제'; }
    }
  }

  // ---- Settings ----

  openSettings() {
    document.getElementById('input-token').value = this.storage.token;
    this.updateFundUpdatedAt();
    document.getElementById('settings-overlay').classList.remove('hidden');
  }

  closeSettings() { document.getElementById('settings-overlay').classList.add('hidden'); }

  saveSettings() {
    const token = document.getElementById('input-token').value.trim();
    this.storage.token = token;
    localStorage.setItem('gh_token', token);
    this.closeSettings();
    showToast('설정이 저장되었습니다.', 'success');
    this.storage.cache = {};
    this.loadAndRender();
  }

  // ===================== List Panel =====================

  updateSumBtnVisibility(cat) {
    const btn = document.querySelector('.btn-sum');
    if (btn) btn.style.display = (cat === '설정환매' || cat === '리소스') ? '' : 'none';
  }

  switchListCat(cat) {
    this.listCat = cat;
    document.querySelectorAll('.list-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    this.updateSumBtnVisibility(cat);
    document.getElementById('list-sum-bar').classList.add('hidden');
    this.renderListPanel();
  }

  async applyListFilter() {
    const from = document.getElementById('filter-from').value;
    const to   = document.getElementById('filter-to').value;
    if (!from && !to) {
      this.listUsingRange = false;
      this.listData = this.monthEntry?.data || {};
      this.renderListPanel();
      return;
    }
    const fromDate = from || `${this.year}-${String(this.month).padStart(2,'0')}-01`;
    const toDate   = to   || `${this.year}-${String(this.month).padStart(2,'0')}-31`;
    const btn = document.querySelector('.btn-filter-apply');
    if (btn) { btn.disabled = true; btn.textContent = '로딩...'; }
    try {
      this.listData = await this.storage.loadRange(fromDate, toDate);
      this.listUsingRange = true;
      this.renderListPanel();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '적용'; }
    }
  }

  calcSum() {
    const sumBar = document.getElementById('list-sum-bar');

    if (this.listCat === '설정환매') {
      let 설정Count = 0, 설정Total = 0, 환매Count = 0, 환매Total = 0;
      for (const dayData of Object.values(this.listData)) {
        for (const item of (dayData['설정환매'] || [])) {
          const raw = item.amountRaw || 0;
          if (item.type === '환매' || raw < 0) { 환매Count++; 환매Total += Math.abs(raw); }
          else { 설정Count++; 설정Total += raw; }
        }
      }
      const totalCount = 설정Count + 환매Count;
      const totalAmount = 설정Total - 환매Total;
      const fmt = v => parseFloat(v.toFixed(2));
      sumBar.textContent =
        `설정 ${설정Count}건: ${fmt(설정Total)}억원  /  환매 ${환매Count}건: ${fmt(환매Total)}억원  /  총 ${totalCount}건: ${fmt(totalAmount)}억원`;

    } else if (this.listCat === '리소스') {
      let resTotal = 0, setTotal = 0;
      for (const dayData of Object.values(this.listData)) {
        for (const item of (dayData['리소스'] || [])) {
          resTotal += item.resAmountRaw || 0;
          setTotal += item.setAmountRaw || 0;
        }
      }
      const fmt = v => parseFloat(v.toFixed(2));
      sumBar.textContent = `리소스: ${fmt(resTotal)}억원  /  설정: ${fmt(setTotal)}억원`;
    }

    sumBar.classList.remove('hidden');
  }

  renderListPanel() {
    const container = document.getElementById('list-items');
    container.innerHTML = '';
    document.getElementById('list-sum-bar').classList.add('hidden');

    const fundFilter = document.getElementById('filter-fund').value.trim().toLowerCase();
    const dates = Object.keys(this.listData).sort();

    if (dates.length === 0) { container.innerHTML = '<div class="list-empty">데이터가 없습니다.</div>'; return; }

    let hasAny = false;
    for (const dateStr of dates) {
      const dayData = this.listData[dateStr];
      const items = this.getListItems(dayData, this.listCat, fundFilter);
      if (items.length === 0) continue;
      hasAny = true;
      const dateHeader = document.createElement('div');
      dateHeader.className = 'list-date-header';
      dateHeader.textContent = formatDateKo(dateStr);
      container.appendChild(dateHeader);
      for (const { tab, item } of items) container.appendChild(this.renderListItem(tab, item));
    }

    if (!hasAny) container.innerHTML = '<div class="list-empty">해당 조건의 내역이 없습니다.</div>';
  }

  getListItems(dayData, cat, fundFilter) {
    const result = [];
    const tabs = cat === '전체' ? ['일정', '업무', '설정환매', '리소스'] : [cat];
    for (const tab of tabs) {
      for (const item of (dayData[tab] || [])) {
        if (fundFilter) {
          if (tab === '설정환매') {
            if (!item.fundCode?.toLowerCase().includes(fundFilter) &&
                !item.fundName?.toLowerCase().includes(fundFilter)) continue;
          } else if (tab === '리소스') {
            const match = item.resFundCode?.toLowerCase().includes(fundFilter) ||
                          item.resFundName?.toLowerCase().includes(fundFilter) ||
                          item.setFundCode?.toLowerCase().includes(fundFilter) ||
                          item.setFundName?.toLowerCase().includes(fundFilter);
            if (!match) continue;
          } else if (tab === '업무') {
            if (!item.fundCode?.toLowerCase().includes(fundFilter)) continue;
          }
        }
        result.push({ tab, item });
      }
    }
    return result;
  }

  renderListItem(tab, item) {
    const card = document.createElement('div');
    card.className = `list-item-card list-item-${tab}`;

    if (tab === '일정') {
      card.innerHTML = `
        <div class="li-badge" style="background:#e0f9ff;color:#0e7490">일정</div>
        <div class="li-body">
          <div class="li-title">${item.title || ''}</div>
          ${item.detail ? `<div class="li-detail">${item.detail}</div>` : ''}
        </div>`;
    } else if (tab === '업무') {
      card.innerHTML = `
        <div class="li-badge" style="background:#dbeafe;color:#1e40af">${item.category || '업무'}</div>
        <div class="li-body">
          <div class="li-title">${item.title || ''}</div>
          <div class="li-meta">
            ${item.member   ? `<span>${item.member}</span>` : ''}
            ${item.fundCode ? `<span style="color:#0891b2">${item.fundCode}</span>` : ''}
            ${item.checked  ? '<span style="color:#94a3b8">✓완료</span>' : ''}
          </div>
        </div>`;
    } else if (tab === '설정환매') {
      const amtDisplay = item.amountRaw != null ? formatAmount(item.amountRaw) : (item.amount || '');
      card.innerHTML = `
        <div class="li-badge" style="background:#fee2e2;color:#b91c1c">설정환매</div>
        <div class="li-body">
          <div class="li-title">${item.fundName || item.fundCode || '-'}</div>
          <div class="li-meta">
            ${item.fundCode      ? `<span>${item.fundCode}</span>` : ''}
            ${item.type          ? `<span style="font-weight:600">${item.type}</span>` : ''}
            ${item.cu            ? `<span>CU ${item.cu}</span>` : ''}
            ${amtDisplay         ? `<span style="font-weight:600">${amtDisplay}</span>` : ''}
            ${item.counterparty  ? `<span>${item.counterparty}</span>` : ''}
          </div>
        </div>`;
    } else if (tab === '리소스') {
      const resPart = (item.resFundCode || item.resAmountRaw)
        ? `[리소스] ${[item.resFundCode, item.resFundName, item.resAmountRaw ? formatAmount(item.resAmountRaw) : ''].filter(Boolean).join(' ')}` : '';
      const setPart = (item.setFundCode || item.setAmountRaw)
        ? `[설정] ${[item.setFundCode, item.setFundName, item.setAmountRaw ? formatAmount(item.setAmountRaw) : ''].filter(Boolean).join(' ')}` : '';
      card.innerHTML = `
        <div class="li-badge" style="background:#ffedd5;color:#c2410c">${item.category || '리소스'}</div>
        <div class="li-body">
          <div class="li-title">${item.summary || ''}</div>
          ${resPart ? `<div class="li-detail">${resPart}</div>` : ''}
          ${setPart ? `<div class="li-detail">${setPart}</div>` : ''}
          ${item.note ? `<div class="li-detail">비고: ${item.note}</div>` : ''}
        </div>`;
    }

    return card;
  }
}

// ===================== Boot =====================
const app = new CalendarApp();
document.addEventListener('DOMContentLoaded', () => app.init());
