// ── Utilities ──────────────────────────────────────────────────────

function fmtBytes(b) {
  if (!b || b === 0) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3400);
}

const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

function loading(msg = 'Scanning…') {
  return `<div class="loading"><div class="spinner"></div><span>${esc(msg)}</span></div>`;
}

function emptyState(icon, msg, sub) {
  return `<div class="empty"><div class="empty-icon">${icon}</div><strong>${esc(msg)}</strong>${sub ? `<p>${esc(sub)}</p>` : ''}</div>`;
}

// ── Tab navigation ─────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'processes') loadProcesses();
    if (btn.dataset.tab === 'network') loadNetwork();
  });
});

// ── Selection helpers ──────────────────────────────────────────────

function updateSelected(containerId, sizeId, actionsId) {
  let total = 0;
  document.querySelectorAll('#' + containerId + ' .file-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (!cb) return;
    item.classList.toggle('selected', cb.checked);
    if (cb.checked) total += parseInt(item.dataset.size || '0', 10);
  });
  const el = document.getElementById(sizeId);
  if (el) el.textContent = total > 0 ? fmtBytes(total) + ' selected' : '';
}

function toggleAll(containerId, checked, sizeId, actionsId) {
  document.querySelectorAll('#' + containerId + ' .file-item input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
  });
  updateSelected(containerId, sizeId, actionsId);
}

function getSelectedPaths(containerId) {
  return [...document.querySelectorAll('#' + containerId + ' .file-item.selected')]
    .map(el => el.dataset.path);
}

