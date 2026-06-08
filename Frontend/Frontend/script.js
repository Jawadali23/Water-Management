// ═══ DYNAMIC VIEW LOADER ═══
async function loadView(elementId, filePath) {
  try {
    const sep = filePath.includes('?') ? '&' : '?';
    const response = await fetch(filePath + sep + 'v=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
    }
    const html = await response.text();
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = html;
    }
  } catch (error) {
    console.error(`Error loading view ${elementId}:`, error);
    const element = document.getElementById(elementId);
    if (element) {
      if (elementId === 'view-overview' && element.innerHTML.trim()) return;
      element.innerHTML = `<div style="padding: 20px; color: #dc2626; font-weight: 600; text-align: center;">Error loading view. Please verify your web server is running.</div>`;
    }
  }
}

// ═══ INIT ═══
window.addEventListener('resize',()=>{Object.values(charts).forEach(c=>{try{c.resize();}catch(e){}});});

async function init(){
  // Init filter states
  fs['rc1']={p:'monthly',w:'',mo:'',yr:''};
  fs['wr1']={p:'monthly',w:'',mo:'',yr:''};
  fs['rc2']={p:'monthly',w:'',mo:'',yr:''};
  fs['rcU']={p:'monthly',w:'',mo:'',yr:''};
  fs['ovrc']={p:'monthly',w:'',mo:'',yr:''};
  fs['bcc']={p:'daily',w:'',mo:'',yr:''};
  fs['bcc2']={p:'daily',w:'',mo:'',yr:''};
  fs['bccU']={p:'daily',w:'',mo:'',yr:''};
  fs['fcc']={p:'daily',w:'',mo:'',yr:''};

  if(typeof Chart==='undefined'){
    console.error('Chart.js not loaded yet, retrying...');
    setTimeout(init,200);
    return;
  }

  // Load the separate HTML views dynamically
  await Promise.all([
    loadView('view-overview', 'views/overview.html'),
    loadView('view-dpl1', 'views/dpl1.html'),
    loadView('view-dpl2', 'views/dpl2.html'),
    loadView('view-uril', 'views/uril.html'),
    loadView('view-review', 'views/review.html')
  ]);

  try{
    // Initialize tooltip and interaction listeners for DPL 1 flow map
    if (typeof initDpl1FlowMap === 'function') {
      initDpl1FlowMap();
    }
    if (typeof initDpl1LayoutFrame === 'function') {
      initDpl1LayoutFrame();
    }

    renderLive(false);
    startLive();
    if(document.querySelector('.view.active')?.id==='view-overview' && typeof renderOverview === 'function') renderOverview();
    if(document.querySelector('.view.active')?.id==='view-dpl1'){renderDpl1Loading();}
    loadDpl1ApiData().then(()=>{if(document.querySelector('.view.active')?.id==='view-dpl1')renderDpl1View();});
    touch();
    setInterval(()=>{const e=document.getElementById('clock');if(e)e.textContent=new Date().toLocaleTimeString('en-US',{hour12:false});},1000);
    // Set initial clock immediately
    const e=document.getElementById('clock');if(e)e.textContent=new Date().toLocaleTimeString('en-US',{hour12:false});
  } catch(err){
    console.error('Init error:',err);
  }
}

// Wait for DOM and Chart.js
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init);
} else {
  init();
}
