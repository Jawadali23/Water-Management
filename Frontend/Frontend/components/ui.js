// DATE SELECTOR LOGIC
async function handleDS(id) {
  const p = document.getElementById(id + '-period')?.value || 'daily';
  const w = document.getElementById(id + '-week')?.value || '';
  const mo = document.getElementById(id + '-month')?.value || '';
  const yr = document.getElementById(id + '-year')?.value || '';

  const dSel = document.getElementById(id + '-day');
  if (dSel) {
    const currentD = dSel.value;
    const yVal = yr ? parseInt(yr) : new Date().getFullYear();
    const mVal = mo ? parseInt(mo) : new Date().getMonth() + 1;
    const daysInMonth = new Date(yVal, mVal, 0).getDate();
    let options = '<option value="">Day</option>';
    for (let i = 1; i <= daysInMonth; i++) options += `<option value="${i}">${i}</option>`;
    dSel.innerHTML = options;
    if (currentD && currentD <= daysInMonth) dSel.value = currentD;
  }
  const d = dSel?.value || '';
  fs[id] = { p, d, w, mo, yr };

  const wSel = document.getElementById(id + '-week');
  const mSel = document.getElementById(id + '-month');
  if (wSel) {
    wSel.disabled = (p !== 'weekly');
    wSel.style.display = p === 'weekly' ? '' : 'none';
    if (p === 'weekly') {
      const yVal = yr ? parseInt(yr) : new Date().getFullYear();
      const mVal = mo ? parseInt(mo) : new Date().getMonth() + 1;
      const mName = months[mVal - 1];
      const daysInMonth = new Date(yVal, mVal, 0).getDate();
      for (let i = 1; i <= 5; i++) {
        const start = (i - 1) * 7 + 1;
        const end = Math.min(start + 6, daysInMonth);
        if (wSel.options[i]) wSel.options[i].text = start <= daysInMonth ? `Week ${i} (${mName} ${start}-${end})` : `Week ${i}`;
      }
    }
  }
  if (mSel) {
    mSel.disabled = (p === 'yearly' || p === 'all');
    mSel.style.display = (p === 'yearly' || p === 'all') ? 'none' : '';
  }
  if (dSel) {
    dSel.disabled = (p !== 'daily');
    dSel.style.display = p === 'daily' ? '' : 'none';
  }

  if (id === 'bcc' || id === 'rc1') {
    if (typeof dpl1Api !== 'undefined') {
      dpl1Api.loadingKey = null;
      await loadDpl1ApiData();
    }
  }

  const map = { bcc: renderBccChart, rc1: renderRcChart, wr1: renderWaterRecycleChart, bcc2: renderBccChart2, rc2: renderRcChart2, bccU: renderBccChartU, rcU: renderRcChartU, fcc: renderFactoryChart, ovrc: renderOvRcChart };
  if (map[id]) map[id]();
}

