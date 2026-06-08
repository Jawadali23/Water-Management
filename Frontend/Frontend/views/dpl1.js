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

function initDpl1LayoutFrame() {
  var view = document.getElementById('view-dpl1') || document.body;
  var card = view.querySelector('.dpl1-layout-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'rc-card dpl1-layout-card';
    card.innerHTML = '<div class="rc-hdr"><div class="rc-left dpl1-layout-title-wrap"><div class="rc-ico dpl1-layout-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 20V9l5 3V8l5 4V6l4 3v11"/><path d="M8 16h2M13 16h2M18 16h1"/><path d="M7 5.5C7 3.9 8.4 3 9.7 3h4.6C15.6 3 17 3.9 17 5.5"/><path d="M12 12.5s-2.2 2.3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1.7-2.2-4-2.2-4z"/></svg></div><div><div class="rc-title">DPL 1 Water Flow Layout</div></div></div><a class="dpl1-open-layout-btn" href="views/dpl1-layout.html?v=20260603-full-fit" target="_blank" rel="noopener" aria-label="Open DPL 1 layout in new page">Open Layout <span aria-hidden="true">↗</span></a></div>' +
      '<iframe class="dpl1-layout-frame" src="views/dpl1-layout.html?v=20260603-full-fit" data-alt-src="dpl1-layout.html?v=20260603-full-fit" title="DPL 1 Water Flow Layout"></iframe>' +
      '<div class="dpl1-layout-fallback"><a href="views/dpl1-layout.html" target="_blank" rel="noopener">Open DPL-1 layout</a></div>';
    view.appendChild(card);
  }
  card.style.display = 'block';
  var frame = card.querySelector('.dpl1-layout-frame');
  if (!frame || frame.dataset.layoutInit === '1') return;
  frame.dataset.layoutInit = '1';
  frame.addEventListener('error', function () {
    var alt = frame.getAttribute('data-alt-src');
    if (alt && frame.getAttribute('src') !== alt) frame.setAttribute('src', alt);
  });
  function syncLayoutHeight() {
    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      if (!doc || !doc.body) return;
      var canvasWrap = doc.querySelector('.canvas-wrap');
      var controls = doc.querySelector('.controls');
      var contentHeight = Math.ceil(
        (canvasWrap ? canvasWrap.getBoundingClientRect().height : doc.body.scrollHeight) +
        (controls ? controls.getBoundingClientRect().height + 28 : 34)
      );
      if (contentHeight > 360) frame.style.height = Math.min(Math.max(contentHeight, 700), 820) + 'px';
    } catch (e) {
      /* Same-origin iframe is expected; fixed CSS height is the fallback. */
    }
  }
  frame.addEventListener('load', function () {
    syncLayoutHeight();
    setTimeout(syncLayoutHeight, 180);
    setTimeout(syncLayoutHeight, 600);
  });
  window.addEventListener('resize', syncLayoutHeight);
  setTimeout(function () {
    try {
      var doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
      var empty = !doc || !doc.body || !doc.body.children.length;
      if (empty && frame.getAttribute('data-alt-src')) frame.setAttribute('src', frame.getAttribute('data-alt-src'));
      else syncLayoutHeight();
    } catch (e) {
      /* Cross-origin is not expected here; leave the iframe visible if browser blocks inspection. */
    }
  }, 900);
}
