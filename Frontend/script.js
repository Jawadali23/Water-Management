// â•â•â• INIT â•â•â•
window.addEventListener('resize',()=>{Object.values(charts).forEach(c=>{try{c.resize();}catch(e){}});});

function init(){
  // Init filter states
  fs['rc1']={p:'monthly',w:'',mo:'',yr:''};
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

  try{
    renderLive(false);
    startLive();
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
