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
  if (k.includes('withdraw') || k.includes('pump')) return '#7c3aed';
  if (k.includes('recycle') || k.includes('recircul')) return '#6ee7b7';
  if (k.includes('discharge') || k.includes('out')) return '#f59e0b';
  return ['#1558b0', '#7c3aed', '#6ee7b7', '#f59e0b'][index % 4];
}
function prettyMetricLabel(label) {
  const key = resolveMetricKey(label);
  if (key === 'freshWaterTank') return 'Fresh Water Tank';
  if (key === 'withdraw') return 'Withdraw';
  if (key === 'recycle') return 'Recycle';
  if (key === 'discharge') return 'Discharge';
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
  el.innerHTML = `<div class="kpi-card" style="grid-column:1/-1;min-height:150px;display:flex;align-items:center;justify-content:center;text-align:center"><div><div class="kpi-lbl" style="margin-bottom:8px">${message}</div><div class="kpi-period">${getDpl1RangeParams().label}</div></div></div>`;
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
    recycleRate: ['recycling_percent', 'recycleRate', 'recyclingRate', 'recycling percentage', 'recyclingpercent', 'recycleratio', 'rate']
  };
  const keys = aliases[metric] || [metric];
  const exact = findCardValue(source, keys);
  if (exact != null) return exact;
  return null;
}
function renderDpl1Cards() {
  const el = document.getElementById('dpl1-kpi'); if (!el) return;
  if (!dpl1Api.rawCards && !dpl1Api.cards) {
    // Fall back to the local dataset when the API is unavailable.
    renderKPIsFor('dpl1-kpi', monthly);
    return;
  }
  const cardData = {
    freshWaterTank: getDpl1CardValue('freshWaterTank'),
    withdraw: getDpl1CardValue('withdraw'),
    recycle: getDpl1CardValue('recycle'),
    discharge: getDpl1CardValue('discharge'),
    recycleRate: getDpl1CardValue('recycleRate')
  };
  const local = { freshWaterTank: monthly.freshWaterTank, withdraw: monthly.withdraw, recycle: monthly.recycle, discharge: monthly.discharge };
  const recycleRate = cardData.recycleRate != null ? cardData.recycleRate : (cardData.freshWaterTank && cardData.recycle != null && cardData.freshWaterTank > 0 ? (cardData.recycle / cardData.freshWaterTank) * 100 : 0);
  const vals = {
    freshWaterTank: cardData.freshWaterTank != null ? cardData.freshWaterTank : getVal(local.freshWaterTank),
    withdraw: cardData.withdraw != null ? cardData.withdraw : getVal(local.withdraw),
    recycle: cardData.recycle != null ? cardData.recycle : getVal(local.recycle),
    discharge: cardData.discharge != null ? cardData.discharge : getVal(local.discharge)
  };
  const periodLabel = getDpl1RangeParams().label;
  const trendFor = (arr) => {
    const curr = arr[cm], prev = arr[Math.max(cm - 1, 0)], diff = curr - prev;
    const tc = diff > 0 ? 'up' : diff < 0 ? 'dn' : 'neu';
    const ts = diff > 0 ? `&#9650; +${fmt(diff)}` : diff < 0 ? `&#9660; ${fmt(Math.abs(diff))}` : '&ndash;';
    return { tc, ts };
  };
  const kpis = [
    { key: 'freshWaterTank', icon: '&#128167;', tag: 'Intake', label: 'Fresh Water Tank', unit: 'm&#179;', line: '#38b6ff', arr: local.freshWaterTank },
    { key: 'withdraw', icon: '&#128260;', tag: 'Pumped out', label: 'Withdraw', unit: 'm&#179;', line: '#a78bfa', arr: local.withdraw },
    { key: 'recycle', icon: '&#9851;&#65039;', tag: 'Recovered', label: 'Recycle', unit: 'm&#179;', line: '#6ee7b7', arr: local.recycle },
    { key: 'discharge', icon: '&#11015;&#65039;', tag: 'WWTP out', label: 'Discharge', unit: 'm&#179;', line: '#fbbf24', arr: local.discharge }
  ].map(m => {
    const tr = trendFor(m.arr);
    return `<div class="kpi-card" style="--kline:${m.line}"><div class="kpi-top"><div class="kpi-icon">${m.icon}</div><span class="kpi-badge">${m.tag}</span></div><div class="kpi-lbl">${m.label}</div><div class="kpi-val">${fmtExact(vals[m.key])}<span class="kpi-unit">${m.unit}</span></div>${sparkline(m.arr, m.line)}<div class="kpi-sep"></div><div class="kpi-foot"><span class="kpi-trend ${tr.tc}">${tr.ts}</span><span class="kpi-period">${periodLabel}</span></div></div>`;
  });
  const rcCurr = recycleRate || 0;
  const fallbackRcDiff = ((local.recycle[cm] / Math.max(local.freshWaterTank[cm], 1)) * 100) - ((local.recycle[Math.max(cm - 1, 0)] / Math.max(local.freshWaterTank[Math.max(cm - 1, 0)], 1)) * 100);
  const rcDiff = cardData.recycleRate != null ? 0 : fallbackRcDiff;
  const rcTrend = rcDiff > 0 ? 'up' : rcDiff < 0 ? 'dn' : 'neu';
  const rcText = rcDiff > 0 ? `&#9650; +${Math.abs(rcDiff).toFixed(1)}%` : rcDiff < 0 ? `&#9660; ${Math.abs(rcDiff).toFixed(1)}%` : '&ndash;';
  el.innerHTML = kpis.join('') + `<div class="kpi-card" style="--kline:#34d399"><div class="kpi-top"><div class="kpi-icon">&#128202;</div><span class="kpi-badge">Rate</span></div><div class="kpi-lbl">Recycle Rate</div><div class="kpi-val">${fmtExact(rcCurr)}<span class="kpi-unit">%</span></div><div class="kpi-sep"></div><div class="kpi-foot"><span class="kpi-trend ${rcTrend}">${rcText}</span><span class="kpi-period">${periodLabel}</span></div></div>`;
}
function renderDpl1View() {
  renderDpl1Cards();
  renderBccChart();
  renderRcChart();
}
function applyDpl1ApiDefaults() {
  if (dpl1Api.defaultsApplied) return;
  const cfg = [['bcc', true], ['rc1', true]];
  cfg.forEach(([id]) => {
    const p = document.getElementById(id + '-period');
    const w = document.getElementById(id + '-week');
    if (p) p.value = 'weekly';
    if (w && !w.value) w.value = '1';
    fs[id] = { p: 'weekly', w: w?.value || '1', mo: '', yr: '' };
    handleDS(id);
  });
  dpl1Api.defaultsApplied = true;
}
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
  return res.json();
}
async function loadDpl1ApiData() {
  const key = buildDpl1CardsUrl();
  if (dpl1Api.loading && dpl1Api.loadingKey === key) return dpl1Api.loading;
  dpl1Api.loadingKey = key;
  const seq = ++dpl1Api.requestSeq;
  dpl1Api.loading = (async () => {
    try {
      dpl1Api.cards = null;
      dpl1Api.rawCards = null;
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

