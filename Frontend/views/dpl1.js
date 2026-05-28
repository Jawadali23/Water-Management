// ═══ DPL 1 TABS SWITCHER ═══
function dpl1SwitchTab(tab) {
  var listView = document.getElementById('dpl1-list-view');
  var mapView = document.getElementById('dpl1-map-view');
  var tabList = document.getElementById('dpl1-tab-list');
  var tabMap = document.getElementById('dpl1-tab-map');
  
  if (!listView || !mapView) return;
  
  if (tab === 'list') {
    listView.style.display = 'block';
    mapView.style.display = 'none';
    if (tabList) {
      tabList.style.background = '#1558b0';
      tabList.style.color = '#fff';
    }
    if (tabMap) {
      tabMap.style.background = 'transparent';
      tabMap.style.color = '#8ba3c7';
    }
  } else {
    listView.style.display = 'none';
    mapView.style.display = 'block';
    if (tabMap) {
      tabMap.style.background = '#1558b0';
      tabMap.style.color = '#fff';
    }
    if (tabList) {
      tabList.style.background = 'transparent';
      tabList.style.color = '#8ba3c7';
    }
  }
}

// ═══ DPL 1 FLOW MAP INTERACTION & TOOLTIP ═══
function initDpl1FlowMap() {
  var tooltip = document.getElementById('dpl1-fm-tooltip');
  if (!tooltip) return;

  var ttTitle = document.getElementById('dpl1-tt-title');
  var ttSub = document.getElementById('dpl1-tt-sub');
  var ttFlow = document.getElementById('dpl1-tt-flow');
  var ttTotal = document.getElementById('dpl1-tt-total');
  var ttStatus = document.getElementById('dpl1-tt-status');
  var ttUpdate = document.getElementById('dpl1-tt-update');
  var ttClose = document.getElementById('dpl1-tt-close');
  var pinned = false;

  async function showTooltip(el, isClick) {
    // Immediate UI update from data attributes
    ttTitle.textContent = el.dataset.name || '—';
    ttSub.textContent = el.dataset.sub || '';
    ttFlow.textContent = el.dataset.flow || '0';
    ttTotal.textContent = Number(el.dataset.total || 0).toLocaleString();
    ttUpdate.textContent = el.dataset.update || '—';
    var status = (el.dataset.status || 'running').toLowerCase();
    ttStatus.textContent = status.toUpperCase();
    ttStatus.className = 'tt-status ' + status;

    var rect = el.getBoundingClientRect();
    var TW = 280, TH = 200, GAP = 12;
    var x = rect.right + GAP;
    var y = rect.top;
    if (x + TW > window.innerWidth - 10) x = rect.left - TW - GAP;
    if (y + TH > window.innerHeight - 10) y = window.innerHeight - TH - 10;
    if (y < 10) y = 10;
    if (x < 10) x = 10;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.classList.add('show');

    const meterName = el.dataset.name || '';
    tooltip.dataset.currentMeter = meterName;

    if (isClick) { pinned = true; tooltip.classList.add('pinned'); }

    // Async Live Fetch
    try {
      const res = await fetch(`${API}/api/meter/${encodeURIComponent(meterName)}`);
      if (res.ok) {
        const raw = await res.json();
        const data = raw.data || raw;
        // Only apply if the tooltip is still active for this specific meter
        if (tooltip.classList.contains('show') && tooltip.dataset.currentMeter === meterName) {
          const flowVal = data.flow_rate !== undefined ? data.flow_rate : (data.flow !== undefined ? data.flow : data.flowRate);
          const totalVal = data.current !== undefined ? data.current : (data.total !== undefined ? data.total : data.forwardTotal);
          const updateVal = data.last_update !== undefined ? data.last_update : (data.update !== undefined ? data.update : data.lastUpdate);

          if (flowVal !== undefined && flowVal !== null) ttFlow.textContent = flowVal;
          if (totalVal !== undefined && totalVal !== null) ttTotal.textContent = typeof fmtExact === 'function' ? fmtExact(totalVal) : Number(totalVal).toLocaleString();
          if (updateVal !== undefined && updateVal !== null) ttUpdate.textContent = updateVal;

          const statusVal = data.status || data.state;
          if (statusVal) {
            const s = statusVal.toLowerCase();
            ttStatus.textContent = s.toUpperCase();
            ttStatus.className = 'tt-status ' + s;
          }
        }
      }
    } catch (e) {
      console.warn("Meter API error:", e);
    }
  }

  function hideTooltip(force) {
    if (force) { pinned = false; tooltip.classList.remove('pinned'); }
    if (!pinned) {
      tooltip.classList.remove('show');
      tooltip.dataset.currentMeter = '';
    }
  }

  if (ttClose) {
    // Remove existing event listeners by replacing with clone if function is re-called,
    // though since it's called once upon load, standard addEventListener is fine.
    ttClose.addEventListener('click', function (e) { e.stopPropagation(); hideTooltip(true); });
  }

  document.querySelectorAll('#dpl1-layout-container .fm-meter-icon').forEach(function (el) {
    el.addEventListener('mouseenter', function () { if (!pinned) showTooltip(el, false); });
    el.addEventListener('mouseleave', function () { if (!pinned) hideTooltip(false); });
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pinned && tooltip.dataset.currentMeter === el.dataset.name) {
        hideTooltip(true); return;
      }
      showTooltip(el, true);
    });
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      showTooltip(el, true);
    }, { passive: false });
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.fm-meter-icon') && !e.target.closest('#dpl1-fm-tooltip')) {
      hideTooltip(true); tooltip.dataset.currentMeter = '';
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hideTooltip(true); tooltip.dataset.currentMeter = ''; }
  });
}
