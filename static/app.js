// ── Utilities ──────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3200);
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

// ── Tab navigation ─────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Selection helpers ──────────────────────────────────────────────────────

function updateSelected(containerId, sizeId, actionsId) {
  let total = 0;
  document.querySelectorAll('#' + containerId + ' .file-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (!cb) return;
    const selected = cb.checked;
    item.classList.toggle('selected', selected);
    if (selected) total += parseInt(item.dataset.size || '0', 10);
  });
  const sizeEl = document.getElementById(sizeId);
  if (sizeEl) sizeEl.textContent = total > 0 ? fmtBytes(total) + ' selected' : '';
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
    showToast('Moved ' + res.deleted.length + ' item(s) to Trash');
    if (res.errors.length) console.warn('Delete errors:', res.errors);
    afterFn();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ── Generic file list renderer ─────────────────────────────────────────────

function renderFileList(containerId, items, actionsId, sizeId) {
  const container = document.getElementById(containerId);
  const actions = document.getElementById(actionsId);

  if (!items.length) {
    container.innerHTML = '<div class="empty">No items found — you\'re clean here!</div>';
    actions.classList.add('hidden');
    return;
  }

  const safeIds = [containerId, sizeId, actionsId].map(esc);

  let html = `
    <div class="select-all-row">
      <input type="checkbox"
        onchange="toggleAll('${containerId}', this.checked, '${sizeId}', '${actionsId}')">
      <label>Select all (${items.length} items)</label>
    </div>
    <div class="file-list">
  `;

  for (const item of items) {
    const name = esc(item.name || item.path.split('/').pop());
    const path = esc(item.path);
    const meta = item.days_since_access !== undefined
      ? esc(item.path) + ' &nbsp;·&nbsp; accessed ' + item.days_since_access + ' days ago'
      : esc(item.path);

    html += `
      <div class="file-item" data-path="${path}" data-size="${item.size}">
        <input type="checkbox"
          onchange="updateSelected('${containerId}', '${sizeId}', '${actionsId}')">
        <div class="file-info">
          <div class="file-name">${name}</div>
          <div class="file-meta">${meta}</div>
        </div>
        <div class="file-size">${esc(item.size_human)}</div>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
  actions.classList.remove('hidden');
  updateSelected(containerId, sizeId, actionsId);
}

// ── Cache & Logs ───────────────────────────────────────────────────────────

async function scanCache() {
  const btn = document.getElementById('scan-cache');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  document.getElementById('cache-results').innerHTML =
    '<div class="loading"><div class="spinner"></div>Scanning caches and logs…</div>';
  document.getElementById('cache-summary').classList.add('hidden');

  try {
    const data = await api.get('/api/scan/cache');
    document.getElementById('cache-summary').innerHTML = `
      <div><div class="stat-label">Items</div><div class="stat-value">${data.count}</div></div>
      <div><div class="stat-label">Total size</div><div class="stat-value">${esc(data.total_human)}</div></div>
    `;
    document.getElementById('cache-summary').classList.remove('hidden');
    renderFileList('cache-results', data.items, 'cache-actions', 'cache-selected-size');
  } catch (e) {
    document.getElementById('cache-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan';
  }
}

document.getElementById('scan-cache').addEventListener('click', scanCache);
document.getElementById('delete-cache').addEventListener('click', () =>
  deleteSelected('cache-results', 'cache-selected-size', 'cache-actions', scanCache)
);

// ── Large Files ────────────────────────────────────────────────────────────

async function scanLarge() {
  const btn = document.getElementById('scan-large');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  const minMb = document.getElementById('min-mb').value;
  const daysOld = document.getElementById('days-old').value;
  document.getElementById('large-results').innerHTML =
    '<div class="loading"><div class="spinner"></div>Scanning home directory — this may take a moment…</div>';
  document.getElementById('large-summary').classList.add('hidden');

  try {
    const data = await api.get(`/api/scan/large-files?min_mb=${minMb}&days_old=${daysOld}`);
    document.getElementById('large-summary').innerHTML = `
      <div><div class="stat-label">Files found</div><div class="stat-value">${data.count}</div></div>
      <div><div class="stat-label">Total size</div><div class="stat-value">${esc(data.total_human)}</div></div>
    `;
    document.getElementById('large-summary').classList.remove('hidden');
    renderFileList('large-results', data.items, 'large-actions', 'large-selected-size');
  } catch (e) {
    document.getElementById('large-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan';
  }
}

document.getElementById('scan-large').addEventListener('click', scanLarge);
document.getElementById('delete-large').addEventListener('click', () =>
  deleteSelected('large-results', 'large-selected-size', 'large-actions', scanLarge)
);

// ── Duplicates ─────────────────────────────────────────────────────────────

function renderDupeGroups(groups) {
  const container = document.getElementById('dupes-results');
  const actions = document.getElementById('dupes-actions');

  if (!groups.length) {
    container.innerHTML = '<div class="empty">No duplicates found!</div>';
    actions.classList.add('hidden');
    return;
  }

  let html = '';
  for (const group of groups) {
    html += `
      <div class="dupe-group">
        <div class="dupe-group-header">
          <span class="badge">${group.count} copies</span>
          <span>${esc(group.size_human)} each</span>
          <span style="color:var(--danger)">wasting ${esc(group.wasted_human)}</span>
        </div>
    `;
    group.files.forEach((f, i) => {
      const isKeep = i === 0;
      const size = isKeep ? 0 : group.size;
      html += `
        <div class="dupe-file file-item" data-path="${esc(f.path)}" data-size="${size}">
          <input type="checkbox" ${isKeep ? '' : 'checked'}
            onchange="updateSelected('dupes-results','dupes-selected-size','dupes-actions')">
          <div class="file-info">
            <div class="file-name">
              ${esc(f.name)}
              ${isKeep ? '<span class="keep-tag">KEEP</span>' : ''}
            </div>
            <div class="file-meta">${esc(f.path)}</div>
          </div>
          <div class="file-size">${isKeep ? '' : esc(group.size_human)}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  container.innerHTML = html;
  actions.classList.remove('hidden');
  updateSelected('dupes-results', 'dupes-selected-size', 'dupes-actions');
}

async function scanDupes() {
  const btn = document.getElementById('scan-dupes');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  const path = document.getElementById('dupe-path').value;
  document.getElementById('dupes-results').innerHTML =
    '<div class="loading"><div class="spinner"></div>Computing file hashes…</div>';
  document.getElementById('dupes-summary').classList.add('hidden');

  try {
    const data = await api.get('/api/scan/duplicates?path=' + encodeURIComponent(path));
    document.getElementById('dupes-summary').innerHTML = `
      <div><div class="stat-label">Duplicate groups</div><div class="stat-value">${data.total_groups}</div></div>
      <div><div class="stat-label">Space wasted</div><div class="stat-value">${esc(data.total_wasted_human)}</div></div>
      <div><div class="stat-label">Scanned</div><div class="stat-value" style="font-size:13px">${esc(data.scan_path)}</div></div>
    `;
    document.getElementById('dupes-summary').classList.remove('hidden');
    renderDupeGroups(data.groups);
  } catch (e) {
    document.getElementById('dupes-results').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan';
  }
}

document.getElementById('scan-dupes').addEventListener('click', scanDupes);
document.getElementById('delete-dupes').addEventListener('click', () =>
  deleteSelected('dupes-results', 'dupes-selected-size', 'dupes-actions', scanDupes)
);

// ── Disk Map ───────────────────────────────────────────────────────────────

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
  const panel = document.getElementById('disk-panel');
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

    if (!data.items.length) {
      filesEl.innerHTML = '<div class="empty">Empty folder</div>';
      return;
    }

    const maxSize = data.items[0].size || 1;
    let html = '';

    for (const item of data.items) {
      const pct = Math.max(2, Math.round((item.size / maxSize) * 100));
      const isDir = item.type === 'directory';
      const icon = fileIcon(item.name, item.type);
      const clickAttr = isDir
        ? `onclick="fetchFolderFiles('${item.path.replace(/'/g, "\\'")}')" `
        : '';

      html += `
        <div class="disk-file-row ${isDir ? 'is-dir' : ''}" ${clickAttr}>
          <div class="disk-file-meta">
            <span class="disk-file-name">
              <span>${icon}</span>
              <span>${esc(item.name)}</span>
            </span>
            <span class="disk-file-size">${esc(item.size_human)}</span>
          </div>
          <div class="disk-bar-track">
            <div class="disk-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
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

function toEChartsTree(node) {
  const result = { name: node.name, value: node.size, path: node.path };
  if (node.children && node.children.length) {
    result.children = node.children.map(toEChartsTree);
  }
  return result;
}

async function scanDisk() {
  const btn = document.getElementById('scan-disk');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  const path = document.getElementById('disk-path').value;
  const depth = document.getElementById('disk-depth').value;

  try {
    const data = await api.get(
      '/api/disk/usage?path=' + encodeURIComponent(path) + '&depth=' + depth
    );

    if (!diskChart) initDiskChart();

    diskChart.setOption({
      backgroundColor: '#2c2c2e',
      tooltip: {
        formatter: info => {
          const d = info.data;
          return `<b>${esc(d.name)}</b><br/>${fmtBytes(d.value)}`;
        },
      },
      series: [{
        type: 'treemap',
        data: (toEChartsTree(data).children || []),
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          show: true,
          itemStyle: { color: '#3a3a3c', textStyle: { color: '#f5f5f7' } },
        },
        label: {
          show: true,
          formatter: p => p.name + '\n' + fmtBytes(p.value),
          fontSize: 12,
          color: '#f5f5f7',
        },
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
    document.getElementById('disk-chart').innerHTML =
      `<div class="empty">Error: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan';
  }
}

document.getElementById('scan-disk').addEventListener('click', scanDisk);