// KPI CARDS
function sparkline(arr, color) {
  const max = Math.max(...arr), min = Math.min(...arr);
  const pts = arr.map((v, i) => `${i * (100 / (arr.length - 1))},${22 - ((v - min) / (max - min || 1)) * 18}`).join(' ');
  return `<div class="kpi-spark"><svg viewBox="0 0 100 24" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
}
function scaleArr(arr) {
  let m = activePeriod === 'td' ? .18 : activePeriod === 'mtd' ? frac : 1;
  if (globalFilter.from && globalFilter.to) {
    const d = Math.max(1, (new Date(globalFilter.to) - new Date(globalFilter.from)) / 86400000 + 1);
    m = Math.min(1, d / 365);
  }
  return arr.map(v => Math.max(0, Math.round(v * m)));
}
function getVal(arr) {
  if (globalFilter.from && globalFilter.to) return scaleArr(arr).reduce((s, v) => s + v, 0);
  if (activePeriod === 'ytd') return arr.reduce((s, v) => s + v, 0);
  if (activePeriod === 'mtd') return Math.round(arr[cm] * frac);
  return Math.round(arr[cm] * .18);
}
function makeRcCard(fwtArr, rcArr) {
  const pct = getVal(fwtArr) > 0 ? getVal(rcArr) / getVal(fwtArr) * 100 : 0;
  const cf = fwtArr[cm], cr = rcArr[cm], pf = fwtArr[Math.max(cm - 1, 0)], pr = rcArr[Math.max(cm - 1, 0)];
  const dp = (cf > 0 ? cr / cf * 100 : 0) - (pf > 0 ? pr / pf * 100 : 0);
  const tc = dp > 0 ? 'up' : dp < 0 ? 'dn' : 'neu';
  const ts = dp > 0 ? `&#9650; +${Math.abs(dp).toFixed(1)}` : dp < 0 ? `&#9660; ${Math.abs(dp).toFixed(1)}` : '&ndash;';
  const pd = { td: 'Till Today', mtd: 'MTD', ytd: 'YTD' };
  return `<div class="kpi-card" style="--kline:#34d399"><div class="kpi-top"><div class="kpi-icon">&#128202;</div><span class="kpi-badge">Rate</span></div><div class="kpi-lbl">Recycle Rate</div><div class="kpi-val">${pct.toFixed(1)}<span class="kpi-unit">%</span></div><div class="kpi-sep"></div><div class="kpi-foot"><span class="kpi-trend ${tc}">${ts}</span><span class="kpi-period">${pd[activePeriod]}</span></div></div>`;
}
function renderKPIsFor(elId, arr) {
  const el = document.getElementById(elId); if (!el) return;
  const pd = { td: 'Till Today', mtd: 'MTD', ytd: 'YTD' };
  el.innerHTML = ['freshWaterTank', 'withdraw', 'recycle', 'discharge'].map(k => {
    const m = kpiMeta[k], v = getVal(arr[k]);
    const curr = arr[k][cm], prev = arr[k][Math.max(cm - 1, 0)], diff = curr - prev;
    const tc = diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu';
    const ts = diff > 0 ? `&#9650; +${fmt(diff)}` : diff < 0 ? `&#9660; ${fmt(Math.abs(diff))}` : '&ndash;';
    const valueUnit = k === 'recycle' ? '%' : 'm&#179;';
    const _c = `<div class="kpi-card" style="--kline:${m.line}"><div class="kpi-top"><div class="kpi-icon">${m.icon}</div><span class="kpi-badge">${m.tag}</span></div><div class="kpi-lbl">${m.label}</div><div class="kpi-val">${fmt(v)}<span class="kpi-unit">${valueUnit}</span></div>${sparkline(arr[k], m.line)}<div class="kpi-sep"></div><div class="kpi-foot"><span class="kpi-trend ${tc}">${ts}</span><span class="kpi-period">${pd[activePeriod]}</span></div></div>`;
    return k === 'recycle' ? _c + makeRcCard(arr.freshWaterTank, arr.recycle) : _c;
  }).join('');
}
function renderKPIs() { renderDpl1Cards(); }
function renderKPIs2() { renderKPIsFor('dpl2-kpi', monthly2); }
function renderKPIsU() { renderKPIsFor('uril-kpi', monthlyU); }