async function deleteSelected(containerId, sizeId, actionsId, afterFn) {
  const paths = getSelectedPaths(containerId);
  if (!paths.length) { showToast('Nothing selected', 'error'); return; }
  try {
    const res = await api.post('/api/delete', { paths });
    showToast(`Moved ${res.deleted.length} item(s) to Trash`);
    if (res.errors.length) console.warn('Errors:', res.errors);
    afterFn();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function revealInFinder(path, event) {
  if (event) event.stopPropagation();
  try { await api.get('/api/reveal?path=' + encodeURIComponent(path)); }
  catch (e) { showToast('Could not open Finder: ' + e.message, 'error'); }
}

// ── Generic file list renderer ─────────────────────────────────────

function renderFileList(containerId, items, actionsId, sizeId, extraMeta) {
  const container = document.getElementById(containerId);
  const actions   = document.getElementById(actionsId);

  if (!items || !items.length) {
    container.innerHTML = emptyState('✅', 'Nothing found', 'You\'re clean here!');
    if (actions) actions.classList.add('hidden');
    return;
  }

  let html = `
    <div class="select-all-row">
      <input type="checkbox" onchange="toggleAll('${containerId}',this.checked,'${sizeId}','${actionsId}')">
      <label>Select all (${items.length} items)</label>
    </div>
    <div class="file-list">
  `;

  for (const item of items) {
    const name = esc(item.name || item.path.split('/').pop());
    const path = esc(item.path);
    let meta = esc(item.path);
    if (item.category) meta = `<span class="file-badge">${esc(item.category)}</span> ` + meta;
    if (item.days_old > 0) meta += ` · ${item.days_old}d old`;
    if (item.days_since_use != null) meta += ` · last used ${item.days_since_use}d ago`;
    if (item.last_backup) meta += ` · backup: ${esc(item.last_backup)}`;
    if (extraMeta) meta += extraMeta(item);

    html += `
      <div class="file-item" data-path="${path}" data-size="${item.size || 0}">
        <input type="checkbox" onchange="updateSelected('${containerId}','${sizeId}','${actionsId}')">
        <div class="file-info">
          <div class="file-name">${name}</div>
          <div class="file-meta">${meta}</div>
        </div>
        <div class="file-right">
          <span class="file-size">${esc(item.size_human)}</span>
          <button class="reveal-btn" onclick="revealInFinder('${path}',event)" title="Show in Finder">↗</button>
        </div>
      </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
  if (actions) actions.classList.remove('hidden');
  updateSelected(containerId, sizeId, actionsId);
}

function showSummary(id, count, total_human, extra) {
  const el = document.getElementById(id);
  let html = `
    <div class="stat-block"><div class="stat-label">Items found</div><div class="stat-value accent">${count}</div></div>
    <div class="stat-block"><div class="stat-label">Total size</div><div class="stat-value">${esc(total_human)}</div></div>`;
  if (extra) html += extra;
  el.innerHTML = html;
  el.classList.remove('hidden');
}

// ── Generic scan builder ───────────────────────────────────────────

function makeScanTab(cfg) {
  const { scanBtn, endpoint, resultId, summaryId, actionsId, sizeId, loadingMsg, extraMeta } = cfg;
  const btn = document.getElementById(scanBtn);
  const del = document.getElementById(cfg.deleteBtn);

  async function scan() {
    btn.disabled = true; btn.textContent = 'Scanning…';
    document.getElementById(resultId).innerHTML = loading(loadingMsg);
    document.getElementById(summaryId).classList.add('hidden');
    try {
      const url = typeof endpoint === 'function' ? endpoint() : endpoint;
      const data = await api.get(url);
      showSummary(summaryId, data.count, data.total_human);
      renderFileList(resultId, data.items, actionsId, sizeId, extraMeta);
    } catch (e) {
      document.getElementById(resultId).innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Scan';
    }
  }

  btn.addEventListener('click', scan);
  if (del) del.addEventListener('click', () => deleteSelected(resultId, sizeId, actionsId, scan));
}

// ── CLEAN SPACE tabs ───────────────────────────────────────────────

makeScanTab({ scanBtn:'scan-cache',       deleteBtn:'delete-cache',
  endpoint:'/api/scan/cache',        resultId:'cache-results',
  summaryId:'cache-summary',         actionsId:'cache-actions',   sizeId:'cache-sel',
  loadingMsg:'Scanning caches and logs…' });

makeScanTab({ scanBtn:'scan-screenshots', deleteBtn:'delete-screenshots',
  endpoint:'/api/scan/screenshots',  resultId:'screenshots-results',
  summaryId:'screenshots-summary',   actionsId:'screenshots-actions', sizeId:'screenshots-sel',
  loadingMsg:'Finding screenshots…' });

makeScanTab({ scanBtn:'scan-mail',        deleteBtn:'delete-mail',
  endpoint:'/api/scan/mail',         resultId:'mail-results',
  summaryId:'mail-summary',          actionsId:'mail-actions',    sizeId:'mail-sel',
  loadingMsg:'Scanning Mail data…' });

makeScanTab({ scanBtn:'scan-ios',         deleteBtn:'delete-ios',
  endpoint:'/api/scan/ios',          resultId:'ios-results',
  summaryId:'ios-summary',           actionsId:'ios-actions',     sizeId:'ios-sel',
  loadingMsg:'Looking for iOS backups…',
  extraMeta: item => item.last_backup ? ` · Backup: ${esc(item.last_backup)}` : '' });

makeScanTab({ scanBtn:'scan-xcode',       deleteBtn:'delete-xcode',
  endpoint:'/api/scan/xcode',        resultId:'xcode-results',
  summaryId:'xcode-summary',         actionsId:'xcode-actions',   sizeId:'xcode-sel',
  loadingMsg:'Scanning Xcode junk…' });

makeScanTab({ scanBtn:'scan-browser',     deleteBtn:'delete-browser',
  endpoint:'/api/scan/browser',      resultId:'browser-results',
  summaryId:'browser-summary',       actionsId:'browser-actions', sizeId:'browser-sel',
  loadingMsg:'Scanning browser caches…' });

makeScanTab({ scanBtn:'scan-trash',       deleteBtn:'delete-trash',
  endpoint:'/api/scan/trash',        resultId:'trash-results',
  summaryId:'trash-summary',         actionsId:'trash-actions',   sizeId:'trash-sel',
  loadingMsg:'Scanning Trash and archives…' });

makeScanTab({ scanBtn:'scan-large',       deleteBtn:'delete-large',
  endpoint: () => `/api/scan/large-files?min_mb=${document.getElementById('min-mb').value}&days_old=${document.getElementById('days-old').value}`,
  resultId:'large-results',          summaryId:'large-summary',
  actionsId:'large-actions',         sizeId:'large-sel',
  loadingMsg:'Scanning home directory — this may take a moment…' });

// ── Login Items ────────────────────────────────────────────────────

async function loadLoginItems() {
  const btn = document.getElementById('scan-login');
  btn.disabled = true; btn.textContent = 'Scanning…';
  document.getElementById('login-results').innerHTML = loading('Reading launch agents…');
  document.getElementById('login-summary').classList.add('hidden');
  try {
    const data = await api.get('/api/scan/login-items');
    showSummary('login-summary', data.count, '');
    renderLoginItems(data.items);
  } catch (e) {
    document.getElementById('login-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan';
  }
}

function renderLoginItems(items) {
  const container = document.getElementById('login-results');
  const actions   = document.getElementById('login-actions');
  if (!items.length) {
    container.innerHTML = '<div class="empty">No launch agents found.</div>';
    actions.classList.add('hidden');
    return;
  }

  const groups = { user: [], system: [] };
  items.forEach(it => (groups[it.scope] || groups.user).push(it));

  let html = '';
  [['user','User Agents (~/Library/LaunchAgents)'],
   ['system','System Agents & Daemons']].forEach(([scope, label]) => {
    const grp = groups[scope];
    if (!grp || !grp.length) return;
    html += `<div class="section-label" style="margin:12px 0 6px">${label}</div>`;
    grp.forEach(item => {
      const path = esc(item.path);
      const label2 = esc(item.label);
      const name   = esc(item.name);
      const prog   = esc(item.program || item.label);
      const checked = item.running ? 'checked' : '';
      html += `
        <div class="login-item file-item" data-path="${path}" data-size="0">
          <input type="checkbox" onchange="updateSelected('login-results','login-sel','login-actions')">
          <div class="login-info">
            <div class="login-name">${name}
              ${item.run_at_load ? '<span class="file-badge" style="background:rgba(255,159,10,.15);color:var(--orange)">RunAtLoad</span>' : ''}
              ${item.running ? '<span class="file-badge" style="background:rgba(48,209,88,.15);color:var(--success)">Running</span>' : ''}
            </div>
            <div class="login-meta">${label2} &nbsp;·&nbsp; ${prog}</div>
          </div>
          <div class="toggle-wrap">
            <span class="scope-badge ${scope === 'user' ? 'user' : ''}">${scope}</span>
            <label class="toggle" title="Enable/disable">
              <input type="checkbox" ${checked}
                onchange="toggleLoginItem('${path}', this.checked, this)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>`;
    });
  });
  container.innerHTML = html;
  actions.classList.remove('hidden');
}

