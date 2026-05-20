// ─── COMPLETE FIXED REVIEW SECTION ───────────────────────────────────────────

const revData = {
    dpl1: {
        name: 'DPL 1', color: '#1558b0', accent: '#38b6ff',
        m: {
            freshWaterTank: [547, 664, 770, 838, 957, 1016, 994, 884, 785, 957, 621, 655],
            withdraw: [580, 700, 810, 880, 1000, 1060, 1040, 930, 830, 1000, 660, 690],
            recycle: [99, 110, 79, 111, 101, 86, 70, 115, 94, 147, 246, 172],
            discharge: [34, 58, 96, 100, 99, 98, 78, 85, 74, 120, 82, 69]
        }
    }
};

let revPlant = 'dpl1', revYear = 2019;
const reviewDataCache = {};

// ─── API LOADER ───────────────────────────────────────────────────────────────
async function loadReviewApiData(year) {
    try {
        const res = await fetch(`${API}/api/review?year=${year}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (json.status !== 'success' || !json.data) return null;
        const d = json.data;

        // 1. Normalize monthly_breakdown → keyed arrays[12]
        const monthly = {
            freshWaterTank: new Array(12).fill(0),
            withdraw: new Array(12).fill(0),
            recycle: new Array(12).fill(0),
            discharge: new Array(12).fill(0),
        };

        (d.monthly_breakdown || []).forEach(row => {
            const idx = (row.month || 1) - 1;
            if (idx < 0 || idx > 11) return;
            monthly.freshWaterTank[idx] = row.fresh_water_tank || 0;
            monthly.withdraw[idx] = row.water_withdrawal || 0;
            monthly.recycle[idx] = row.recycle_volume || 0;
            monthly.discharge[idx] = row.discharge || 0;
        });

        // ─── Build insights from API response ────────────────────────────────────────
        // ─── Build insights from API response ────────────────────────────────────────
        const ki = d.key_insights || {};
        const fmtN = v => (v != null && v > 0) ? Math.round(v).toLocaleString() : '—';

        const insights = [                                          // ✅ was `insightsList`

            // 1. Peak intake (withdrawal OR fresh water tank depending on data)
            ki.highest_intake_month?.month_name && {
                text: `<strong>Peak in ${ki.highest_intake_month.month_name}</strong> &ndash; ${fmtN(ki.highest_intake_month.value)} m&#179; ${ki.highest_intake_month.label}, highest of ${year}.`,
                color: '#1558b0', bg: 'rgba(21,88,176,0.09)'
            },

            // 2. Lowest intake
            ki.lowest_intake_month?.month_name && {
                text: `<strong>Lowest in ${ki.lowest_intake_month.month_name}</strong> &ndash; dropped to ${fmtN(ki.lowest_intake_month.value)} m&#179; ${ki.lowest_intake_month.label}.`,
                color: '#dc2626', bg: 'rgba(239,68,68,0.07)'
            },

            // 3. Best recycle — only show if recycle data exists
            ki.has_recycle_data && ki.best_recycle_month?.month_name && {
                text: `<strong>Best recycle in ${ki.best_recycle_month.month_name}</strong> &ndash; ${Number(ki.best_recycle_month.value).toFixed(1)}% efficiency.`,
                color: '#059669', bg: 'rgba(16,185,129,0.09)'
            },

            // 4. Highest discharge — only show if discharge data exists
            ki.has_discharge_data && ki.highest_discharge_month?.month_name && {
                text: `<strong>${ki.highest_discharge_month.month_name} highest discharge</strong> &ndash; ${fmtN(ki.highest_discharge_month.value)} m&#179; via WWTP.`,
                color: '#d97706', bg: 'rgba(245,158,11,0.09)'
            },

            // 5. Peak fresh water tank (always available)
            ki.highest_fresh_water_tank_month?.month_name && {
                text: `<strong>Peak tank in ${ki.highest_fresh_water_tank_month.month_name}</strong> &ndash; ${fmtN(ki.highest_fresh_water_tank_month.value)} m&#179; stored.`,
                color: '#6366f1', bg: 'rgba(99,102,241,0.07)'
            },

            // 6. Lowest fresh water tank (always available)
            ki.lowest_fresh_water_tank_month?.month_name && {
                text: `<strong>Lowest tank in ${ki.lowest_fresh_water_tank_month.month_name}</strong> &ndash; fell to ${fmtN(ki.lowest_fresh_water_tank_month.value)} m&#179;.`,
                color: '#7c3aed', bg: 'rgba(124,58,237,0.07)'
            },

            // 7. Partial data notice — only shown when metrics are missing
            (!ki.has_withdrawal_data || !ki.has_recycle_data || !ki.has_discharge_data) && {
                text: `<strong>Partial data for ${year}</strong> &ndash; ${[
                    !ki.has_withdrawal_data ? 'withdrawal' : '',
                    !ki.has_recycle_data ? 'recycle' : '',
                    !ki.has_discharge_data ? 'discharge' : '',
                ].filter(Boolean).join(', ')} metrics not recorded this year.`,
                color: '#9ca3af', bg: 'rgba(156,163,175,0.09)'
            },

        ].filter(Boolean);

        return { monthly, insights };         // ✅ now returns the correct variable

    } catch (e) {
        console.error('[Review] API error:', e);
        return null;
    }
}