function renderOverview() {
  const periodLabel = { td: 'Till Today', mtd: 'MTD', ytd: 'YTD' }[activePeriod] || 'Till Today';
  const plants = [
    { key: 'uril', name: 'URIL', data: monthlyU, color: '#38b6ff', targets: { withdraw: .063, recycle: 34, discharge: .025 }, productionFactor: 20, homesFactor: 11 },
    { key: 'dpl1', name: 'DPL 1', data: monthly, color: '#38b6ff', targets: { withdraw: .036, recycle: 41, discharge: .035 }, productionFactor: 25, homesFactor: 14 },
    { key: 'dpl2', name: 'DPL 2', data: monthly2, color: '#38b6ff', targets: { withdraw: .022, recycle: 27, discharge: .003 }, productionFactor: 50, homesFactor: 18 }
  ];
  const grid = document.querySelector('#view-overview .overview-factory-grid');
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V10l5 3V9l5 4V7l4 3v11"/><path d="M9 21v-4h6v4"/><path d="M7 15h.01M12 15h.01M17 15h.01"/></svg>';
  const metricIcons = {
    withdraw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8S6.2 9 6.2 13.6a5.8 5.8 0 0 0 11.6 0C17.8 9 12 2.8 12 2.8z"/><path d="M9.4 14.2c.8 1.6 2.4 2.3 4.1 1.8"/></svg>',
    recycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7.5A6.5 6.5 0 0 1 18.2 10"/><path d="m18.5 5.6-.3 4.4-4.2-.9"/><path d="M17 16.5A6.5 6.5 0 0 1 5.8 14"/><path d="m5.5 18.4.3-4.4 4.2.9"/></svg>',
    discharge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11a3 3 0 0 1 3 3v1"/><path d="M4 11h9a3 3 0 0 1 3 3v1"/><path d="M18 14v6"/><path d="m15 17 3 3 3-3"/><path d="M4 15h7"/></svg>',
    saving: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8S6.2 9 6.2 13.8a5.8 5.8 0 0 0 11.6 0C17.8 9 12 2.8 12 2.8z"/><path d="m9.3 14.1 1.8 1.8 3.9-4.4"/><path d="M4 20h16"/></svg>'
  };
  const trendMarkup = (isGood, isAboveTarget) => {
    const dir = isAboveTarget ? 'up' : 'down';
    const cls = isGood ? 'good' : 'bad';
    return '<span class="overview-target-trend ' + cls + ' ' + dir + '"><span></span></span>';
  };
  const metricCard = (type, label, value, unit, compareTarget) => {
    const threshold = Number(compareTarget);
    const isAboveTarget = value > threshold;
    const isGood = type === 'recycle' ? value >= threshold : value <= threshold;
    const decimals = unit === '%' ? 1 : 3;
    const targetText = unit === '%' ? threshold.toFixed(0) + '%' : threshold.toFixed(3);
    const hasInlineUnit = type === 'withdraw' || type === 'discharge';
    const titleMarkup = '<span>' + label + '</span>';
    const unitChip = (hasInlineUnit || type === 'recycle') ? '' : '<div class="overview-unit-chip">Unit <strong>' + unit + '</strong></div>';
    const valueUnit = !unit ? '' : '<small>' + unit + '</small>';
    return '<div class="overview-metric-card metric-' + type + '">' +
      '<div class="overview-metric-head"><span class="overview-metric-icon">' + metricIcons[type] + '</span>' + titleMarkup +
      '<span class="overview-target-badge">Target <strong>' + targetText + '</strong></span></div>' +
      unitChip +
      '<div class="overview-value-block"><div class="overview-value-line">' + trendMarkup(isGood, isAboveTarget) +
      '<div class="overview-metric-value" data-state="' + (isGood ? 'good' : 'bad') + '">' + value.toFixed(decimals) + valueUnit + '</div></div></div>' +
    '</div>';
  };

  if (grid) {
    grid.innerHTML = plants.map(({ key, name, data, color, targets, productionFactor }) => {
      const withdrawTotal = Math.max(1, getVal(data.withdraw));
      const production = Math.max(1, withdrawTotal * productionFactor);
      const withdraw = withdrawTotal / production;
      const recycle = getVal(data.recycle) / withdrawTotal * 100;
      const discharge = getVal(data.discharge) / production;
      return '<article class="overview-factory-card plant-' + key + ' is-clickable" style="--fc:' + color + '" role="button" tabindex="0" data-target-view="' + key + '">' +
        '<div class="overview-factory-top"><div class="overview-factory-icon" aria-hidden="true">' + icon + '</div>' +
        '<div><div class="overview-factory-name">' + name + '</div><div class="overview-factory-meta">' + periodLabel + '</div></div></div>' +
        '<div class="overview-mini-grid">' +
          metricCard('withdraw', 'Withdrawal per Unit', withdraw, 'm&#179;/Unit', targets.withdraw) +
          metricCard('recycle', 'Recycle Rate', recycle, '%', targets.recycle) +
          metricCard('discharge', 'Discharge per Unit', discharge, 'm&#179;/Unit', targets.discharge) +
        '</div></article>';
    }).join('');
  }

  var savingRow = document.querySelector('#view-overview .overview-saving-grid');
  if (!savingRow && grid) {
    savingRow = document.createElement('div');
    savingRow.className = 'overview-saving-grid';
    grid.insertAdjacentElement('afterend', savingRow);
  }
  if (savingRow) {
    savingRow.innerHTML = plants.map(({ key, name, data, color, homesFactor }) => {
      const saving = Math.max(0, getVal(data.recycle));
      const savePct = Math.min(100, Math.max(18, Math.round((saving / Math.max(1, getVal(data.withdraw))) * 100)));
      const savingValue = fmt(saving);
      const households = Math.round(saving / homesFactor);
      const householdValue = households > 0 ? households : 0;
      const householdLabel = householdValue === 1 ? 'household' : 'households';
      return '<article class="overview-saving-card saving-' + key + '" style="--fc:' + color + '">' +
        '<div class="overview-saving-icon">' + metricIcons.saving + '</div>' +
        '<div class="overview-saving-content"><div class="overview-saving-title">' + name + ' Water Saving</div>' +
        '<div class="overview-saving-value">' + savingValue + '<small>m&#179;</small></div>' +
        '<div class="overview-saving-sub overview-saving-equivalent"><strong>Equivalent to annual consumption</strong><span>' + householdValue + ' ' + householdLabel + '</span></div>' +
        '<div class="overview-saving-track"><span style="width:' + savePct + '%"></span></div></div></article>';
    }).join('');
  }

  setTimeout(function () {
    document.querySelectorAll('#view-overview .overview-metric-card').forEach(function (card) { card.classList.add('is-evaluated'); });
  }, 420);

  document.querySelectorAll('.overview-factory-card[data-target-view]').forEach(card => {
    card.onclick = function () {
      const target = card.getAttribute('data-target-view');
      if (target) switchView(target, document.getElementById('nav-' + target));
    };
    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const target = card.getAttribute('data-target-view');
      if (target) switchView(target, document.getElementById('nav-' + target));
    });
  });
}

