// ═══ LABEL/DATA GENERATORS ═══
function getLabels(id) {
  const { p, w, mo, yr } = getfs(id);
  const isDpl1Chart = ['bcc', 'rc1', 'wr1'].includes(id);
  if (p === 'daily') {
    return Array.from({ length: 24 }, (_, i) => {
      const hour = (i + 8) % 24;
      const h = hour % 12 || 12;
      const ampm = hour < 12 ? 'AM' : 'PM';
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
  if (p === 'monthly') {
    const yVal = yr ? parseInt(yr) : new Date().getFullYear();
    const mVal = mo ? parseInt(mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
  }
  if (p === 'yearly' && isDpl1Chart) { return months; }
  if (p === 'yearly' || p === 'all') { return ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']; }
  return months;
}
function getSubLabel(id) {
  const { p, d, w, mo, yr } = getfs(id);
  const yStr = yr ? ' \u00b7 ' + yr : '';
  const mName = mo ? monthNames[parseInt(mo) - 1] : '';
  if (p === 'daily') return (mName ? mName + (d ? ' ' + d : '') + ' \u00b7 ' : '') + 'Daily \u00b7 8 AM\u20137 AM' + yStr;
  if (p === 'weekly') {
    const wk = parseInt(w) || 1;
    const start = (wk - 1) * 7 + 1;
    const yVal = yr ? parseInt(yr) : new Date().getFullYear();
    const mVal = mo ? parseInt(mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    const end = Math.min(start + 6, daysInMonth);
    return (mName ? mName + ' \u00b7 ' : '') + `Week ${wk} (${mName} ${start < 10 ? '0' + start : start} \u2013 ${mName} ${end < 10 ? '0' + end : end})` + yStr;
  }
  if (p === 'monthly') return 'Monthly \u00b7 ' + (mName || monthNames[new Date().getMonth()]) + ' 1\u2013' + getLabels(id).length + (yr ? ' ' + yr : '');
  if (p === 'yearly') return ['bcc', 'rc1', 'wr1'].includes(id) ? 'Yearly \u00b7 Jan\u2013Dec' + (yr ? ' ' + yr : '') : 'Yearly \u00b7 2019\u20132026';
  if (p === 'all') return 'All \u00b7 2019\u20132026';
  return '';
}
function getYF(yr) { if (!yr) return 1; const y = parseInt(yr); return isNaN(y) ? 1 : Math.max(0.5, 1 + (y - 2023) * 0.07); }
function genD(base, id) {
  const { p, w, mo, yr } = getfs(id);
  const factor = getYF(yr);
  const labels = getLabels(id);
  const n = labels.length;
  if (p === 'monthly') {
    const moIdx = mo ? parseInt(mo) - 1 : cm;
    const monthTotal = (base[moIdx] || base[cm] || base[0] || 0) * factor;
    return Array.from({ length: n }, (_, i) => Math.round((monthTotal / n) * (0.72 + Math.sin(i / 4 + base[0] % 7) * 0.18 + seed(i + base[0]) * 0.22)));
  }
  if (p === 'yearly' && ['bcc', 'rc1', 'wr1'].includes(id)) { return base.map(v => Math.round(v * factor)); }
  if (p === 'yearly' || p === 'all') { const total = base.reduce((a, b) => a + b, 0) * factor; return getLabels(id).map((_, i) => Math.round(total / 8 * (0.78 + i * 0.045 + seed(i + base[0]) * 0.08))); }
  const total = base.reduce((a, b) => a + b, 0) * factor;
  const mScale = mo ? base[parseInt(mo) - 1] / Math.max(1, base.reduce((a, b) => a + b, 0) * 12) * 12 : 1;
  return Array.from({ length: n }, (_, i) => Math.round((total / 12 / n) * mScale * (0.65 + Math.sin(i / 3.2 + base[0] % 5) * 0.28 + seed(i + base[0]) * 0.28)));
}
function genRc(base, id) {
  const { p, mo, yr } = getfs(id);
  const factor = getYF(yr);
  const labels = getLabels(id);
  if (p === 'monthly') {
    const moIdx = mo ? parseInt(mo) - 1 : cm;
    const rcPct = base.freshWaterTank[moIdx] > 0 ? (base.recycle[moIdx] / base.freshWaterTank[moIdx] * 100 * factor) : 12;
    return Array.from({ length: labels.length }, (_, i) => +(rcPct * (0.82 + Math.sin(i / 4) * 0.12 + seed(i + 5) * 0.18)).toFixed(1));
  }
  if (p === 'yearly' && ['bcc', 'rc1', 'wr1'].includes(id)) { return base.freshWaterTank.map((v, i) => v > 0 ? +(base.recycle[i] / v * 100 * factor).toFixed(1) : 0); }
  if (p === 'yearly' || p === 'all') { return getLabels(id).map((_, i) => +(11 + i * 1.05 + seed(i + base.freshWaterTank[0]) * 2.5).toFixed(1)); }
  const moIdx = mo ? parseInt(mo) - 1 : cm;
  const rcPct = base.freshWaterTank[moIdx] > 0 ? (base.recycle[moIdx] / base.freshWaterTank[moIdx] * 100) : 12;
  return Array.from({ length: labels.length }, (_, i) => +(rcPct * (0.7 + Math.sin(i / 3) * 0.3 + seed(i + 5) * 0.35)).toFixed(1));
}
function fitChartData(data, targetLength) {
  const source = Array.isArray(data) ? data.map(v => Number(v) || 0) : [];
  if (!targetLength) return [];
  if (!source.length) return Array.from({ length: targetLength }, () => 0);
  if (source.length === targetLength) return source;
  if (targetLength === 1) return [source[0]];
  return Array.from({ length: targetLength }, (_, i) => {
    const pos = i * (source.length - 1) / (targetLength - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(source.length - 1, Math.ceil(pos));
    const mix = pos - lo;
    return +(source[lo] + (source[hi] - source[lo]) * mix).toFixed(2);
  });
}

// ═══ BAR CHART RENDERER ═══
function makeTargetLine(label, value, labels, color) {
  return {
    type: 'line',
    label,
    data: labels.map(() => value),
    borderColor: color,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderDash: [10, 5],
    borderCapStyle: 'round',
    borderJoinStyle: 'round',
    pointStyle: 'rectRounded',
    pointRadius: labels.length > 18 ? 0 : 4,
    pointHoverRadius: 7,
    pointBackgroundColor: '#fff',
    pointBorderColor: color,
    pointBorderWidth: 2.4,
    fill: false,
    tension: 0,
    order: -10
  };
}

function dpl1ConsumptionTargets(keys, labels) {
  const targetMap = {
    withdraw: { label: 'Withdrawal Target', value: .036, color: '#38bdf8' },
    discharge: { label: 'Discharge Target', value: .035, color: '#fb923c' }
  };
  return keys.filter(k => targetMap[k]).map(k => makeTargetLine(targetMap[k].label, targetMap[k].value, labels, targetMap[k].color));
}

function targetCalloutPlugin() {
  return {
    id: 'targetCallouts',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, di) => {
        if (!String(ds.label || '').includes('Target')) return;
        const meta = chart.getDatasetMeta(di);
        const points = meta.data || [];
        const point = points[points.length - 1];
        if (!point) return;
        ctx.save();
        ctx.beginPath();
        points.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.setLineDash([12, 6]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,.92)';
        ctx.globalAlpha = 1;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = ds.borderColor;
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.restore();
        const text = ds.label.replace(' Target', '');
        ctx.save();
        ctx.font = "800 9px 'Inter',sans-serif";
        const w = ctx.measureText(text).width + 14;
        const h = 18;
        const x = Math.min(point.x + 8, chart.chartArea.right - w);
        const y = Math.max(chart.chartArea.top + 2, point.y - h / 2);
        ctx.fillStyle = 'rgba(255,255,255,.94)';
        ctx.strokeStyle = ds.borderColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 9);
        else ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ds.borderColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2 + .5);
        ctx.restore();
      });
    }
  };
}

function renderBar(canvasId, id, baseData, meterKey, titleId, subId, legId) {
  const isDpl1Bcc = canvasId === 'bccChart';
  const allK = isDpl1Bcc ? ['withdraw', 'discharge'] : ['freshWaterTank', 'withdraw', 'discharge'];
  const allL = isDpl1Bcc ? ['Withdrawal / Unit', 'Discharge / Unit'] : ['Fresh Water Tank', 'Withdraw', 'Discharge'];
  const allC = isDpl1Bcc ? ['#1558b0', '#f59e0b'] : ['#1558b0', '#7c3aed', '#f59e0b'];
  const keys = meterKey === 'all' ? allK : [meterKey];
  const labels = getLabels(id);
  if (document.getElementById(titleId)) document.getElementById(titleId).textContent = meterKey === 'all' ? 'Analysis' : (allL[allK.indexOf(meterKey)] || kpiMeta[meterKey]?.label || meterKey) + ' \u2013 Analysis';
  if (document.getElementById(subId)) document.getElementById(subId).innerHTML = getSubLabel(id);
  if (document.getElementById(legId)) document.getElementById(legId).innerHTML = keys.map(k => { const i = allK.indexOf(k); return `<div class="leg"><div class="leg-dot" style="background:${allC[i < 0 ? 0 : i]}"></div>${allL[i < 0 ? 0 : i]}</div>`; }).join('') + (isDpl1Bcc ? dpl1ConsumptionTargets(keys, labels).map(t => `<div class="leg"><div class="leg-line" style="background:${t.borderColor}"></div>${t.label}</div>`).join('') : '');
  dc(canvasId);
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { grid, tick } = gc();
  const datasets = keys.map(k => {
    const i = allK.indexOf(k);
    const c = allC[i < 0 ? 0 : i];
    const g = ctx.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, c + 'ee'); g.addColorStop(1, c + '44');
    const metricData = k === 'recycleRate' ? genRc(baseData, id) : genD(baseData[k], id);
    const withdrawalData = isDpl1Bcc ? genD(baseData.withdraw, id) : [];
    const rawData = isDpl1Bcc
      ? metricData.map((v, idx) => +(v / Math.max(1, Number(withdrawalData[idx] || 0) * 82)).toFixed(3))
      : metricData;
    return { label: allL[i < 0 ? 0 : i], data: rawData, backgroundColor: g, borderColor: c, borderWidth: 1.5, borderRadius: 5, borderSkipped: false };
  });
  charts[canvasId] = new Chart(canvas, { type: 'bar', data: { labels, datasets: isDpl1Bcc ? datasets.concat(dpl1ConsumptionTargets(keys, labels)) : datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { ...TT, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${Number(c.parsed.y).toFixed(c.dataset.label.includes('Rate') ? 1 : 2)}${c.dataset.label.includes('Rate') ? '%' : ' m\\u00b3/Unit'}` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 8.5, weight: '700' }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: grid }, beginAtZero: true, ticks: { color: tick, font: { size: 10.5, weight: '700' }, callback: v => isDpl1Bcc ? v : (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) }, border: { display: false } } } }, plugins: [{ id: 'bl', afterDatasetsDraw(chart) { const c3 = chart.ctx; chart.data.datasets.forEach((ds, di) => { if (ds.type === 'line') return; const meta = chart.getDatasetMeta(di); if (meta.hidden) return; meta.data.forEach((bar, idx) => { const val = ds.data[idx]; if (!val) return; const bH = bar.base - bar.y; const txt = ds.label.includes('Rate') ? Number(val).toFixed(1) + '%' : Number(val).toFixed(isDpl1Bcc ? 2 : 0); c3.save(); if (bH > 30) { c3.translate(bar.x, bar.y + bH / 2); c3.rotate(-Math.PI / 2); c3.font = `900 10px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'middle'; c3.fillStyle = 'rgba(255,255,255,0.96)'; c3.fillText(txt, 0, 0); } else if (bH > 10) { c3.font = `900 9px 'IBM Plex Mono',monospace`; c3.textAlign = 'center'; c3.textBaseline = 'bottom'; c3.fillStyle = '#0c2461'; c3.fillText(txt, bar.x, bar.y - 2); } c3.restore(); }); }); } }, targetCalloutPlugin()] });
}
function renderBccChart() {
  if (bccMeter === 'recycleRate') bccMeter = 'all';
  const useApi = !!dpl1Api.mainChart;
  if (!useApi) { renderBar('bccChart', 'bcc', monthly, bccMeter, 'bcc-title', 'bcc-sub', 'bcc-leg'); return; }
  const payload = dpl1Api.mainChart;
  const allSeries = payload.series || [];
  const allowed = ['withdraw', 'discharge'];
  const withdrawalSeries = allSeries.find(s => resolveMetricKey(s.label) === 'withdraw');
  const sourceSeries = allSeries
    .filter(s => allowed.includes(resolveMetricKey(s.label)))
    .map(s => ({
      ...s,
      label: resolveMetricKey(s.label) === 'withdraw' ? 'Withdrawal / Unit' : 'Discharge / Unit',
      data: s.data.map((v, idx) => +(Number(v || 0) / Math.max(1, Number(withdrawalSeries?.data?.[idx] || 0) * 82)).toFixed(3))
    }));
  const series = bccMeter === 'all' ? sourceSeries : sourceSeries.filter((s) => resolveMetricKey(s.label) === bccMeter || normalizeKey(s.label) === normalizeKey(bccMeter));
  let chosen = series.length ? series : allSeries;
  if (!chosen.length || chosen === allSeries) { renderBar('bccChart', 'bcc', monthly, bccMeter, 'bcc-title', 'bcc-sub', 'bcc-leg'); return; }
  let labels = getLabels('bcc');

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
  chosen = chosen.map(s => ({ ...s, data: fitChartData(s.data, labels.length) }));
  if (document.getElementById('bcc-title')) document.getElementById('bcc-title').textContent = bccMeter === 'all' ? 'Analysis' : `${prettyMetricLabel(chosen[0].label)} - Analysis`;
  if (document.getElementById('bcc-sub')) document.getElementById('bcc-sub').innerHTML = getSubLabel('bcc');
  const targetKeys = chosen.map(s => resolveMetricKey(s.label));
  const targetLines = dpl1ConsumptionTargets(targetKeys, labels);
  if (document.getElementById('bcc-leg')) document.getElementById('bcc-leg').innerHTML = chosen.map((s, i) => `<div class="leg"><div class="leg-dot" style="background:${seriesColor(s.label, i)}"></div>${prettyMetricLabel(s.label)}</div>`).join('') + targetLines.map(t => `<div class="leg"><div class="leg-line" style="background:${t.borderColor}"></div>${t.label}</div>`).join('');
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
    data: { labels, datasets: datasets.concat(targetLines) },
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
            label: c => `  ${c.dataset.label}: ${Number(c.parsed.y).toFixed(c.dataset.label.includes('Rate') ? 1 : 2)}${c.dataset.label.includes('Rate') ? '%' : ' m\\u00b3/Unit'}`
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
          if (ds.type === 'line') return;
          const meta = chart.getDatasetMeta(di);

          if (meta.hidden) return;

          meta.data.forEach((bar, idx) => {

            const val = ds.data[idx];

            if (val === null || val === undefined) return;

            const bH = bar.base - bar.y;

            const txt = val >= 1000
              ? (val / 1000).toFixed(1) + 'k'
              : (ds.label.includes('Rate') ? Number(val).toFixed(1) + '%' : Number(val).toFixed(2));

            c3.save();

            // INSIDE BAR
            if (bH > 30) {

              c3.translate(bar.x, bar.y + bH / 2);

              c3.rotate(-Math.PI / 2);

              c3.font = `900 12px 'IBM Plex Mono',monospace`;

              c3.textAlign = 'center';

              c3.textBaseline = 'middle';

              c3.fillStyle = 'rgba(255,255,255,0.93)';

              c3.fillText(txt, 0, 0);

            }

            // ABOVE SMALL BAR
            else if (bH > 14) {

              c3.font = `900 11px 'IBM Plex Mono',monospace`;

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
function setMeter(m, btn) { bccMeter = m; document.querySelectorAll('#view-dpl1 .dpl1-water-section .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderBccChart(); }
function setMeter2(m, btn) { bccMeter2 = m; document.querySelectorAll('#view-dpl2 .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderBccChart2(); }
function setMeterU(m, btn) { bccMeterU = m; document.querySelectorAll('#view-uril .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderBccChartU(); }
function setWaterRecycleMode(mode, btn) { wrMode = mode || 'all'; document.querySelectorAll('#view-dpl1 .dpl1-wr-selectors .mbtn').forEach(b => b.classList.remove('active')); if (btn) btn.classList.add('active'); renderWaterRecycleChart(); }

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
  charts[canvasId] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ type: 'bar', label: 'Volume', data, backgroundColor: 'rgba(14,170,96,0.2)', borderColor: 'rgba(14,170,96,0.48)', borderWidth: 1, borderRadius: 5, order: 2 }, { type: 'line', label: 'Recycle %', data, borderColor: '#0eaa60', borderWidth: 2.5, pointRadius: labels.length > 15 ? 0 : 4, pointHoverRadius: 7, pointBackgroundColor: '#fff', pointBorderColor: '#0eaa60', pointBorderWidth: 2, fill: true, backgroundColor: ag, tension: 0.42, order: 1 }, makeTargetLine('Recycle Target', 41, labels, '#22c55e')] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(5,40,25,0.92)', titleColor: '#80e8b0', titleFont: { family: "'IBM Plex Mono',monospace", size: 11 }, bodyColor: '#c0f0d8', bodyFont: { family: "'IBM Plex Mono',monospace", size: 11 }, borderColor: 'rgba(14,170,96,0.28)', borderWidth: 1, padding: 9, cornerRadius: 7, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${Number(c.parsed.y).toFixed(1)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: 'rgba(200,215,235,0.4)' }, beginAtZero: true, suggestedMax: 45, ticks: { color: tick, font: { size: 9.5 }, callback: v => v + '%' }, border: { display: false } } } }, plugins: [targetCalloutPlugin()] });
}
function renderRcChart() {
  const useApi = !!dpl1Api.recyclingChart;
  if (!useApi) { renderRcGen('rcChart', 'rc1', monthly, 'rc1-badge'); return; }
  const payload = dpl1Api.recyclingChart;
  const series = payload.series || [];
  let chosen = series.find(s => resolveMetricKey(s.label) === 'recycleRate') || series[0];
  if (!chosen || !Array.isArray(chosen.data) || !chosen.data.length) { renderRcGen('rcChart', 'rc1', monthly, 'rc1-badge'); return; }
  let labels = getLabels('rc1');

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
  chosen = { ...chosen, data: fitChartData(chosen.data, labels.length) };
  const badge = document.getElementById('rc1-badge'); if (badge) badge.innerHTML = getSubLabel('rc1');
  dc('rcChart');
  const canvas = document.getElementById('rcChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const ag = ctx.createLinearGradient(0, 0, 0, 230); ag.addColorStop(0, 'rgba(14,170,96,0.22)'); ag.addColorStop(1, 'rgba(14,170,96,0.0)');
  const { tick } = gc();
  charts['rcChart'] = new Chart(canvas, { type: 'bar', data: { labels, datasets: [{ type: 'bar', label: prettyMetricLabel(chosen.label), data: chosen.data, backgroundColor: 'rgba(14,170,96,0.2)', borderColor: 'rgba(14,170,96,0.48)', borderWidth: 1, borderRadius: 5, order: 2 }, { type: 'line', label: prettyMetricLabel(chosen.label), data: chosen.data, borderColor: '#0eaa60', borderWidth: 2.5, pointRadius: labels.length > 15 ? 0 : 4, pointHoverRadius: 7, pointBackgroundColor: '#fff', pointBorderColor: '#0eaa60', pointBorderWidth: 2, fill: true, backgroundColor: ag, tension: 0.42, order: 1 }, makeTargetLine('Recycle Target', 41, labels, '#22c55e')] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, animation: { duration: 380 }, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(5,40,25,0.92)', titleColor: '#80e8b0', titleFont: { family: "'IBM Plex Mono',monospace", size: 11 }, bodyColor: '#c0f0d8', bodyFont: { family: "'IBM Plex Mono',monospace", size: 11 }, borderColor: 'rgba(14,170,96,0.28)', borderWidth: 1, padding: 9, cornerRadius: 7, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${Number(c.parsed.y).toFixed(1)}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8898aa', font: { size: 7.5 }, maxRotation: 50, autoSkip: labels.length > 16 }, border: { display: false } }, y: { grid: { color: 'rgba(200,215,235,0.4)' }, beginAtZero: true, suggestedMax: 45, ticks: { color: tick, font: { size: 9.5 }, callback: v => v + '%' }, border: { display: false } } } }, plugins: [targetCalloutPlugin()] });
}
function renderRcChart2() { renderRcGen('dpl2RcChart', 'rc2', monthly2, 'rc2-badge'); }
function renderRcChartU() { renderRcGen('urilRcChart', 'rcU', monthlyU, 'rcU-badge'); }

// ═══ FACTORY COMPARISON CHART ═══
function renderWaterRecycleChart() {
  const labels = getLabels('wr1');
  const targetValue = 41;
  const processValue = 19.0;
  const domesticValue = 23.4;
  const process = labels.map(() => processValue);
  const domestic = labels.map(() => domesticValue);
  const badge = document.getElementById('wr1-badge');
  if (badge) badge.innerHTML = getSubLabel('wr1');

  const leg = document.getElementById('wr1-leg');
  if (leg) {
    leg.innerHTML = '<div class="leg"><div class="leg-dot" style="background:#10b981"></div>Target</div>' +
      '<div class="leg"><div class="leg-dot" style="background:#1558b0"></div>Domestic</div>' +
      '<div class="leg"><div class="leg-dot" style="background:#f97316"></div>Process</div>';
  }

  dc('wrChart');
  const canvas = document.getElementById('wrChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { grid, tick } = gc();
  const targetGrad = ctx.createLinearGradient(0, 0, 0, 260);
  targetGrad.addColorStop(0, '#10b981');
  targetGrad.addColorStop(1, '#07a857');
  const processGrad = ctx.createLinearGradient(0, 0, 0, 260);
  processGrad.addColorStop(0, '#fb923c');
  processGrad.addColorStop(1, '#ea580c');
  const domesticGrad = ctx.createLinearGradient(0, 0, 0, 260);
  domesticGrad.addColorStop(0, '#38bdf8');
  domesticGrad.addColorStop(1, '#1558b0');
  const barSize = labels.length > 20 ? 15 : labels.length > 14 ? 18 : labels.length > 8 ? 23 : 30;
  const maxBar = labels.length > 20 ? 17 : labels.length > 14 ? 20 : labels.length > 8 ? 26 : 32;
  const categoryPct = labels.length > 20 ? .86 : .78;
  const barPct = labels.length > 20 ? .82 : .9;
  const datasets = [
    { label: 'Target', data: labels.map(() => targetValue), backgroundColor: targetGrad, borderColor: '#059669', borderWidth: 1.5, borderRadius: 9, borderSkipped: false, stack: 'target', barThickness: barSize, maxBarThickness: maxBar, categoryPercentage: categoryPct, barPercentage: barPct },
    { label: 'Domestic', data: domestic, backgroundColor: domesticGrad, borderColor: '#0f3f8a', borderWidth: 1.2, borderRadius: { topLeft: 9, topRight: 9, bottomLeft: 0, bottomRight: 0 }, borderSkipped: false, stack: 'breakdown', order: 2, barThickness: barSize, maxBarThickness: maxBar, categoryPercentage: categoryPct, barPercentage: barPct },
    { label: 'Process', data: process, backgroundColor: processGrad, borderColor: '#c2410c', borderWidth: 1.2, borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 9, bottomRight: 9 }, borderSkipped: false, stack: 'breakdown', order: 2, barThickness: barSize, maxBarThickness: maxBar, categoryPercentage: categoryPct, barPercentage: barPct }
  ];

  charts['wrChart'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 380 },
      layout: { padding: { top: 12, right: 8, bottom: 2, left: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: { ...TT, callbacks: { title: i => '  ' + i[0].label, label: c => `  ${c.dataset.label}: ${Number(c.parsed.y).toFixed(1)}%` } }
      },
      scales: {
        x: { stacked: true, offset: true, grid: { display: false }, ticks: { color: '#334155', font: { size: labels.length > 20 ? 8.5 : 11, weight: '900' }, maxRotation: labels.length > 12 ? 45 : labels.length > 8 ? 30 : 0, autoSkip: labels.length > 28 }, border: { display: false } },
        y: { stacked: true, grid: { color: 'rgba(100,116,139,.18)', lineWidth: 1 }, beginAtZero: true, suggestedMax: 52, ticks: { color: '#334155', font: { size: 11, weight: '800' }, callback: v => v + '%' }, border: { display: false } }
      }
    },
    plugins: [{
      id: 'wrPercentLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden) return;
          meta.data.forEach((bar, idx) => {
            const val = ds.data[idx];
            if (val == null || val <= 0) return;
            const h = Math.abs(bar.base - bar.y);
            if (h < 10 && ds.label === 'Target') return;
            ctx.save();
            ctx.font = `900 ${labels.length > 20 ? 11 : 13}px 'Inter',sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const valueText = Number(val).toFixed(ds.label === 'Target' ? 0 : 1) + '%';
            const text = valueText;
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(15,23,42,.48)';
            ctx.shadowBlur = 5;
            const midY = bar.y + h / 2;
            if (chart.data.labels.length <= 24 || ds.label === 'Target' || ds.label === 'Domestic' || ds.label === 'Process') {
              ctx.translate(bar.x, midY);
              ctx.rotate(-Math.PI / 2);
              ctx.fillText(text, 0, 0);
            }
            ctx.restore();
          });
        });
      }
    }]
  });
}

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

