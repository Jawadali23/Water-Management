document.addEventListener('DOMContentLoaded', () => {
  const apiBase = (window.__WMS_CONFIG__ && window.__WMS_CONFIG__.API_BASE_URL) || 'http://localhost:8000';
  const panel = document.querySelector('.manual-excel-body');
  if (!panel) return;

  panel.innerHTML = `
    <div class="manual-meter-head">
      <div>
        <div class="manual-meter-title">SQL Manual Reading Table</div>
        <div class="manual-meter-subtitle">Live view of dbo.Manual_reading from SQL Server</div>
      </div>
      <div class="manual-excel-actions">
        <button type="button" class="gf-btn" id="manualRefreshBtn">Refresh</button>
        <button type="button" class="gf-btn reset" id="manualDownloadBtn">Download Excel</button>
        <button type="button" class="gf-btn reset" id="manualOpenBtn">Open Excel</button>
      </div>
    </div>
    <div id="manualStatus" class="manual-excel-text" aria-live="polite"></div>
    <div id="manualTableWrap" style="overflow:auto;border:1px solid rgba(21,88,176,.12);border-radius:10px;background:#fff;max-height:360px"></div>
  `;

  const refreshBtn = document.getElementById('manualRefreshBtn');
  const downloadBtn = document.getElementById('manualDownloadBtn');
  const openBtn = document.getElementById('manualOpenBtn');
  const statusEl = document.getElementById('manualStatus');
  const tableWrap = document.getElementById('manualTableWrap');

  const setStatus = (message, tone = '') => {
    statusEl.textContent = message;
    statusEl.style.color = tone === 'error' ? '#b42318' : tone === 'success' ? '#0f7a4d' : 'var(--t2)';
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const renderRows = (rows) => {
    if (!rows.length) {
      tableWrap.innerHTML = '<div style="padding:12px;color:var(--t2);font-family:Rajdhani,sans-serif">No rows found in SQL Server.</div>';
      return;
    }

    const headers = Object.keys(rows[0]);
    const body = rows.map((row) => `
      <tr>
        ${headers.map((header) => `<td style="padding:9px 10px;border-bottom:1px solid rgba(21,88,176,.08);white-space:nowrap">${escapeHtml(row[header])}</td>`).join('')}
      </tr>
    `).join('');

    tableWrap.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-family:'Rajdhani',sans-serif;font-size:.82rem">
        <thead style="position:sticky;top:0;background:#f6f9ff;z-index:1">
          <tr>
            ${headers.map((header) => `<th style="text-align:left;padding:10px;border-bottom:1px solid rgba(21,88,176,.12);white-space:nowrap">${escapeHtml(header)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  };

  const loadReadings = async () => {
    setStatus('Loading SQL Server rows...');
    try {
      const response = await fetch(`${apiBase}/api/manual-readings`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || `HTTP ${response.status}`);
      }
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : (payload.data || []);
      renderRows(rows);
      setStatus(`Loaded ${rows.length} row${rows.length === 1 ? '' : 's'} from SQL Server.`, 'success');
    } catch (error) {
      console.error('Failed to load manual rows:', error);
      tableWrap.innerHTML = '<div style="padding:12px;color:#b42318;font-family:Rajdhani,sans-serif">Unable to fetch rows from SQL Server.</div>';
      setStatus(`Could not load SQL rows: ${error.message}`, 'error');
    }
  };

  refreshBtn.addEventListener('click', loadReadings);
  downloadBtn.addEventListener('click', async () => {
    try {
      const response = await fetch(`${apiBase}/api/download-excel`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'manual_reading.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus('Excel export downloaded.', 'success');
    } catch (error) {
      console.error('Failed to download excel:', error);
      setStatus('Unable to download the Excel export.', 'error');
    }
  });
  openBtn.addEventListener('click', async () => {
    try {
      const response = await fetch(`${apiBase}/api/open-excel`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus('Excel export requested on the server.', 'success');
    } catch (error) {
      console.error('Failed to open excel:', error);
      setStatus('Unable to open the Excel export on the server.', 'error');
    }
  });

  loadReadings();
});