function updateOverviewCards(p) {
  const pLabel = { td: 'Till Today', mtd: 'Month to Date', ytd: 'Year to Date' };
  const maxIn = { dpl1: 9688, dpl2: 8420, uril: 3240 };
  function getV(arr) { if (p === 'ytd') return arr.reduce((a, b) => a + b, 0); if (p === 'mtd') return Math.round(arr[cm] * frac); return Math.round(arr[arr.length - 1] * .18); }
  [{ k: 'dpl1', inArr: factoryData.dpl1.monthly, outArr: factoryData.dpl1.out }, { k: 'dpl2', inArr: factoryData.dpl2.monthly, outArr: factoryData.dpl2.out }, { k: 'uril', inArr: factoryData.uril.monthly, outArr: factoryData.uril.out }].forEach(({ k, inArr, outArr }) => {
    const inV = getV(inArr), outV = getV(outArr);
    const el = id => document.getElementById(id);
    if (el('fvn-' + k)) el('fvn-' + k).textContent = fmt(inV);
    if (el('fin-' + k)) el('fin-' + k).textContent = fmt(inV);
    if (el('fout-' + k)) el('fout-' + k).textContent = fmt(outV);
    if (el('fl-' + k)) el('fl-' + k).textContent = pLabel[p] + ' · Water Usage';
    const inPct = Math.min(Math.round(inV / maxIn[k] * 100), 100);
    const outPct = inV > 0 ? Math.min(Math.round(outV / inV * 100), 100) : 0;
    const inBar = document.getElementById('fin-bar-' + k);
    if (inBar) inBar.style.width = inPct + '%';
    if (el('fob-' + k)) el('fob-' + k).style.width = outPct + '%';
  });
}

