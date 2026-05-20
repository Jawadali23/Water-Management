// ═══ LABEL/DATA GENERATORS ═══
function getLabels(id) {
  const { p, w, mo, yr } = getfs(id);
  if (p === 'daily') {
    return Array.from({ length: 24 }, (_, i) => {
      const h = i % 12 || 12;
      const ampm = i < 12 ? 'AM' : 'PM';
      return `${h} ${ampm}`;
    });
  }
  if (p === 'weekly') {
    const wk = parseInt(w) || 1;
    const start = (wk - 1) * 7 + 1;
    const yVal = yr ? parseInt(yr) : new Date().getFullYear();
    const mVal = mo ? parseInt(mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    const end = Math.min(start + 6, daysInMonth);
    const mStr = months[mVal - 1];
    const arr = [];
    for (let d = start; d <= end; d++) {
      const dayName = new Date(yVal, mVal - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
      arr.push(`${dayName} ${d < 10 ? '0' + d : d}`);
    }
    return arr;
  }
  if (p === 'monthly') { return months; }
  if (p === 'yearly') { return ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']; }
  return months;
}
function getSubLabel(id) {
  const { p, w, mo, yr } = getfs(id);
  const yStr = yr ? ' \u00b7 ' + yr : '';
  const mName = mo ? monthNames[parseInt(mo) - 1] : '';
  if (p === 'daily') return (mName ? mName + ' \u00b7 ' : '') + 'Today \u00b7 24 Hours' + yStr;
  if (p === 'weekly') {
    const wk = parseInt(w) || 1;
    const start = (wk - 1) * 7 + 1;
    const yVal = yr ? parseInt(yr) : new Date().getFullYear();
    const mVal = mo ? parseInt(mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    const end = Math.min(start + 6, daysInMonth);
    return (mName ? mName + ' \u00b7 ' : '') + `Week ${wk} (${mName} ${start < 10 ? '0' + start : start} \u2013 ${mName} ${end < 10 ? '0' + end : end})` + yStr;
  }
  if (p === 'monthly') return 'Monthly \u00b7 Jan\u2013Dec' + (yr ? ' ' + yr : ' 2023');
  if (p === 'yearly') return 'Yearly \u00b7 2023\u20132028';
  return '';
}
function getYF(yr) { if (!yr) return 1; const y = parseInt(yr); return isNaN(y) ? 1 : Math.max(0.5, 1 + (y - 2023) * 0.07); }
function genD(base, id) {
  const { p, w, mo, yr } = getfs(id);
  const factor = getYF(yr);
  const labels = getLabels(id);
  const n = labels.length;
  if (p === 'monthly') { return base.map(v => Math.round(v * factor)); }
  if (p === 'yearly') { const total = base.reduce((a, b) => a + b, 0) * factor; return [0, 1, 2, 3, 4, 5].map(i => Math.round(total / 6 * (0.75 + i * 0.065 + seed(i + base[0]) * 0.08))); }
  const total = base.reduce((a, b) => a + b, 0) * factor;
  const mScale = mo ? base[parseInt(mo) - 1] / Math.max(1, base.reduce((a, b) => a + b, 0) * 12) * 12 : 1;
  return Array.from({ length: n }, (_, i) => Math.round((total / 12 / n) * mScale * (0.65 + Math.sin(i / 3.2 + base[0] % 5) * 0.28 + seed(i + base[0]) * 0.28)));
}
function genRc(base, id) {
  const { p, mo, yr } = getfs(id);
  const factor = getYF(yr);
  const labels = getLabels(id);
  if (p === 'monthly') { return base.freshWaterTank.map((v, i) => v > 0 ? +(base.recycle[i] / v * 100 * factor).toFixed(1) : 0); }
  if (p === 'yearly') { return [0, 1, 2, 3, 4, 5].map(i => +(11 + i * 1.4 + seed(i + base.freshWaterTank[0]) * 2.5).toFixed(1)); }
  const moIdx = mo ? parseInt(mo) - 1 : cm;
  const rcPct = base.freshWaterTank[moIdx] > 0 ? (base.recycle[moIdx] / base.freshWaterTank[moIdx] * 100) : 12;
  return Array.from({ length: labels.length }, (_, i) => +(rcPct * (0.7 + Math.sin(i / 3) * 0.3 + seed(i + 5) * 0.35)).toFixed(1));
}

// ═══ BAR CHART RENDERER ═══
function renderBar(canvasId, id, baseData, meterKey, titleId, subId, legId) {
  const allK = ['freshWaterTank', 'withdraw', 'discharge'];
  const allL = ['Fresh Water Tank', 'Withdraw', 'Discharge'];
  const allC = ['#1558b0', '#7c3aed', '#f59e0b'];
  const keys = meterKey === 'all' ? allK : [meterKey];
  const labels = getLabels(id);
  if (document.getElementById(titleId)) document.getElementById(titleId).textContent = meterKey === 'all' ? 'Water Consumption Analysis' : (kpiMeta[meterKey]?.label || meterKey) + ' \u2013 Analysis';
  if (document.getElementById(subId)) document.getElementById(subId).innerHTML = getSubLabel(id);
  if (document.getElementById(legId)) document.getElementById(legId).innerHTML = keys.map(k => { const i = allK.indexOf(k); return `<div class="leg"><div class="leg-dot" style="background:${allC[i < 0 ? 0 : i]}"></div>${allL[i < 0 ? 0 : i]}</div>`; }).join('');
  dc(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { grid, tick } = gc();
  const datasets = keys.map(k => {
    const i = allK.indexOf(k);
    const c = allC[i < 0 ? 0 : i];
    const g = ctx.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, c + 'ee'); g.addColorStop(1, c + '44');
    return { label: allL[i < 0 ? 0 : i], data: genD(baseData[k], id), backgroundColor: g, borderColor: c, borderWidth: 1.5, borderRadius: 5, borderSkipped: false };
  });
  charts[canvasId] = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { ...TT, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${c.parsed.y.toLocaleString()} m\u00b3` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: grid }, beginAtZero: true, ticks: { color: tick, font: { size: 9.5 }, callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v }, border: { display: false } } } }, plugins: [{ id: 'bl', afterDatasetsDraw(chart) { const c3 = chart.ctx; chart.data.datasets.forEach((ds, di) => { const meta = chart.getDatasetMeta(di); if (meta.hidden) return; meta.data.forEach((bar, idx) => { const val = ds.data[idx]; if (!val) return; const bH = bar.base - bar.y; const txt = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : String(val); c3.save(); if (bH > 30) { c3.translate(bar.x, bar.y + bH / 2); c3.rotate(-Math.PI / 2); c3.font = `700 7.5px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'middle'; c3.fillStyle = 'rgba(255,255,255,0.93)'; c3.fillText(txt, 0, 0); } else if (bH > 14) { c3.font = `700 7px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'bottom'; c3.fillStyle = '#0c2461'; c3.fillText(txt, bar.x, bar.y - 2); } c3.restore(); }); }); } }] });
}
function renderBccChart() {
  const useApi = !!dpl1Api.mainChart;
  if (!useApi) { renderBar('bccChart', 'bcc', monthly, bccMeter, 'bcc-title', 'bcc-sub', 'bcc-leg'); return; }
  const payload = dpl1Api.mainChart;
  const allSeries = payload.series || [];
  const series = bccMeter === 'all' ? allSeries : allSeries.filter((s, i) => resolveMetricKey(s.label) === bccMeter || normalizeKey(s.label) === normalizeKey(bccMeter));
  let chosen = series.length ? series : allSeries;
  if (!chosen.length) { renderBar('bccChart', 'bcc', monthly, bccMeter, 'bcc-title', 'bcc-sub', 'bcc-leg'); return; }
  let labels = payload.labels && payload.labels.length ? payload.labels : getLabels('bcc');

  const fsSt = getfs('bcc');
  if (fsSt.p === 'weekly') {
    const wk = parseInt(fsSt.w) || 1;
    const startIdx = (wk - 1) * 7;
    const yVal = fsSt.yr ? parseInt(fsSt.yr) : new Date().getFullYear();
    const mVal = fsSt.mo ? parseInt(fsSt.mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    const sliceEnd = Math.min(startIdx + 7, daysInMonth);
    labels = getLabels('bcc');
    chosen = chosen.map(s => ({ ...s, data: s.data.slice(startIdx, sliceEnd) }));
  }
  if (document.getElementById('bcc-title')) document.getElementById('bcc-title').textContent = bccMeter === 'all' ? 'Water Consumption Analysis' : `${prettyMetricLabel(chosen[0].label)} - Analysis`;
  if (document.getElementById('bcc-sub')) document.getElementById('bcc-sub').innerHTML = getSubLabel('bcc');
  if (document.getElementById('bcc-leg')) document.getElementById('bcc-leg').innerHTML = chosen.map((s, i) => `<div class="leg"><div class="leg-dot" style="background:${seriesColor(s.label, i)}"></div>${prettyMetricLabel(s.label)}</div>`).join('');
  dc('bccChart');
  const canvas = document.getElementById('bccChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { grid, tick } = gc();
  const datasets = chosen.map((s, i) => {
    const c = seriesColor(s.label, i);
    const g = ctx.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, c + 'ee'); g.addColorStop(1, c + '44');
    return { label: prettyMetricLabel(s.label), data: s.data, backgroundColor: g, borderColor: c, borderWidth: 1.5, borderRadius: 5, borderSkipped: false };
  });
  charts['bccChart'] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 380 },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TT,
          callbacks: {
            title: i => '  ' + i[0].label,
            label: c => `  ${c.dataset.label}: ${Number(c.parsed.y).toFixed(2)} m\u00b3`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#8898aa',
            font: { size: 7.5 },
            maxRotation: 50,
            autoSkip: labels.length > 16
          },
          border: { display: false }
        },
        y: {
          grid: { color: grid },
          beginAtZero: true,
          ticks: {
            color: tick,
            font: { size: 9.5 },
            callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v
          },
          border: { display: false }
        }
      }
    },
    plugins: [{
      id: 'bl',
      afterDatasetsDraw(chart) {
        const c3 = chart.ctx;

        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);

          if (meta.hidden) return;

          meta.data.forEach((bar, idx) => {

            const val = ds.data[idx];

            if (val === null || val === undefined) return;

            const bH = bar.base - bar.y;

            const txt = val >= 1000
              ? (val / 1000).toFixed(1) + 'k'
              : Number(val).toFixed(2);

            c3.save();

            // INSIDE BAR
            if (bH > 30) {

              c3.translate(bar.x, bar.y + bH / 2);

              c3.rotate(-Math.PI / 2);

              c3.font = `700 11px 'IBM Plex Mono',monospace`;

              c3.textAlign = 'center';

              c3.textBaseline = 'middle';

              c3.fillStyle = 'rgba(255,255,255,0.93)';

              c3.fillText(txt, 0, 0);

            }

            // ABOVE SMALL BAR
            else if (bH > 14) {

              c3.font = `700 10px 'IBM Plex Mono',monospace`;

              c3.textAlign = 'center';

              c3.textBaseline = 'bottom';

              c3.fillStyle = '#0c2461';

              c3.fillText(txt, bar.x, bar.y - 2);

            }

            c3.restore();

          });
        });
      }
    }]
  });
}
function renderBccChart2() { renderBar('dpl2BccChart', 'bcc2', monthly2, bccMeter2, 'bcc2-title', 'bcc2-sub', 'bcc2-leg'); }
function renderBccChartU() { renderBar('urilBccChart', 'bccU', monthlyU, bccMeterU, 'bccU-title', 'bccU-sub', 'bccU-leg'); }
function setMeter(m, btn) { bccMeter = m; document.querySelectorAll('#view-dpl1 .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderBccChart(); }
function setMeter2(m, btn) { bccMeter2 = m; document.querySelectorAll('#view-dpl2 .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderBccChart2(); }
function setMeterU(m, btn) { bccMeterU = m; document.querySelectorAll('#view-uril .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderBccChartU(); }

// ═══ RECYCLE CHART ═══
function renderRcGen(canvasId, id, base, badgeId) {
  const labels = getLabels(id);
  const data = genRc(base, id);
  const badge = document.getElementById(badgeId); if (badge) badge.innerHTML = getSubLabel(id);
  dc(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ag = ctx.createLinearGradient(0, 0, 0, 230); ag.addColorStop(0, 'rgba(14,170,96,0.22)'); ag.addColorStop(1, 'rgba(14,170,96,0.0)');
  const { tick } = gc();
  charts[canvasId] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ type: 'bar', label: 'Volume', data, backgroundColor: 'rgba(14,170,96,0.2)', borderColor: 'rgba(14,170,96,0.48)', borderWidth: 1, borderRadius: 5, order: 2 }, { type: 'line', label: 'Recycle %', data, borderColor: '#0eaa60', borderWidth: 2.5, pointRadius: labels.length > 15 ? 0 : 4, pointHoverRadius: 7, pointBackgroundColor: '#fff', pointBorderColor: '#0eaa60', pointBorderWidth: 2, fill: true, backgroundColor: ag, tension: 0.42, order: 1 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(5,40,25,0.92)', titleColor: '#80e8b0', titleFont: { family: "'IBM Plex Mono',monospace", size: 11 }, bodyColor: '#c0f0d8', bodyFont: { family: "'IBM Plex Mono',monospace", size: 11 }, borderColor: 'rgba(14,170,96,0.28)', borderWidth: 1, padding: 9, cornerRadius: 7, callbacks: { title: i => '  ' + i[0].label, label: c => `  Recycle: ${c.parsed.y.toFixed(1)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: 'rgba(200,215,235,0.4)' }, beginAtZero: true, suggestedMax: 30, ticks: { color: tick, font: { size: 9.5 }, callback: v => v + '%' }, border: { display: false } } } } });
}
function renderRcChart() {
  const useApi = !!dpl1Api.recyclingChart;
  if (!useApi) { renderRcGen('rcChart', 'rc1', monthly, 'rc1-badge'); return; }
  const payload = dpl1Api.recyclingChart;
  const series = payload.series || [];
  let chosen = series.find(s => resolveMetricKey(s.label) === 'recycleRate') || series[0];
  if (!chosen || !Array.isArray(chosen.data) || !chosen.data.length) { renderRcGen('rcChart', 'rc1', monthly, 'rc1-badge'); return; }
  let labels = payload.labels && payload.labels.length ? payload.labels : getLabels('rc1');

  const fsSt = getfs('rc1');
  if (fsSt.p === 'weekly') {
    const wk = parseInt(fsSt.w) || 1;
    const startIdx = (wk - 1) * 7;
    const yVal = fsSt.yr ? parseInt(fsSt.yr) : new Date().getFullYear();
    const mVal = fsSt.mo ? parseInt(fsSt.mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    const sliceEnd = Math.min(startIdx + 7, daysInMonth);
    labels = getLabels('rc1');
    chosen = { ...chosen, data: chosen.data.slice(startIdx, sliceEnd) };
  }
  const badge = document.getElementById('rc1-badge'); if (badge) badge.innerHTML = getSubLabel('rc1');
  dc('rcChart');
  const canvas = document.getElementById('rcChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ag = ctx.createLinearGradient(0, 0, 0, 230); ag.addColorStop(0, 'rgba(14,170,96,0.22)'); ag.addColorStop(1, 'rgba(14,170,96,0.0)');
  const { tick } = gc();
  charts['rcChart'] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ type: 'bar', label: prettyMetricLabel(chosen.label), data: chosen.data, backgroundColor: 'rgba(14,170,96,0.2)', borderColor: 'rgba(14,170,96,0.48)', borderWidth: 1, borderRadius: 5, order: 2 }, { type: 'line', label: prettyMetricLabel(chosen.label), data: chosen.data, borderColor: '#0eaa60', borderWidth: 2.5, pointRadius: labels.length > 15 ? 0 : 4, pointHoverRadius: 7, pointBackgroundColor: '#fff', pointBorderColor: '#0eaa60', pointBorderWidth: 2, fill: true, backgroundColor: ag, tension: 0.42, order: 1 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(5,40,25,0.92)', titleColor: '#80e8b0', titleFont: { family: "'IBM Plex Mono',monospace", size: 11 }, bodyColor: '#c0f0d8', bodyFont: { family: "'IBM Plex Mono',monospace", size: 11 }, borderColor: 'rgba(14,170,96,0.28)', borderWidth: 1, padding: 9, cornerRadius: 7, callbacks: { title: i => '  ' + i[0].label, label: c => `  Recycle: ${Number(c.parsed.y).toFixed(1)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: 'rgba(200,215,235,0.4)' }, beginAtZero: true, suggestedMax: 30, ticks: { color: tick, font: { size: 9.5 }, callback: v => v + '%' }, border: { display: false } } } } });
}
function renderRcChart2() { renderRcGen('dpl2RcChart', 'rc2', monthly2, 'rc2-badge'); }
function renderRcChartU() { renderRcGen('urilRcChart', 'rcU', monthlyU, 'rcU-badge'); }

// ═══ FACTORY COMPARISON CHART ═══
function renderFactoryChart() {
  const labels = getLabels('fcc');
  const sub = document.getElementById('fcc-sub');
  if (sub) sub.innerHTML = getSubLabel('fcc') + (fccFactory === 'all' ? '' : ' \u00b7 ' + fccFactory.toUpperCase());
  const fColors = { dpl1: '#1558b0', dpl2: '#7c3aed', uril: '#0a9e8a' };
  const fNames = { dpl1: 'DPL 1', dpl2: 'DPL 2', uril: 'URIL' };
  const keys = fccFactory === 'all' ? ['dpl1', 'dpl2', 'uril'] : [fccFactory];
  let datasets = [];
  keys.forEach(k => {
    const c = fColors[k];
    const inData = genD(factoryData[k].monthly, 'fcc');
    const totalIn = factoryData[k].monthly.reduce((a, b) => a + b, 0);
    const totalOut = factoryData[k].out.reduce((a, b) => a + b, 0);
    const ratio = totalIn > 0 ? totalOut / totalIn : 0.1;
    const outData = inData.map((v, i) => Math.round(v * ratio * (0.85 + seed(i + k.length + 10) * 0.3)));
    datasets.push({ label: fNames[k] + ' IN', data: inData, backgroundColor: c + 'cc', borderColor: c, borderWidth: 1.5, borderRadius: 4, borderSkipped: false });
    datasets.push({ label: fNames[k] + ' OUT', data: outData, backgroundColor: c + '44', borderColor: c + '99', borderWidth: 1.5, borderRadius: 4, borderSkipped: false });
  });
  const leg = document.getElementById('fcc-legend');
  if (leg) leg.innerHTML = keys.map(k => `<div class="leg"><div class="leg-dot" style="background:${fColors[k]}"></div>${fNames[k]} IN</div><div class="leg"><div class="leg-dot" style="background:${fColors[k]}44;border:1px solid ${fColors[k]}88"></div>${fNames[k]} OUT</div>`).join('');
  dc('factoryChart');
  const canvas = document.getElementById('factoryChart'); if (!canvas) return;
  const { grid, tick } = gc();
  charts['factoryChart'] = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { ...TT, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${c.parsed.y.toLocaleString()} m\u00b3` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: grid }, beginAtZero: true, ticks: { color: tick, font: { size: 9.5 }, callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v }, border: { display: false } } } }, plugins: [{ id: 'fL', afterDatasetsDraw(chart) { const c3 = chart.ctx; chart.data.datasets.forEach((ds, di) => { const meta = chart.getDatasetMeta(di); if (meta.hidden) return; meta.data.forEach((bar, idx) => { const val = ds.data[idx]; if (!val) return; const bH = bar.base - bar.y; const txt = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : String(val); c3.save(); if (bH > 28) { c3.translate(bar.x, bar.y + bH / 2); c3.rotate(-Math.PI / 2); c3.font = `700 7px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'middle'; c3.fillStyle = 'rgba(255,255,255,0.92)'; c3.fillText(txt, 0, 0); } else if (bH > 14) { c3.font = `700 7px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'bottom'; c3.fillStyle = '#0c2461'; c3.fillText(txt, bar.x, bar.y - 2); } c3.restore(); }); }); } }] });
}
function setFccFactory(f, btn) { fccFactory = f; document.querySelectorAll('#fcc-factory-tabs .ttab').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderFactoryChart(); }

// ═══ OVERVIEW RECYCLE CHART ═══
function renderOvRcChart() {
  const labels = getLabels('ovrc');
  const badge = document.getElementById('ov-rc-badge');
  if (badge) badge.innerHTML = getSubLabel('ovrc');
  const cols = { dpl1: '#1558b0', dpl2: '#7c3aed', uril: '#0a9e8a' };
  const names = { dpl1: 'DPL 1', dpl2: 'DPL 2', uril: 'URIL' };
  const bases = { dpl1: monthly, dpl2: monthly2, uril: monthlyU };
  const keys = ovRcFactory === 'all' ? ['dpl1', 'dpl2', 'uril'] : [ovRcFactory];
  // share the ovrc filter state across factory subkeys
  const ovrcState = getfs('ovrc');
  const datasets = keys.map(k => {
    const c = cols[k];
    const tempId = 'ovrc_' + k;
    fs[tempId] = { ...ovrcState };
    const data = genRc(bases[k], tempId);
    return { label: names[k], data, backgroundColor: c + 'bb', borderColor: c, borderWidth: 1.5, borderRadius: 4, borderSkipped: false };
  });
  const leg = document.getElementById('ov-rc-leg');
  if (leg) leg.innerHTML = keys.map(k => `<div class="leg"><div class="leg-dot" style="background:${cols[k]}"></div>${names[k]}</div>`).join('');
  dc('ovRcChart');
  const canvas = document.getElementById('ovRcChart'); if (!canvas) return;
  const { grid, tick } = gc();
  charts['ovRcChart'] = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { ...TT, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: grid }, beginAtZero: true, suggestedMax: 25, ticks: { color: tick, font: { size: 9.5 }, callback: v => v + '%' }, border: { display: false } } } }, plugins: [{ id: 'rL', afterDatasetsDraw(chart) { const c3 = chart.ctx; chart.data.datasets.forEach((ds, di) => { const meta = chart.getDatasetMeta(di); if (meta.hidden) return; meta.data.forEach((bar, idx) => { const val = ds.data[idx]; if (!val) return; const bH = bar.base - bar.y; const txt = val.toFixed(1) + '%'; c3.save(); if (bH > 28) { c3.translate(bar.x, bar.y + bH / 2); c3.rotate(-Math.PI / 2); c3.font = `700 7px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'middle'; c3.fillStyle = 'rgba(255,255,255,0.92)'; c3.fillText(txt, 0, 0); } else if (bH > 14) { c3.font = `700 7px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'bottom'; c3.fillStyle = '#0c2461'; c3.fillText(txt, bar.x, bar.y - 2); } c3.restore(); }); }); } }] });
}
function setOvRcFactory(f, btn) { ovRcFactory = f; document.querySelectorAll('#ov-rc-factory-tabs .ttab').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderOvRcChart(); }