async function toggleLoginItem(path, enable, checkbox) {
  try {
    const res = await api.post('/api/login-items/toggle', { path, enable });
    if (!res.ok) {
      showToast(res.error || 'Toggle failed', 'error');
      checkbox.checked = !enable;
    } else {
      showToast(enable ? 'Enabled' : 'Disabled', 'success');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
    checkbox.checked = !enable;
  }
}

document.getElementById('scan-login').addEventListener('click', loadLoginItems);
document.getElementById('delete-login').addEventListener('click', () =>
  deleteSelected('login-results', 'login-sel', 'login-actions', loadLoginItems));

// ── Processes ──────────────────────────────────────────────────────

let procSortBy = 'cpu';

async function loadProcesses() {
  document.getElementById('processes-results').innerHTML = loading('Reading process list…');
  try {
    const [procs, mem] = await Promise.all([
      api.get(`/api/processes?sort_by=${procSortBy}&limit=50`),
      api.get('/api/memory'),
    ]);
    renderMemGauge(mem);
    renderProcesses(procs.processes);
  } catch (e) {
    document.getElementById('processes-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

function renderMemGauge(mem) {
  const el = document.getElementById('mem-gauge');
  if (!mem || mem.error) { el.classList.add('hidden'); return; }
  const pct = mem.used_pct || 0;
  el.innerHTML = `
    <span class="mem-label">RAM</span>
    <div class="mem-bar-wrap">
      <div class="mem-bar-fill ${pct > 80 ? 'high' : ''}" style="width:${pct}%"></div>
    </div>
    <span class="mem-stat">${esc(mem.used_human)} / ${esc(mem.total_human)}</span>
    <span class="mem-label">${pct}% used</span>`;
  el.classList.remove('hidden');
}

function renderProcesses(procs) {
  if (!procs || !procs.length) {
    document.getElementById('processes-results').innerHTML = '<div class="empty">No processes found.</div>';
    return;
  }
  const maxCpu = Math.max(...procs.map(p => p.cpu), 1);
  let html = `<table class="process-table">
    <thead><tr>
      <th>Process</th><th>PID</th><th>CPU %</th><th>RAM</th><th></th>
    </tr></thead><tbody>`;
  for (const p of procs) {
    const pct = Math.min(Math.round((p.cpu / maxCpu) * 100), 100);
    const hot = p.cpu > 20 ? 'hot' : '';
    html += `
      <tr>
        <td>
          <span class="proc-name" title="${esc(p.cmd)}">${esc(p.name)}</span>
          <div class="cpu-bar"><div class="cpu-bar-fill ${hot}" style="width:${pct}%"></div></div>
        </td>
        <td><span class="proc-pid">${p.pid}</span></td>
        <td>${p.cpu.toFixed(1)}%</td>
        <td>${esc(p.rss_human)}</td>
        <td><button class="kill-btn" onclick="killProc(${p.pid})">Kill</button></td>
      </tr>`;
  }
  html += '</tbody></table>';
  document.getElementById('processes-results').innerHTML = html;
}

async function killProc(pid) {
  if (!confirm(`Kill process ${pid}?`)) return;
  try {
    const res = await api.post('/api/processes/kill', { pid });
    if (res.ok) { showToast(`Process ${pid} terminated`); loadProcesses(); }
    else showToast(res.error, 'error');
  } catch (e) { showToast(e.message, 'error'); }
}

document.getElementById('refresh-processes').addEventListener('click', loadProcesses);

document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    procSortBy = btn.dataset.sort === 'mem' ? 'mem' : 'cpu';
    loadProcesses();
  });
});

