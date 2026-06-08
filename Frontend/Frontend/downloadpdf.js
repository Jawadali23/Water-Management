function downloadRevPdf() {
    const d = revData[revPlant];
    const cacheKey = `${revPlant}_${revYear}`;
    const cached = reviewDataCache[cacheKey];

    // ── Use real API data if available, else fallback ─────────────
    const m = cached?.monthly || getYD(revPlant, revYear);
    const ki = cached?.insights || [];

    // ── KPI Totals ────────────────────────────────────────────────
    const tW = m.freshWaterTank.reduce((a, b) => a + b, 0);
    const tWd = m.withdraw.reduce((a, b) => a + b, 0);
    const tR = m.recycle.reduce((a, b) => a + b, 0);
    const tD = m.discharge.reduce((a, b) => a + b, 0);
    const rc = tWd > 0 ? (tR / tWd * 100).toFixed(1) : '0.0';

    // ── Monthly table rows ────────────────────────────────────────
    const rows = months.map((mo, i) => {
        const rp = m.withdraw[i] > 0
            ? (m.recycle[i] / m.withdraw[i] * 100).toFixed(1) + '%'
            : '0.0%';
        return `
        <tr>
            <td>${mo}</td>
            <td>${m.freshWaterTank[i].toLocaleString()}</td>
            <td>${m.withdraw[i].toLocaleString()}</td>
            <td style="color:#059669">${m.recycle[i].toLocaleString()}</td>
            <td style="color:#d97706">${m.discharge[i].toLocaleString()}</td>
            <td style="color:#6366f1">${rp}</td>
        </tr>`;
    }).join('');

    // ── Insights rows ─────────────────────────────────────────────
    const insightRows = ki.length > 0
        ? ki.map(ins => `
            <tr>
                <td colspan="2" style="padding:7px 10px;border-bottom:1px solid #e5e7eb">
                    ${ins.text}
                </td>
            </tr>`).join('')
        : `<tr><td colspan="2" style="color:#9ca3af;padding:7px 10px">
               No insights available for ${revYear}.
           </td></tr>`;

    // ── Build PDF HTML ────────────────────────────────────────────
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${d.name} – Water Report ${revYear}</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: Arial, sans-serif;
                color: #0d1f3c;
                padding: 32px;
                font-size: 12px;
            }

            /* ── Header ── */
            .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 3px solid #1558b0;
                padding-bottom: 12px;
                margin-bottom: 20px;
            }
            .header h1 {
                font-size: 20px;
                color: #0c2461;
            }
            .header .meta {
                font-size: 10px;
                color: #6b7280;
                margin-top: 4px;
            }
            .badge {
                background: #f0f6ff;
                border: 1px solid #c3d7f7;
                color: #1558b0;
                border-radius: 20px;
                padding: 3px 10px;
                font-size: 10px;
                font-weight: 600;
            }

            /* ── KPI Grid ── */
            .kpi-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 10px;
                margin-bottom: 22px;
            }
            .kpi {
                background: #f0f6ff;
                border-radius: 8px;
                padding: 12px 10px;
                border-left: 4px solid #1558b0;
                text-align: center;
            }
            .kpi.green  { border-color: #10b981; }
            .kpi.amber  { border-color: #f59e0b; }
            .kpi.purple { border-color: #6366f1; }
            .kpi-val {
                font-size: 18px;
                font-weight: 700;
                color: #0c2461;
            }
            .kpi.green  .kpi-val { color: #059669; }
            .kpi.amber  .kpi-val { color: #d97706; }
            .kpi.purple .kpi-val { color: #6366f1; }
            .kpi-lbl {
                font-size: 9px;
                color: #6b7280;
                margin-top: 3px;
            }
            .kpi-unit {
                font-size: 11px;
                font-weight: 400;
                color: #6b7280;
            }

            /* ── Section title ── */
            .section-title {
                font-size: 13px;
                font-weight: 700;
                color: #0c2461;
                margin-bottom: 8px;
                padding-bottom: 4px;
                border-bottom: 1px solid #e5e7eb;
            }

            /* ── Tables ── */
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 22px;
                font-size: 11px;
            }
            th {
                background: #0c2461;
                color: #fff;
                padding: 7px 10px;
                text-align: left;
                font-weight: 600;
            }
            td {
                padding: 6px 10px;
                border-bottom: 1px solid #e5e7eb;
            }
            tr:last-child td { border-bottom: none; }
            .total-row td {
                background: #f0f6ff;
                font-weight: 700;
                border-top: 2px solid #c3d7f7;
            }

            /* ── Insights ── */
            .insight-row td { vertical-align: top; font-size: 11px; }

            /* ── Footer ── */
            .footer {
                margin-top: 28px;
                padding-top: 10px;
                border-top: 1px solid #e5e7eb;
                font-size: 9px;
                color: #9ca3af;
                display: flex;
                justify-content: space-between;
            }

            @media print {
                body { padding: 18px; }
                .kpi-grid { grid-template-columns: repeat(5, 1fr); }
            }
        </style>
    </head>
    <body>

        <!-- Header -->
        <div class="header">
            <div>
                <h1>&#128167; ${d.name} &ndash; Annual Water Report ${revYear}</h1>
                <div class="meta">
                    Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    &nbsp;&middot;&nbsp; Dawlance Water Management System
                </div>
            </div>
            <span class="badge">${d.name} &middot; ${revYear}</span>
        </div>

        <!-- KPI Cards -->
        <div class="section-title">Annual KPIs</div>
        <div class="kpi-grid">
            <div class="kpi">
                <div class="kpi-val">${fmt(tW)} <span class="kpi-unit">m&#179;</span></div>
                <div class="kpi-lbl">Fresh Water Tank</div>
            </div>
            <div class="kpi">
                <div class="kpi-val">${fmt(tWd)} <span class="kpi-unit">m&#179;</span></div>
                <div class="kpi-lbl">Withdraw</div>
            </div>
            <div class="kpi green">
                <div class="kpi-val">${fmt(tR)} <span class="kpi-unit">m&#179;</span></div>
                <div class="kpi-lbl">Recycle</div>
            </div>
            <div class="kpi purple">
                <div class="kpi-val">${rc} <span class="kpi-unit">%</span></div>
                <div class="kpi-lbl">Recycle Rate</div>
            </div>
            <div class="kpi amber">
                <div class="kpi-val">${fmt(tD)} <span class="kpi-unit">m&#179;</span></div>
                <div class="kpi-lbl">Discharge</div>
            </div>
        </div>

        <!-- Monthly Breakdown -->
        <div class="section-title">Monthly Breakdown</div>
        <table>
            <thead>
                <tr>
                    <th>Month</th>
                    <th>FWT m&#179;</th>
                    <th>Withdraw</th>
                    <th>Recycle</th>
                    <th>Discharge</th>
                    <th>Rc%</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
                <tr class="total-row">
                    <td>TOTAL</td>
                    <td>${tW.toLocaleString()}</td>
                    <td>${tWd.toLocaleString()}</td>
                    <td style="color:#059669">${tR.toLocaleString()}</td>
                    <td style="color:#d97706">${tD.toLocaleString()}</td>
                    <td style="color:#6366f1">${rc}%</td>
                </tr>
            </tbody>
        </table>

        <!-- Key Insights -->
        <div class="section-title">Key Insights</div>
        <table>
            <tbody class="insight-row">
                ${insightRows}
            </tbody>
        </table>

        <!-- Footer -->
        <div class="footer">
            <span>Dawlance WMS &middot; ${d.name} &middot; ${revYear}</span>
            <span>Confidential &middot; Internal Use Only</span>
        </div>

    </body>
    </html>`;

    // ── Open print dialog ─────────────────────────────────────────
    const win = window.open('', '_blank');
    if (!win) {
        alert('Please allow popups to download the PDF');
        return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
        win.focus();
        win.print();
    }, 600);
}