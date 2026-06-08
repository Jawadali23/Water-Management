// ═══ HELPERS ═══
function fmt(n){return Math.round(n).toLocaleString();}
function fmtExact(v){
  if(v==null||v==='')return '0';
  const s=String(v);
  if(!/^[-+]?\d+(\.\d+)?$/.test(s))return s;
  const neg=s.startsWith('-')?'-':'';
  const body=neg?s.slice(1):s;
  const parts=body.split('.');
  const grouped=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');
  return neg+grouped+(parts[1]!==undefined?'.'+parts[1]:'');
}
function seed(n){let x=Math.sin(n+1)*9999;return x-Math.floor(x);}
function gc(){return{grid:'rgba(200,215,235,0.45)',tick:'#8898aa'};}
function dc(id){if(charts[id]){try{charts[id].destroy();}catch(e){}delete charts[id];}}
function touch(){const e=document.getElementById('last-updated');if(e)e.textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour12:false});}
function toggleSidebar(){document.body.classList.toggle('sb-collapsed');setTimeout(()=>{Object.values(charts).forEach(c=>{try{c.resize();}catch(e){}});},280);}
const TT={backgroundColor:'rgba(12,36,97,0.95)',titleColor:'#a0c4f0',titleFont:{family:"'IBM Plex Mono',monospace",size:11,weight:'600'},bodyColor:'#d0e4ff',bodyFont:{family:"'IBM Plex Mono',monospace",size:11},borderColor:'rgba(56,182,255,0.22)',borderWidth:1,padding:11,cornerRadius:9};

function normalizeKey(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');}
function toNumber(v){
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(typeof v==='string'){
    const n=Number(v.replace(/,/g,''));
    return Number.isFinite(n)?n:null;
  }
  return null;
}
function extractValue(v){
  const direct=toNumber(v);
  if(direct!=null)return direct;
  if(Array.isArray(v)){
    for(const item of v){
      const n=extractValue(item);
      if(n!=null)return n;
    }
    return null;
  }
  if(v&&typeof v==='object'){
    const candidateKeys=['value','total','amount','current','count','sum','volume','metricValue','y','percent','percentage','currentValue','currentReading','reading','readingValue','latest','latestValue','val','number','quantity','data'];
    for(const key of candidateKeys){
      if(key in v){
        const n=extractValue(v[key]);
        if(n!=null)return n;
      }
    }
    for(const [k,val] of Object.entries(v)){
      if(/^(value|total|amount|current|count|sum|volume|metric|reading|latest|percent|percentage|quantity|number|val)$/i.test(normalizeKey(k))){
        const n=extractValue(val);
        if(n!=null)return n;
      }
    }
  } 
  return null;
}
function resolveMetricKey(label){
  const k=normalizeKey(label);
  if(!k)return null;
  if(k.includes('freshwatertank')||k.includes('freshwater')||k.includes('waterin')||k==='fwt'||k.includes('intake'))return 'freshWaterTank';
  if(k.includes('withdraw')||k.includes('waterout')||k.includes('pumpout')||k==='wout')return 'withdraw';
  if(k.includes('recyclerate')||k.includes('recyclingrate')||k.includes('recycleratio')||k.includes('recyclingpercentage')||k.includes('recyclingpercent'))return 'recycleRate';
  if(k.includes('recycle')||k.includes('recircul'))return 'recycle';
  if(k.includes('discharge')||k.includes('wastewater')||k.includes('wwtp')||k.includes('reject'))return 'discharge';
  if(k.includes('production')||k.includes('unit')||k.includes('output')||k.includes('pu'))return 'production';
  return null;
}