// ── Maintenance ────────────────────────────────────────────────────

async function runMaint(btn, script) {
  btn.disabled = true;
  const statusMap = { daily: 'maint-daily', purge: 'maint-purge', dns: 'maint-dns' };
  const statusEl = document.getElementById(statusMap[script] || '');
  if (statusEl) { statusEl.textContent = 'Running…'; statusEl.className = 'maint-status'; }
  try {
    const res = await api.post('/api/maintenance/run', { script });
    if (res.ok) {
      showToast(res.output || 'Done', 'success');
      if (statusEl) { statusEl.textContent = '✓ Done'; statusEl.className = 'maint-status ok'; }
    } else {
      showToast(res.error || 'Failed', 'error');
      if (statusEl) { statusEl.textContent = res.error || 'Failed'; statusEl.className = 'maint-status err'; }
    }
  } catch (e) {
    showToast(e.message, 'error');
    if (statusEl) { statusEl.textContent = e.message; statusEl.className = 'maint-status err'; }
  } finally {
    btn.disabled = false;
  }
}

// ── Privacy ────────────────────────────────────────────────────────

async function loadPrivacy() {
  const btn = document.getElementById('scan-privacy');
  btn.disabled = true; btn.textContent = 'Scanning…';
  document.getElementById('privacy-results').innerHTML = loading('Scanning privacy data…');
  document.getElementById('privacy-summary').classList.add('hidden');
  try {
    const data = await api.get('/api/scan/privacy');
    showSummary('privacy-summary', data.count, data.total_human);
    renderPrivacyItems(data.items);
  } catch (e) {
    document.getElementById('privacy-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan';
  }
}

function renderPrivacyItems(items) {
  const container = document.getElementById('privacy-results');
  const actions   = document.getElementById('privacy-actions');
  if (!items.length) {
    container.innerHTML = '<div class="empty">No privacy data found.</div>';
    actions.classList.add('hidden');
    return;
  }
  let html = '';
  for (const item of items) {
    const path = esc(item.path);
    html += `
      <div class="privacy-item file-item" data-path="${path}" data-size="${item.size}">
        <input type="checkbox" checked
          onchange="updateSelected('privacy-results','privacy-sel','privacy-actions')">
        <span class="privacy-cat ${esc(item.category)}">${esc(item.category)}</span>
        <div class="privacy-info">
          <div class="privacy-name">${esc(item.name)}</div>
          <div class="privacy-desc">${esc(item.description)}</div>
        </div>
        <div class="file-right">
          <span class="file-size">${esc(item.size_human)}</span>
          <button class="reveal-btn" onclick="revealInFinder('${path}',event)" title="Show in Finder">↗</button>
        </div>
      </div>`;
  }
  container.innerHTML = html;
  actions.classList.remove('hidden');
  updateSelected('privacy-results', 'privacy-sel', 'privacy-actions');
}

document.getElementById('scan-privacy').addEventListener('click', loadPrivacy);
document.getElementById('delete-privacy').addEventListener('click', () =>
  deleteSelected('privacy-results', 'privacy-sel', 'privacy-actions', loadPrivacy));

// ── Network Monitor ────────────────────────────────────────────────

async function loadNetwork() {
  const container = document.getElementById('network-results');
  container.innerHTML = loading('Reading network connections…');
  try {
    const data = await api.get('/api/network');
    renderNetwork(data.connections, data.count);
  } catch (e) {
    container.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

function renderNetwork(groups, total) {
  const container = document.getElementById('network-results');
  if (!groups || !groups.length) {
    container.innerHTML = '<div class="empty">No active connections found.</div>';
    return;
  }
  let html = `<div class="section-label" style="margin-bottom:10px">${total} processes with active connections</div>`;
  for (const g of groups) {
    const id = `net-${esc(g.process)}-${g.pid}`;
    html += `
      <div class="net-group">
        <div class="net-group-header" onclick="toggleNet('${id}')">
          <span>🔌</span>
          <span>${esc(g.process)}</span>
          <span class="net-proc-pid">PID ${g.pid}</span>
          <span class="net-conn-count">${g.connections.length} connection${g.connections.length !== 1 ? 's' : ''} ▾</span>
        </div>
        <div class="net-conn-list" id="${id}" style="display:none">`;
    for (const c of g.connections) {
      const addr = c.remote ? `${esc(c.local)} → ${esc(c.remote)}` : esc(c.local);
      html += `
          <div class="net-conn-row">
            <span class="net-state ${esc(c.state)}">${esc(c.state)}</span>
            <span class="net-addr">${addr}</span>
          </div>`;
    }
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

function toggleNet(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

document.getElementById('refresh-network').addEventListener('click', loadNetwork);

// ── Duplicates ─────────────────────────────────────────────────────

async function scanDupes() {
  const btn = document.getElementById('scan-dupes');
  btn.disabled = true; btn.textContent = 'Scanning…';
  const path = document.getElementById('dupe-path').value;
  document.getElementById('dupes-results').innerHTML = loading('Computing file hashes…');
  document.getElementById('dupes-summary').classList.add('hidden');
  try {
    const data = await api.get('/api/scan/duplicates?path=' + encodeURIComponent(path));
    showSummary('dupes-summary', data.total_groups, data.total_wasted_human,
      `<div><div class="stat-label">Space wasted</div><div class="stat-value">${esc(data.total_wasted_human)}</div></div>`);
    renderDupeGroups(data.groups);
  } catch (e) {
    document.getElementById('dupes-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan';
  }
}

function renderDupeGroups(groups) {
  const container = document.getElementById('dupes-results');
  const actions   = document.getElementById('dupes-actions');
  if (!groups.length) {
    container.innerHTML = '<div class="empty">No duplicates found!</div>';
    actions.classList.add('hidden'); return;
  }
  let html = '';
  for (const group of groups) {
    html += `<div class="dupe-group">
      <div class="dupe-group-header">
        <span class="badge">${group.count} copies</span>
        <span>${esc(group.size_human)} each</span>
        <span style="color:var(--danger)">wasting ${esc(group.wasted_human)}</span>
      </div>`;
    group.files.forEach((f, i) => {
      const keep = i === 0;
      const path = esc(f.path);
      html += `
        <div class="dupe-file file-item" data-path="${path}" data-size="${keep ? 0 : group.size}">
          <input type="checkbox" ${keep ? '' : 'checked'}
            onchange="updateSelected('dupes-results','dupes-sel','dupes-actions')">
          <div class="file-info">
            <div class="file-name">${esc(f.name)}${keep ? '<span class="keep-tag">KEEP</span>' : ''}</div>
            <div class="file-meta">${path}</div>
          </div>
          <div class="file-right">
            <span class="file-size">${keep ? '' : esc(group.size_human)}</span>
            <button class="reveal-btn" onclick="revealInFinder('${path}',event)">↗</button>
          </div>
        </div>`;
    });
    html += '</div>';
  }
  container.innerHTML = html;
  actions.classList.remove('hidden');
  updateSelected('dupes-results', 'dupes-sel', 'dupes-actions');
}

document.getElementById('scan-dupes').addEventListener('click', scanDupes);
document.getElementById('delete-dupes').addEventListener('click', () =>
  deleteSelected('dupes-results', 'dupes-sel', 'dupes-actions', scanDupes));

// ── Similar Photos ─────────────────────────────────────────────────

async function scanPhotos() {
  const btn = document.getElementById('scan-photos');
  btn.disabled = true; btn.textContent = 'Scanning…';
  const path = document.getElementById('photos-path').value;
  const threshold = document.getElementById('photos-threshold').value;
  document.getElementById('photos-results').innerHTML = loading('Computing perceptual hashes (may take a while for large libraries)…');
  document.getElementById('photos-summary').classList.add('hidden');
  try {
    const data = await api.get(`/api/scan/similar-photos?path=${encodeURIComponent(path)}&threshold=${threshold}`);
    if (data.error) {
      document.getElementById('photos-results').innerHTML = `<div class="empty">${esc(data.error)}</div>`;
      return;
    }
    showSummary('photos-summary', data.total_groups, data.total_wasted_human,
      `<div><div class="stat-label">Method</div><div class="stat-value" style="font-size:14px">${esc(data.hash_method)}</div></div>
       <div><div class="stat-label">Files scanned</div><div class="stat-value">${data.files_scanned || 0}</div></div>`);
    renderPhotoGroups(data.groups);
  } catch (e) {
    document.getElementById('photos-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan';
  }
}

function renderPhotoGroups(groups) {
  const container = document.getElementById('photos-results');
  const actions   = document.getElementById('photos-actions');
  if (!groups.length) {
    container.innerHTML = '<div class="empty">No similar photos found!</div>';
    actions.classList.add('hidden'); return;
  }
  let html = '';
  for (const group of groups) {
    html += `<div class="photo-group">
      <div class="photo-group-header">
        <span class="badge">${group.count} similar</span>
        <span style="color:var(--danger)">wasting ${esc(group.wasted_human)}</span>
      </div>
      <div class="photo-grid">`;
    group.photos.forEach((photo, i) => {
      const keep = i === 0;
      const path = esc(photo.path);
      html += `
        <div class="photo-card">
          <img class="photo-thumb ${keep ? 'keep-border' : ''}"
            src="/api/thumbnail?path=${encodeURIComponent(photo.path)}&size=110"
            loading="lazy" alt="${esc(photo.name)}"
            onerror="this.style.display='none'">
          <div class="photo-card-meta" title="${path}">${esc(photo.name)}</div>
          <div class="photo-card-size">${esc(photo.size_human)}</div>
          <label class="photo-card-check file-item" data-path="${path}" data-size="${keep ? 0 : photo.size}" style="border:none;background:none;padding:2px 0">
            <input type="checkbox" ${keep ? '' : 'checked'}
              onchange="updateSelected('photos-results','photos-sel','photos-actions')">
            <span>${keep ? '✓ Keep' : 'Delete'}</span>
          </label>
        </div>`;
    });
    html += '</div></div>';
  }
  container.innerHTML = html;
  actions.classList.remove('hidden');
  updateSelected('photos-results', 'photos-sel', 'photos-actions');
}

document.getElementById('scan-photos').addEventListener('click', scanPhotos);
document.getElementById('delete-photos').addEventListener('click', () =>
  deleteSelected('photos-results', 'photos-sel', 'photos-actions', scanPhotos));

// ── App Manager ────────────────────────────────────────────────────

async function scanApps() {
  const btn = document.getElementById('scan-apps');
  btn.disabled = true; btn.textContent = 'Scanning…';
  document.getElementById('apps-results').innerHTML = loading('Reading /Applications…');
  document.getElementById('apps-summary').classList.add('hidden');
  try {
    const data = await api.get('/api/scan/apps');
    showSummary('apps-summary', data.count, data.total_human);
    renderApps(data.items);
  } catch (e) {
    document.getElementById('apps-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan';
  }
}

function renderApps(apps) {
  const container = document.getElementById('apps-results');
  if (!apps.length) { container.innerHTML = '<div class="empty">No apps found.</div>'; return; }

  let html = '';
  for (const app of apps) {
    const id   = `app-${esc(app.name).replace(/\s/g,'_')}`;
    const path = esc(app.path);
    const unused = app.days_since_use != null && app.days_since_use > 180;
    let meta = app.last_used ? `Last used: ${esc(app.last_used)}` : 'Never used';
    if (app.bundle_id) meta += ` · ${esc(app.bundle_id)}`;

    html += `
      <div class="app-item" id="${id}">
        <div class="app-row">
          <div class="app-icon">📦</div>
          <div class="app-info">
            <div class="app-name">${esc(app.name)}
              ${unused ? '<span class="file-badge" style="background:rgba(255,69,58,.15);color:var(--danger)">Unused 180d+</span>' : ''}
            </div>
            <div class="app-meta">${meta}</div>
          </div>
          <div class="app-right">
            <span class="app-size">${esc(app.size_human)}</span>
            <button class="btn btn-ghost btn-sm" onclick="findLeftovers('${id}','${esc(app.bundle_id)}','${esc(app.name)}')">Find Leftovers</button>
            <button class="reveal-btn" style="display:inline-block" onclick="revealInFinder('${path}',event)" title="Show in Finder">↗</button>
          </div>
        </div>
        <div id="${id}-leftovers" style="display:none"></div>
      </div>`;
  }
  container.innerHTML = html;
}

async function findLeftovers(id, bundleId, appName) {
  const btn = document.querySelector(`#${id} .btn-ghost`);
  const panel = document.getElementById(`${id}-leftovers`);
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  btn.textContent = 'Searching…'; btn.disabled = true;
  panel.style.display = 'block';
  panel.innerHTML = '<div class="loading" style="padding:16px"><div class="spinner"></div>Searching Library folders…</div>';
  try {
    const data = await api.post('/api/apps/leftovers', { bundle_id: bundleId, app_name: appName });
    if (!data.leftovers.length) {
      panel.innerHTML = '<div class="app-leftovers" style="color:var(--muted);font-size:13px">No leftover files found.</div>';
      return;
    }
    const leftId = `${id}-left-list`;
    let html = `<div class="app-leftovers">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:12px;color:var(--muted)">${data.count} leftover files · ${esc(data.total_human)}</span>
        <button class="btn btn-danger btn-sm" onclick="deleteLeftovers('${leftId}')">Move Selected to Trash</button>
      </div>
      <div id="${leftId}">`;
    for (const f of data.leftovers) {
      const fp = esc(f.path);
      html += `
        <div class="leftover-item file-item" data-path="${fp}" data-size="${f.size}">
          <input type="checkbox" checked onchange="updateSelected('${leftId}','','')">
          <div style="flex:1;min-width:0">
            <div class="leftover-name">${esc(f.name)}</div>
            <div class="leftover-sub">${esc(f.subdirectory)}</div>
          </div>
          <span class="leftover-size">${esc(f.size_human)}</span>
          <button class="reveal-btn" style="display:inline-block" onclick="revealInFinder('${fp}',event)">↗</button>
        </div>`;
    }
    html += '</div></div>';
    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="app-leftovers" style="color:var(--danger)">${esc(e.message)}</div>`;
  } finally {
    btn.textContent = 'Hide Leftovers'; btn.disabled = false;
  }
}

async function deleteLeftovers(listId) {
  const paths = [...document.querySelectorAll(`#${listId} .file-item.selected`)]
    .map(el => el.dataset.path);
  if (!paths.length) { showToast('Nothing selected', 'error'); return; }
  try {
    const res = await api.post('/api/delete', { paths });
    showToast(`Moved ${res.deleted.length} leftover(s) to Trash`);
    document.querySelectorAll(`#${listId} .file-item.selected`).forEach(el => el.remove());
  } catch (e) { showToast(e.message, 'error'); }
}

document.getElementById('scan-apps').addEventListener('click', scanApps);

// ── Broken Links & Empty Folders ───────────────────────────────────

async function scanSymlinks() {
  const btn = document.getElementById('scan-symlinks');
  btn.disabled = true; btn.textContent = 'Scanning…';
  document.getElementById('symlinks-results').innerHTML = loading('Looking for broken symlinks…');
  document.getElementById('symlinks-summary').classList.add('hidden');
  try {
    const data = await api.get('/api/scan/symlinks');
    showSummary('symlinks-summary', data.count, data.total_human || '0 B');
    renderSymlinks(data.items);
  } catch (e) {
    document.getElementById('symlinks-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan Broken Links';
  }
}

function renderSymlinks(items) {
  const container = document.getElementById('symlinks-results');
  const actions   = document.getElementById('symlinks-actions');
  if (!items.length) {
    container.innerHTML = '<div class="empty">No broken symlinks found!</div>';
    actions.classList.add('hidden'); return;
  }
  let html = `<div class="select-all-row">
    <input type="checkbox" onchange="toggleAll('symlinks-results',this.checked,'symlinks-sel','symlinks-actions')">
    <label>Select all (${items.length})</label>
  </div><div class="file-list">`;
  for (const item of items) {
    const path = esc(item.path);
    html += `
      <div class="file-item" data-path="${path}" data-size="0">
        <input type="checkbox" onchange="updateSelected('symlinks-results','symlinks-sel','symlinks-actions')">
        <div class="file-info">
          <div class="file-name">🔗 ${esc(item.name)}</div>
          <div class="file-meta">→ ${esc(item.target)} <span style="color:var(--danger)">(missing)</span></div>
        </div>
        <div class="file-right">
          <button class="reveal-btn" style="display:inline-block" onclick="revealInFinder('${path}',event)">↗</button>
        </div>
      </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
  actions.classList.remove('hidden');
}

async function scanEmpty() {
  const btn = document.getElementById('scan-empty');
  btn.disabled = true; btn.textContent = 'Scanning…';
  document.getElementById('empty-results').innerHTML = loading('Looking for empty folders…');
  document.getElementById('empty-summary').classList.add('hidden');
  try {
    const data = await api.get('/api/scan/empty-folders');
    showSummary('empty-summary', data.count, data.total_human || '0 B');
    renderFileList('empty-results', data.items, 'empty-actions', 'empty-sel');
  } catch (e) {
    document.getElementById('empty-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan Empty Folders';
  }
}

document.getElementById('scan-symlinks').addEventListener('click', scanSymlinks);
document.getElementById('delete-symlinks').addEventListener('click', () =>
  deleteSelected('symlinks-results', 'symlinks-sel', 'symlinks-actions', scanSymlinks));
document.getElementById('scan-empty').addEventListener('click', scanEmpty);
document.getElementById('delete-empty').addEventListener('click', () =>
  deleteSelected('empty-results', 'empty-sel', 'empty-actions', scanEmpty));

// ── Disk Map ───────────────────────────────────────────────────────

let diskChart = null;

function initDiskChart() {
  diskChart = echarts.init(document.getElementById('disk-chart'), 'dark');
  window.addEventListener('resize', () => diskChart.resize());
  diskChart.on('click', params => {
    if (params.componentType === 'series' && params.data && params.data.path) {
      fetchFolderFiles(params.data.path);
    }
  });
}

function toEChartsTree(node) {
  const r = { name: node.name, value: node.size, path: node.path };
  if (node.children && node.children.length) r.children = node.children.map(toEChartsTree);
  return r;
}

async function scanDisk() {
  const btn = document.getElementById('scan-disk');
  btn.disabled = true; btn.textContent = 'Scanning…';
  const path  = document.getElementById('disk-path').value;
  const depth = document.getElementById('disk-depth').value;
  try {
    const data = await api.get(`/api/disk/usage?path=${encodeURIComponent(path)}&depth=${depth}`);
    if (!diskChart) initDiskChart();
    diskChart.setOption({
      backgroundColor: '#2c2c2e',
      tooltip: { formatter: info => `<b>${esc(info.data.name)}</b><br/>${fmtBytes(info.data.value)}` },
      series: [{
        type: 'treemap',
        data: (toEChartsTree(data).children || []),
        roam: false, nodeClick: 'zoomToNode',
        breadcrumb: { show: true, itemStyle: { color: '#3a3a3c', textStyle: { color: '#f5f5f7' } } },
        label: { show: true, formatter: p => p.name + '\n' + fmtBytes(p.value), fontSize: 12, color: '#f5f5f7' },
        upperLabel: { show: true, height: 28, color: '#f5f5f7', fontSize: 12, fontWeight: 600 },
        itemStyle: { borderColor: '#1c1c1e', borderWidth: 2, gapWidth: 2 },
        levels: [
          { itemStyle: { borderWidth: 3, gapWidth: 3, borderColor: '#111' } },
          { itemStyle: { borderWidth: 2, gapWidth: 2 } },
          { itemStyle: { borderWidth: 1, gapWidth: 1 } },
        ],
      }],
    });
  } catch (e) {
    document.getElementById('disk-chart').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Scan';
  }
}

function fileIcon(name, type) {
  if (type === 'directory') return '📁';
  const ext = name.split('.').pop().toLowerCase();
  if (['mp4','mov','avi','mkv','m4v'].includes(ext)) return '🎬';
  if (['jpg','jpeg','png','gif','webp','heic','svg'].includes(ext)) return '🖼️';
  if (['mp3','aac','flac','wav','m4a'].includes(ext)) return '🎵';
  if (['zip','tar','gz','rar','7z','dmg','pkg'].includes(ext)) return '📦';
  if (['pdf'].includes(ext)) return '📄';
  if (['py','js','ts','swift','go','rs','c','cpp','java','rb'].includes(ext)) return '💻';
  return '📄';
}

async function fetchFolderFiles(path) {
  const panel   = document.getElementById('disk-panel');
  const titleEl = document.getElementById('disk-panel-title');
  const summaryEl = document.getElementById('disk-panel-summary');
  const filesEl = document.getElementById('disk-panel-files');

  const wasHidden = panel.classList.contains('hidden');
  panel.classList.remove('hidden');
  if (wasHidden) setTimeout(() => diskChart && diskChart.resize(), 10);

  titleEl.textContent = path.split('/').pop() || path;
  filesEl.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
  summaryEl.textContent = '';

  try {
    const data = await api.get('/api/disk/files?path=' + encodeURIComponent(path));
    titleEl.textContent = '📁 ' + data.name;
    summaryEl.textContent = data.count + ' items · ' + data.total_human;

    if (!data.items.length) { filesEl.innerHTML = '<div class="empty">Empty folder</div>'; return; }

    const maxSize = data.items[0].size || 1;
    let html = '';
    for (const item of data.items) {
      const pct   = Math.max(2, Math.round((item.size / maxSize) * 100));
      const isDir = item.type === 'directory';
      const icon  = fileIcon(item.name, item.type);
      const rp    = item.path.replace(/'/g, "\\'");
      const click = isDir ? `onclick="fetchFolderFiles('${rp}')"` : '';
      html += `
        <div class="disk-file-row ${isDir ? 'is-dir' : ''}" ${click}>
          <div class="disk-file-meta">
            <span class="disk-file-name"><span>${icon}</span><span>${esc(item.name)}</span></span>
            <div class="disk-file-actions">
              <span class="disk-file-size">${esc(item.size_human)}</span>
              <button class="reveal-btn" onclick="revealInFinder('${rp}',event)"
                title="${isDir ? 'Open in Finder' : 'Show in Finder'}">↗</button>
            </div>
          </div>
          <div class="disk-bar-track"><div class="disk-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    }
    filesEl.innerHTML = html;
  } catch (e) {
    filesEl.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

function closePanel() {
  document.getElementById('disk-panel').classList.add('hidden');
  setTimeout(() => diskChart && diskChart.resize(), 10);
}

document.getElementById('scan-disk').addEventListener('click', scanDisk);