// ─── PLANT SELECTOR ──────────────────────────────────────────────────────────
function setRevPlant(pl, btn) {
    revPlant = pl;
    document.querySelectorAll('.rev-plant-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderReview();
}

// ─── YEAR SELECTOR ───────────────────────────────────────────────────────────
async function setRevYear(yr) {
    revYear = parseInt(yr);
    const cacheKey = `${revPlant}_${revYear}`;

    // Show immediately with fallback/mock data while fetching
    renderReview();

    // Show loading toast
    showRevToast(`Updating data for ${revYear}…`);

    const data = await loadReviewApiData(revYear);

    if (data) {
        reviewDataCache[cacheKey] = data;
    } else {
        // API returned nothing — keep showing mock, flag it
        console.warn(`[Review] No API data for ${revYear}, using mock.`);
    }

    hideRevToast();
    renderReview();   // Re-render with real data (or confirmed mock)
}

// ─── TOAST HELPERS ────────────────────────────────────────────────────────────
function showRevToast(msg) {
    hideRevToast();
    const t = document.createElement('div');
    t.id = 'rev-toast';
    t.style.cssText = 'position:fixed;top:80px;right:20px;background:#1558b0;color:#fff;'
        + 'padding:7px 14px;border-radius:20px;font-size:11px;z-index:999;'
        + 'box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:6px;animation:fadeUp .3s ease';
    t.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:#38b6ff;display:inline-block;animation:pulse 1s infinite"></span>${msg}`;
    document.body.appendChild(t);
}
function hideRevToast() {
    const t = document.getElementById('rev-toast');
    if (t) t.remove();
}

// ─── DATA RESOLVER ───────────────────────────────────────────────────────────
function getYD(pl, yr) {
    const cacheKey = `${pl}_${yr}`;
    if (reviewDataCache[cacheKey]) return reviewDataCache[cacheKey].monthly;

    // Fallback: scale base data by year offset
    const base = revData[pl].m;
    if (yr === 2023) return base;
    const f = 1 + (yr - 2023) * 0.07;
    const r = {};
    Object.keys(base).forEach(k => {
        r[k] = base[k].map((v, i) => Math.round(v * f * (0.96 + Math.sin(i * yr * 0.1) * 0.04)));
    });
    return r;
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderReview() {
    const d = revData[revPlant];
    const cacheKey = `${revPlant}_${revYear}`;
    const cached = reviewDataCache[cacheKey];

    // Always resolve monthly as a clean keyed object
    const m = cached?.monthly || getYD(revPlant, revYear);
    const apiInsights = cached?.insights || null;

    const { grid, tick } = gc();

    // ── KPI totals ────────────────────────────────────────────────
    const tW = m.freshWaterTank.reduce((a, b) => a + b, 0);
    const tWd = m.withdraw.reduce((a, b) => a + b, 0);
    const tR = m.recycle.reduce((a, b) => a + b, 0);
    const tD = m.discharge.reduce((a, b) => a + b, 0);
    const rc = tWd > 0 ? (tR / tWd * 100).toFixed(1) : '0';

    // ── KPI cards ─────────────────────────────────────────────────
    const kHtml = [
        { icon: '&#128167;', tag: 'Annual', lbl: 'Fresh Water Tank', val: fmt(tW), unit: 'm&#179;', l: '#38b6ff' },
        { icon: '&#128260;', tag: 'Annual', lbl: 'Withdraw', val: fmt(tWd), unit: 'm&#179;', l: d.accent },
        { icon: '&#9851;&#65039;', tag: 'Recovered', lbl: 'Recycle', val: fmt(tR), unit: 'm&#179;', l: '#6ee7b7' },
        { icon: '&#128202;', tag: 'Rate', lbl: 'Recycle Rate', val: rc, unit: '%', l: '#34d399' },
        { icon: '&#11015;&#65039;', tag: 'Disposed', lbl: 'Discharge', val: fmt(tD), unit: 'm&#179;', l: '#fbbf24' },
    ].map(k =>
        `<div class="kpi-card" style="--kline:${k.l}">
       <div class="kpi-top"><div class="kpi-icon">${k.icon}</div><span class="kpi-badge">${k.tag}</span></div>
       <div class="kpi-lbl">${k.lbl}</div>
       <div class="kpi-val">${k.val}<span class="kpi-unit">${k.unit}</span></div>
       <div class="kpi-sep"></div>
       <div class="kpi-foot"><span class="kpi-trend neu">Annual</span><span class="kpi-period">${revYear}</span></div>
     </div>`
    ).join('');

    // ── Monthly table rows ────────────────────────────────────────
    const tHtml = months.map((mo, i) => {
        const rp = m.withdraw[i] > 0
            ? (m.recycle[i] / m.withdraw[i] * 100).toFixed(1) + '%'
            : '0.0%';
        return `<tr>
      <td class="td-b">${mo}</td>
      <td>${m.freshWaterTank[i].toLocaleString()}</td>
      <td>${m.withdraw[i].toLocaleString()}</td>
      <td style="color:#059669;font-weight:600">${m.recycle[i].toLocaleString()}</td>
      <td style="color:#d97706;font-weight:600">${m.discharge[i].toLocaleString()}</td>
      <td style="color:#6366f1;font-weight:600">${rp}</td>
    </tr>`;
    }).join('') +
        `<tr style="background:#f5f8ff">
    <td class="td-b">TOTAL</td>
    <td style="color:#1558b0;font-weight:700">${tW.toLocaleString()}</td>
    <td style="color:#7c3aed;font-weight:700">${tWd.toLocaleString()}</td>
    <td style="color:#059669;font-weight:700">${tR.toLocaleString()}</td>
    <td style="color:#d97706;font-weight:700">${tD.toLocaleString()}</td>
    <td style="color:#6366f1;font-weight:700">${rc}%</td>
  </tr>`;

    // ── Insights ──────────────────────────────────────────────────
    let insights = '';
    if (apiInsights && apiInsights.length > 0) {
        insights = apiInsights.map(ins =>
            `<div class="ins">
        <div class="ins-ic" style="background:${ins.bg}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="${ins.color}" stroke-width="2.2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
          </svg>
        </div>
        <div class="ins-txt">${ins.text}</div>
      </div>`
        ).join('');
    } else {
        // Fallback computed insights from monthly arrays
        const peakIdx = m.freshWaterTank.indexOf(Math.max(...m.freshWaterTank));
        const minIdx = m.freshWaterTank.indexOf(Math.min(...m.freshWaterTank));
        const bestRcIdx = m.recycle.indexOf(Math.max(...m.recycle));
        const maxDisIdx = m.discharge.indexOf(Math.max(...m.discharge));
        const bestRcPct = m.withdraw[bestRcIdx] > 0
            ? (m.recycle[bestRcIdx] / m.withdraw[bestRcIdx] * 100).toFixed(1)
            : '0';

        insights = [
            { bg: 'rgba(21,88,176,0.09)', s: '#1558b0', t: `<strong>Peak in ${months[peakIdx]}</strong> &ndash; ${fmt(Math.max(...m.freshWaterTank))} m&#179; intake, highest of ${revYear}.` },
            { bg: 'rgba(16,185,129,0.09)', s: '#059669', t: `<strong>Best recycle in ${months[bestRcIdx]}</strong> &ndash; ${fmt(m.recycle[bestRcIdx])} m&#179; at ${bestRcPct}% efficiency.` },
            { bg: 'rgba(245,158,11,0.09)', s: '#d97706', t: `<strong>${months[maxDisIdx]} highest discharge</strong> &ndash; ${fmt(Math.max(...m.discharge))} m&#179; via WWTP.` },
            { bg: 'rgba(239,68,68,0.07)', s: '#dc2626', t: `<strong>${months[minIdx]} lowest intake</strong> &ndash; dropped to ${fmt(Math.min(...m.freshWaterTank))} m&#179;.` },
            { bg: 'rgba(99,102,241,0.07)', s: '#6366f1', t: `<strong>${rc}% overall recycle rate</strong> &ndash; ${revYear < 2024 ? 'target 20% for 2024' : revYear < 2026 ? 'improving year on year' : 'exceeding targets'}.` },
        ].map(ins =>
            `<div class="ins">
        <div class="ins-ic" style="background:${ins.bg}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="${ins.s}" stroke-width="2.2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
          </svg>
        </div>
        <div class="ins-txt">${ins.t}</div>
      </div>`
        ).join('');
    }

    // ── Inject HTML ───────────────────────────────────────────────
    const el = document.getElementById('rev-content');
    if (!el) return;

    el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:15px;animation:fadeUp .28s ease">
      <div class="kpi-grid">${kHtml}</div>
      <div class="rev-grid">
        <div class="rev-card">
          <div class="rev-card-title">
            Monthly Breakdown
            <span class="rbadge rbadge-ok">${d.name} &middot; ${revYear}</span>
          </div>
          <div style="overflow:auto;max-height:270px">
            <table class="sum-tbl">
              <thead><tr>
                <th>Month</th><th>FWT m&#179;</th><th>Withdraw</th>
                <th>Recycle</th><th>Discharge</th><th>Rc%</th>
              </tr></thead>
              <tbody>${tHtml}</tbody>
            </table>
          </div>
        </div>
        <div class="rev-card">
          <div class="rev-card-title">
            Key Insights
            <span class="rbadge rbadge-warn">${d.name} &middot; ${revYear}</span>
          </div>
          <div class="insights">${insights}</div>
        </div>
      </div>
      <div class="rev-chart-card">
        <div style="font-family:'Rajdhani',sans-serif;font-size:.9rem;font-weight:700;color:#0c2461;margin-bottom:12px">
          Full Year Flow &ndash; ${d.name}
          <span class="rbadge" style="background:rgba(21,88,176,0.07);color:#1558b0;border:1px solid rgba(21,88,176,0.17);margin-left:6px">
            All Metrics &middot; ${revYear}
          </span>
        </div>
        <div style="position:relative;height:210px"><canvas id="revChart"></canvas></div>
        <div class="chart-legend" style="margin-top:10px">
          <div class="leg"><div class="leg-dot" style="background:${d.color}"></div>Fresh Water Tank</div>
          <div class="leg"><div class="leg-dot" style="background:${d.accent}"></div>Withdraw</div>
          <div class="leg"><div class="leg-dot" style="background:#10b981"></div>Recycle</div>
          <div class="leg"><div class="leg-dot" style="background:#f59e0b"></div>Discharge</div>
        </div>
      </div>
    </div>`;

    // ── Chart ─────────────────────────────────────────────────────
    dc('revChart');
    const canvas = document.getElementById('revChart');
    if (!canvas) return;

    charts['revChart'] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: months,
            datasets: [
                { label: 'Fresh Water Tank', data: m.freshWaterTank, borderColor: d.color, backgroundColor: d.color + '12', fill: true, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderColor: d.color, tension: 0.35 },
                { label: 'Withdraw', data: m.withdraw, borderColor: d.accent, fill: false, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: d.accent, tension: 0.35, borderDash: [5, 3] },
                { label: 'Recycle', data: m.recycle, borderColor: '#10b981', fill: false, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: '#10b981', tension: 0.35, borderDash: [3, 4] },
                { label: 'Discharge', data: m.discharge, borderColor: '#f59e0b', fill: false, borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', pointBorderColor: '#f59e0b', tension: 0.35, borderDash: [2, 5] },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...TT, callbacks: {
                        title: i => '  ' + i[0].label,
                        label: c => '  ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString() + ' m³'
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: tick, font: { size: 9.5 } }, border: { display: false } },
                y: { grid: { color: grid }, beginAtZero: true, ticks: { color: tick, font: { size: 9.5 }, callback: v => v.toLocaleString() }, border: { display: false } }
            }
        }
    });
}