function applyGlobalFilter() {
  globalFilter.from = document.getElementById('from-date')?.value || null;
  globalFilter.to = document.getElementById('to-date')?.value || null;
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-overview') renderOverview();
  else if (activeView === 'view-dpl1') { renderDpl1Loading(); loadDpl1ApiData().then(() => { if (document.querySelector('.view.active')?.id === 'view-dpl1') renderDpl1View(); }); }
  else renderKPIs();
  renderKPIs2(); renderKPIsU(); touch();
}
function resetGlobalFilter() {
  globalFilter = { from: null, to: null };
  ['from-date', 'to-date'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-overview') renderOverview();
  else if (activeView === 'view-dpl1') { renderDpl1Loading(); loadDpl1ApiData().then(() => { if (document.querySelector('.view.active')?.id === 'view-dpl1') renderDpl1View(); }); }
  else renderKPIs();
  renderKPIs2(); renderKPIsU(); touch();
}

function setPeriod(p, btn) {
  activePeriod = p;
  document.querySelectorAll('.pbtn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const a = document.querySelector('.view.active');
  if (!a) { renderLive(true); touch(); return; }
  if (a.id === 'view-dpl1') { renderDpl1Loading(); loadDpl1ApiData({ cardsOnly: true }).then(() => { if (document.querySelector('.view.active')?.id === 'view-dpl1') renderDpl1Cards(); }); }
  else if (a.id === 'view-overview') renderOverview();
  else if (a.id === 'view-dpl2') { renderKPIs2(); renderBccChart2(); renderRcChart2(); }
  else if (a.id === 'view-uril') { renderKPIsU(); renderBccChartU(); renderRcChartU(); }
  renderLive(true); touch();
}

function switchView(name, el) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (!target) return;
  target.classList.add('active');
  const titles = { overview: 'Overview', dpl1: 'DPL 1', dpl2: 'DPL 2', uril: 'URIL', review: 'Annual Review' };
  const pgEl = document.getElementById('page-title');
  if (pgEl) pgEl.textContent = titles[name] || name;
  const pg = document.querySelector('.period-grp');
  if (pg) pg.style.display = name === 'review' ? 'none' : 'flex';
  const gf = document.getElementById('global-filter');
  if (gf) gf.style.display = name === 'review' ? 'none' : 'flex';
  setTimeout(() => {
    try {
      if (name === 'overview') renderOverview();
      else if (name === 'dpl1') {
        if (typeof dpl1SwitchTab === 'function') dpl1SwitchTab('map');
        if (typeof initDpl1LayoutFrame === 'function') initDpl1LayoutFrame();
        renderDpl1Loading();
        loadDpl1ApiData().then(() => { if (document.querySelector('.view.active')?.id === 'view-dpl1') renderDpl1View(); });
      } else if (name === 'dpl2') { renderKPIs2(); renderBccChart2(); renderRcChart2(); }
      else if (name === 'uril') { renderKPIsU(); renderBccChartU(); renderRcChartU(); }
      else if (name === 'review') setRevYear(document.getElementById('rev-year-sel')?.value || revYear);
      touch();
    } catch (e) { console.error('switchView render error:', e); }
  }, 80);
}

function liveM() { if (activePeriod === 'ytd') return 1.85; if (activePeriod === 'mtd') return 1.35; return 1; }
function animN(el, v) { if (!el) return; const s = parseFloat(el.textContent) || 0, t0 = performance.now(); function step(t) { const pp = Math.min((t - t0) / 380, 1), e = 1 - Math.pow(1 - pp, 3); el.textContent = (s + (v - s) * e).toFixed(2); if (pp < 1) requestAnimationFrame(step); } requestAnimationFrame(step); }
function setLM(id, v, a = true) { const el = document.getElementById(id); if (!el) return; if (a) animN(el, v); else el.textContent = v.toFixed(2); }
function renderLive(a = true) { const m = liveM(); setLM('live-wpu', liveR.wpu * m, a); setLM('live-dpu', liveR.dpu * m, a); setLM('dpl2-wpu', liveR.wpu2 * m, a); setLM('dpl2-dpu', liveR.dpu2 * m, a); setLM('uril-wpu', liveR.wpuU * m, a); setLM('uril-dpu', liveR.dpuU * m, a); }
function startLive() {
  renderLive(false);
  setInterval(() => {
    liveR.wpu = Math.max(8, Math.min(20, liveR.wpu + (Math.random() - .5) * .8));
    liveR.dpu = Math.max(2, Math.min(8, liveR.dpu + (Math.random() - .5) * .4));
    liveR.wpu2 = Math.max(7, Math.min(18, liveR.wpu2 + (Math.random() - .5) * .8));
    liveR.dpu2 = Math.max(1.5, Math.min(7, liveR.dpu2 + (Math.random() - .5) * .4));
    liveR.wpuU = Math.max(3, Math.min(8, liveR.wpuU + (Math.random() - .5) * .5));
    liveR.dpuU = Math.max(0.5, Math.min(3, liveR.dpuU + (Math.random() - .5) * .3));
    renderLive(false);
  }, 2000);
}
