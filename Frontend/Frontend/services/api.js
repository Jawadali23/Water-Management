function normalizeCardsPayload(payload) {
  const out = {};
  const pushItem = (item, idx, pathKey = '') => {
    if (!item) return;
    const key = resolveMetricKey(item.key || item.id || item.slug || item.name || item.label || item.metric || pathKey || idx);
    const value = extractValue(item);
    if (!key || value == null) return;
    out[key] = value;
  };
  const visit = (node, path = '') => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => visit(item, `${path}[${idx}]`));
      return;
    }
    if (typeof node === 'number' || typeof node === 'string' || typeof node === 'boolean') {
      const key = resolveMetricKey(path);
      const value = extractValue(node);
      if (key && value != null) out[key] = value;
      return;
    }
    if (typeof node !== 'object') return;
    const entries = Object.entries(node);
    const directKey = resolveMetricKey(node.key || node.id || node.slug || node.name || node.label || node.metric || path);
    const directValue = extractValue(node);
    if (directKey && directValue != null) {
      out[directKey] = directValue;
    }
    entries.forEach(([k, v]) => {
      if (v == null) return;
      const nextPath = path ? `${path}.${k}` : k;
      const key = resolveMetricKey(k);
      if (key) {
        const value = extractValue(v);
        if (value != null) out[key] = value;
      }
      if (Array.isArray(v) || (typeof v === 'object' && !Array.isArray(v))) visit(v, nextPath);
    });
  };
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => pushItem(item, idx));
    return out;
  }
  if (payload && typeof payload === 'object') {
    ['cards', 'data', 'result', 'results', 'items', 'payload'].forEach(k => {
      if (k in payload) visit(payload[k], k);
    });
    Object.entries(payload).forEach(([k, v]) => {
      if (['cards', 'data', 'result', 'results', 'items', 'payload', 'meta', 'chart', 'series', 'datasets', 'labels'].includes(k)) return;
      const key = resolveMetricKey(k);
      const value = extractValue(v);
      if (key && value != null) out[key] = value;
      if (v && typeof v === 'object') visit(v, k);
    });
  }
  return out;
}
function pickLabels(payload, fallback) {
  const candidates = [
    payload && payload.labels,
    payload && payload.categories,
    payload && payload.xLabels,
    payload && payload.x,
    payload && payload.days,
    payload && payload.weeks,
    payload && payload.months,
    payload && payload.data && payload.data.labels,
    payload && payload.chart && payload.chart.labels
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate.map(v => String(v));
  }
  return fallback;
}
function normalizeSeries(payload) {
  const raw = payload && (
    payload.datasets ||
    payload.series ||
    (payload.data && payload.data.datasets) ||
    (payload.data && payload.data.series) ||
    (payload.chart && payload.chart.datasets) ||
    (payload.chart && payload.chart.series) ||
    payload.data
  );
  const out = [];
  if (Array.isArray(raw)) {
    raw.forEach((item, idx) => {
      if (Array.isArray(item)) {
        out.push({ label: `Series ${idx + 1}`, data: item.map(extractValue).map(v => v ?? 0) });
        return;
      }
      if (typeof item === 'number') {
        out.push({ label: `Series ${idx + 1}`, data: [item] });
        return;
      }
      if (item && typeof item === 'object') {
        const label = item.label || item.name || item.metric || item.key || `Series ${idx + 1}`;
        const data = item.data || item.values || item.points || item.series || item.chartData || item.items || item.trend || [];
        const normalized = Array.isArray(data) ? data.map(extractValue).map(v => v ?? 0) : [];
        out.push({ label: String(label), data: normalized });
      }
    });
  } else if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([label, data]) => {
      if (Array.isArray(data)) out.push({ label: String(label), data: data.map(extractValue).map(v => v ?? 0) });
      else if (data && typeof data === 'object') {
        const values = data.data || data.values || data.points || data.series || data.chartData || data.trend || [];
        out.push({ label: String(label), data: Array.isArray(values) ? values.map(extractValue).map(v => v ?? 0) : [] });
      }
    });
  }
  if (!out.length && payload && typeof payload === 'object') {
    ['freshWaterTank', 'withdraw', 'recycle', 'discharge'].forEach(k => {
      if (Array.isArray(payload[k])) out.push({ label: k, data: payload[k].map(extractValue).map(v => v ?? 0) });
    });
  }
  return out.filter(s => Array.isArray(s.data) && s.data.length);
}
function seriesColor(label, index) {
  const k = normalizeKey(label);
  if (k.includes('freshwater') || k.includes('tank') || k.includes('intake') || k.includes('waterin')) return '#1558b0';
  if (k.includes('withdraw') || k.includes('pump')) return '#1558b0';
  if (k.includes('recyclerate') || k.includes('recyclingrate')) return '#10b981';
  if (k.includes('recycle') || k.includes('recircul')) return '#6ee7b7';
  if (k.includes('discharge') || k.includes('out')) return '#f59e0b';
  return ['#1558b0', '#7c3aed', '#6ee7b7', '#f59e0b'][index % 4];
}
function prettyMetricLabel(label) {
  const raw = normalizeKey(label);
  if (raw.includes('withdrawalunit')) return 'Withdrawal / Unit';
  if (raw.includes('dischargeunit')) return 'Discharge / Unit';
  const key = resolveMetricKey(label);
  if (key === 'freshWaterTank') return 'Fresh Water Tank';
  if (key === 'withdraw') return 'Withdrawal / Unit';
  if (key === 'recycle') return 'Recycle';
  if (key === 'discharge') return 'Discharge / Unit';
  if (key === 'recycleRate') return 'Recycle Rate';
  return String(label || 'Series');
}
function getDpl1RangeParams() {
  const from = globalFilter.from;
  const to = globalFilter.to;
  const hasCustom = !!(from && to);
  return {
    range: hasCustom ? 'td' : activePeriod,
    date_from: hasCustom ? from : null,
    date_to: hasCustom ? to : null,
    label: hasCustom ? `${from} to ${to}` : (activePeriod === 'mtd' ? 'Month to Date' : activePeriod === 'ytd' ? 'Year to Date' : 'Till Today')
  };
}
function buildDpl1CardsUrl() {
  const p = getDpl1RangeParams();
  const qs = new URLSearchParams({ range: p.range });
  if (p.date_from) qs.set('date_from', p.date_from);
  if (p.date_to) qs.set('date_to', p.date_to);
  return `${API}/api/cards?${qs.toString()}`;
}
function renderDpl1Loading(message = 'Loading live DPL 1 data...') {
  const el = document.getElementById('dpl1-kpi'); if (!el) return;
  el.innerHTML = `<div class="kpi-card" style="grid-column:1/-1;min-height:150px;display:flex;align-items:center;justify-content:center;text-align:center"><div><div class="kpi-lbl" style="margin-bottom:8px">${message}</div></div></div>`;
}
function getCardsContainer(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.cards || payload.data?.cards || payload.result?.cards || payload.items || payload.payload || payload;
}
function findCardValue(container, candidates) {
  if (!container || typeof container !== 'object') return null;
  const wanted = candidates.map(normalizeKey);
  const entries = Array.isArray(container) ? container.map((v, i) => [String(i), v]) : Object.entries(container);
  for (const [key, val] of entries) {
    const nk = normalizeKey(key);
    const cardLabel = normalizeKey(val && typeof val === 'object' ? (val.card || val.label || val.name || val.title || val.metric || '') : '');
    if (wanted.includes(nk) || wanted.includes(cardLabel)) {
      const n = extractValue(val);
      if (n != null) return n;
    }
  }
  for (const val of Object.values(container)) {
    if (val && typeof val === 'object') {
      const nested = findCardValue(val, candidates);
      if (nested != null) return nested;
    }
  }
  return null;
}
function getDpl1CardValue(metric) {
  const source = getCardsContainer(dpl1Api.rawCards) || dpl1Api.cards || {};
  const direct = extractValue(source[metric]);
  if (direct != null) return direct;
  const aliases = {
    freshWaterTank: ['fresh_water_tank', 'freshWaterTank', 'fresh water tank', 'fwt', 'intake', 'waterIn'],
    withdraw: ['water_withdrawal', 'withdraw', 'water withdrawal', 'waterout', 'waterOut', 'out'],
    recycle: ['recycle_volume', 'recycle', 'recycle volume', 'recycled'],
    discharge: ['factory_discharge', 'discharge', 'factory discharge', 'wwtpOut', 'reject'],
    recycleRate: ['recycling_percent', 'recycleRate', 'recyclingRate', 'recycling percentage', 'recyclingpercent', 'recycleratio', 'rate'],
    production: ['production', 'production_volume', 'production count', 'units', 'unit', 'output'],
    domesticRecycle: ['domestic_recycle', 'domestic', 'domestic recycled', 'domestic recycling'],
    processRecycle: ['process_recycle', 'process', 'process recycled', 'process recycling']
  };
  const keys = aliases[metric] || [metric];
  const exact = findCardValue(source, keys);
  if (exact != null) return exact;
  return null;
}
function renderDpl1Cards() {
  const el = document.getElementById('dpl1-kpi'); if (!el) return;
  const cardData = {
    freshWaterTank: getDpl1CardValue('freshWaterTank'),
    withdraw: getDpl1CardValue('withdraw'),
    recycle: getDpl1CardValue('recycle'),
    discharge: getDpl1CardValue('discharge'),
    recycleRate: getDpl1CardValue('recycleRate'),
    production: getDpl1CardValue('production'),
    domesticRecycle: getDpl1CardValue('domesticRecycle'),
    processRecycle: getDpl1CardValue('processRecycle')
  };
  const local = { freshWaterTank: monthly.freshWaterTank, withdraw: monthly.withdraw, recycle: monthly.recycle, discharge: monthly.discharge };
  const recycleRate = cardData.recycleRate != null ? cardData.recycleRate : (cardData.freshWaterTank && cardData.recycle != null && cardData.freshWaterTank > 0 ? (cardData.recycle / cardData.freshWaterTank) * 100 : 0);
  const vals = {
    freshWaterTank: cardData.freshWaterTank != null ? cardData.freshWaterTank : getVal(local.freshWaterTank),
    withdraw: cardData.withdraw != null ? cardData.withdraw : getVal(local.withdraw),
    recycle: cardData.recycle != null ? cardData.recycle : getVal(local.recycle),
    discharge: cardData.discharge != null ? cardData.discharge : getVal(local.discharge),
    production: cardData.production != null ? cardData.production : Math.round(getVal(local.withdraw) * 82)
  };
  const rcCurr = recycleRate || 0;
  const domesticAbs = cardData.domesticRecycle != null ? cardData.domesticRecycle : Math.round(vals.recycle * 0.5);
  const processAbs = cardData.processRecycle != null ? cardData.processRecycle : Math.max(0, vals.recycle - domesticAbs);
  const processPct = 0;
  const domesticPct = 0;
  const withdrawalPerUnit = vals.production > 0 ? (vals.withdraw / vals.production).toFixed(3) : fmtExact(vals.withdraw);
  const dischargePerUnit = vals.production > 0 ? (vals.discharge / vals.production).toFixed(3) : fmtExact(vals.discharge);
  const unit = '<span class="kpi-unit">m&#179;</span>';
  const icons = {
    withdrawal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8S6.2 9 6.2 13.8a5.8 5.8 0 0 0 11.6 0C17.8 9 12 2.8 12 2.8z"/><path d="M9.3 14.1c.8 1.4 2.2 2 3.9 1.6"/></svg>',
    recycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7.5A6.5 6.5 0 0 1 18.2 10"/><path d="m18.5 5.6-.3 4.4-4.2-.9"/><path d="M17 16.5A6.5 6.5 0 0 1 5.8 14"/><path d="m5.5 18.4.3-4.4 4.2.9"/></svg>',
    production: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"/><path d="M4 12h3M17 12h3M12 4v3M12 17v3"/><path d="m6.5 6.5 2 2M15.5 15.5l2 2"/></svg>',
    discharge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11a3 3 0 0 1 3 3v1"/><path d="M4 11h9a3 3 0 0 1 3 3v1"/><path d="M18 14v6"/><path d="m15 17 3 3 3-3"/><path d="M4 15h7"/></svg>'
  };
  const targetMark = (value, target, unitText, higherIsGood = false) => {
    if (target == null || value == null || value === '') return '';
    const current = parseFloat(String(value).replace(/,/g, ''));
    if (!Number.isFinite(current)) return '';
    const isAboveTarget = current > target;
    const isGood = higherIsGood ? current >= target : current <= target;
    const dir = isAboveTarget ? 'up' : 'down';
    const tone = isGood ? 'good' : 'bad';
    const targetText = Number(target).toFixed(unitText === '%' ? 0 : 3) + (unitText === '%' ? '%' : '');
    return `<span class="overview-target-trend ${tone} ${dir}"><span></span></span>|||<span class="dpl1-kpi-target-label">Target</span><strong>${targetText}</strong>`;
  };
  const card = (line, icon, title, tag, value, unitText, subs, extraClass = '', targetHtml = '') => {
    const tagHtml = tag ? `<span class="kpi-badge">${tag}</span>` : '<span></span>';
    const meter = Math.max(12, Math.min(100, parseFloat(value) ? Math.round(parseFloat(value) * (unitText === '%' ? 1 : 120)) : 62));
    const targetParts = targetHtml ? String(targetHtml).split('|||') : [];
    const targetArrow = targetParts[0] || '';
    const targetCopy = targetParts[1] || '';
    const unitSpan = unitText ? `<span class="kpi-unit">${unitText}</span>` : '';
    const targetValueHtml = targetHtml
      ? `<div class="dpl1-kpi-value-wrap"><div class="dpl1-kpi-value-line">${targetArrow}<div class="dpl1-kpi-value">${value}${unitSpan}</div></div></div>`
      : `<div class="dpl1-kpi-value">${value}${unitSpan}</div>`;
    return `<div class="kpi-card dpl1-kpi-main ${extraClass}" style="--kline:${line};--meter:${meter}%">
      <div class="dpl1-kpi-bgmark">${icon}</div>
      <div class="dpl1-kpi-card-head">
        <div class="dpl1-kpi-title-wrap"><div class="kpi-icon dpl1-kpi-icon">${icon}</div><div class="dpl1-kpi-title">${title}</div></div>
        ${targetCopy ? `<div class="dpl1-kpi-target-copy">${targetCopy}</div>` : tagHtml}
      </div>
      ${targetValueHtml}
      <div class="dpl1-kpi-meter"><span></span></div>
      ${subs || ''}
    </div>`;
  };
  const sub = (label, value, unitHtml = unit, tone = '') => `<div class="dpl1-kpi-sub ${tone}"><div class="dpl1-kpi-sub-label">${label}</div><div class="dpl1-kpi-sub-value">${value}${unitHtml}</div></div>`;
  el.innerHTML = [
    card('#38b6ff', icons.withdrawal, 'Withdrawal per Unit', 'Intake', withdrawalPerUnit, 'm&#179;/Unit', `<div class="dpl1-kpi-subgrid">${sub('Absolute', fmtExact(vals.withdraw))}</div>`, 'withdraw-card', targetMark(withdrawalPerUnit, .036, 'm&#179;/Unit')),
    card('#22c55e', icons.recycle, 'Recycle Rate', 'Recycle Rate', fmtExact(rcCurr), '%', `<div class="dpl1-kpi-subgrid two">${sub('Process', processPct.toFixed(1), '<span class="kpi-unit">%</span>', 'process')}${sub('Domestic', domesticPct.toFixed(1), '<span class="kpi-unit">%</span>', 'domestic')}</div><div class="dpl1-kpi-subgrid" style="margin-top:8px">${sub('Absolute Recycled Water', fmtExact(vals.recycle))}</div>`, 'rate-card recycle-card', targetMark(fmtExact(rcCurr), 41, '%', true)),
    card('#f97316', icons.discharge, 'Discharge per Unit', 'WWTP Out', dischargePerUnit, 'm&#179;/Unit', `<div class="dpl1-kpi-subgrid">${sub('Absolute', fmtExact(vals.discharge))}</div>`, 'discharge-card', targetMark(dischargePerUnit, .035, 'm&#179;/Unit')),
    card('#a78bfa', icons.production, 'Production', '', fmt(vals.production), 'Unit', '', 'production-card')
  ].join('');
}
function renderDpl1View() {
  renderDpl1Cards();
  renderBccChart();
  renderRcChart();
  renderWaterRecycleChart();
  if (typeof initDpl1LayoutFrame === 'function') initDpl1LayoutFrame();
}
function applyDpl1ApiDefaults() {
  if (dpl1Api.defaultsApplied) return;
  dpl1Api.defaultsApplied = true;
  const cfg = [['bcc', 'daily'], ['rc1', 'monthly'], ['wr1', 'monthly']];
  cfg.forEach(([id, mode]) => {
    const p = document.getElementById(id + '-period');
    const w = document.getElementById(id + '-week');
    if (p) p.value = mode;
    if (w) w.style.display = 'none';
    fs[id] = { p: mode, w: '', mo: '', yr: '' };
    handleDS(id);
  });
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
  return res.json();
}
async function loadDpl1ApiData(options = {}) {
  const cardsOnly = !!options.cardsOnly;
  const key = buildDpl1CardsUrl() + (cardsOnly ? '&scope=cards' : '');
  if (dpl1Api.loading && dpl1Api.loadingKey === key) return dpl1Api.loading;
  dpl1Api.loadingKey = key;
  const seq = ++dpl1Api.requestSeq;
  dpl1Api.loading = (async () => {
    try {
      dpl1Api.cards = null;
      dpl1Api.rawCards = null;
      if (cardsOnly) {
        const cards = await fetchJson(buildDpl1CardsUrl());
        if (seq !== dpl1Api.requestSeq) return null;
        dpl1Api.rawCards = cards;
        dpl1Api.cards = normalizeCardsPayload(cards);
        dpl1Api.error = '';
        return dpl1Api;
      }
      const getChartParams = (id) => {
        const f = fs[id] || {};
        const p = f.p || 'weekly';
        const yr = f.yr || new Date().getFullYear();
        const mo = f.mo || (new Date().getMonth() + 1);
        const d = f.d || new Date().getDate();
        let chartRange = 'hourly';
        if (p === 'daily') chartRange = 'hourly';
        else if (p === 'weekly') chartRange = 'daily';
        else if (p === 'monthly') chartRange = 'monthly';
        else if (p === 'all') chartRange = 'yearly';
        else chartRange = 'yearly';
        return { chartRange, yr, mo, d };
      };

      const bcc = getChartParams('bcc');
      let dashUrl = `${API}/api/dashboard?metric=all&chart_range=${bcc.chartRange}&year=${bcc.yr}`;
      if (bcc.chartRange === 'hourly') dashUrl += `&month=${bcc.mo}&day=${bcc.d}`;
      else if (bcc.chartRange === 'daily') dashUrl += `&month=${bcc.mo}`;

      const rc = getChartParams('rc1');
      let recycleUrl = `${API}/api/recycling-percent/chart?chart_range=${rc.chartRange}&year=${rc.yr}`;
      if (rc.chartRange === 'hourly') recycleUrl += `&month=${rc.mo}&day=${rc.d}`;
      else if (rc.chartRange === 'daily') recycleUrl += `&month=${rc.mo}`;

      const dateOptsUrl = `${API}/api/date-options?year=${bcc.yr}&month=${bcc.mo}`;

      const [cardsRes, mainRes, recycleRes, dateOptsRes] = await Promise.allSettled([
        fetchJson(key),
        fetchJson(dashUrl),
        fetchJson(recycleUrl),
        fetchJson(dateOptsUrl)
      ]);
      if (seq !== dpl1Api.requestSeq) return null;
      if (cardsRes.status === 'fulfilled') {
        dpl1Api.rawCards = cardsRes.value;
        dpl1Api.cards = normalizeCardsPayload(cardsRes.value);
      }
      if (mainRes.status === 'fulfilled') {
        const mainChart = mainRes.value;
        dpl1Api.mainChart = { labels: pickLabels(mainChart, getLabels('bcc')), series: normalizeSeries(mainChart), raw: mainChart };
      }
      if (recycleRes.status === 'fulfilled') {
        const recyclingChart = recycleRes.value;
        dpl1Api.recyclingChart = { labels: pickLabels(recyclingChart, getLabels('rc1')), series: normalizeSeries(recyclingChart), raw: recyclingChart };
      }
      const errors = [
        cardsRes.status === 'rejected' ? `cards: ${cardsRes.reason?.message || cardsRes.reason}` : '',
        mainRes.status === 'rejected' ? `dashboard: ${mainRes.reason?.message || mainRes.reason}` : '',
        recycleRes.status === 'rejected' ? `recycling: ${recycleRes.reason?.message || recycleRes.reason}` : ''
      ].filter(Boolean);
      dpl1Api.error = errors.join(' | ');
      if (dpl1Api.mainChart || dpl1Api.recyclingChart) applyDpl1ApiDefaults();
      return dpl1Api;
    } catch (err) {
      dpl1Api.error = err?.message || String(err);
      console.error('DPL1 API load failed:', err);
      return null;
    } finally {
      dpl1Api.loading = null;
    }
  })();
  return dpl1Api.loading;
}

// ═══ REVIEW DATA FETCHING MOVED TO review_page.js ═══

