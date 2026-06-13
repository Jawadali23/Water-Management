// ═══ DATA ═══
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthly={freshWaterTank:[547,664,770,838,957,1016,994,884,785,957,621,655],withdraw:[580,700,810,880,1000,1060,1040,930,830,1000,660,690],recycle:[99,110,79,111,101,86,70,115,94,147,246,172],discharge:[34,58,96,100,99,98,78,85,74,120,82,69]};
const monthly2={freshWaterTank:[480,560,640,710,820,890,860,780,700,830,550,600],withdraw:[510,590,672,748,860,935,902,820,738,872,580,632],recycle:[80,92,65,94,84,70,58,98,78,124,208,142],discharge:[28,48,82,88,86,84,66,72,62,104,70,58]};
const monthlyU={freshWaterTank:[180,220,280,310,360,400,380,340,300,360,210,100],withdraw:[190,232,295,326,378,420,399,357,315,378,220,105],recycle:[32,38,28,40,36,30,24,42,34,52,88,62],discharge:[12,18,32,36,30,28,24,26,22,38,24,10]};
const kpiMeta={freshWaterTank:{label:'Fresh Water Tank',icon:'&#128167;',tag:'Intake',line:'#38b6ff'},withdraw:{label:'Withdraw',icon:'&#128260;',tag:'Pumped out',line:'#a78bfa'},recycle:{label:'Recycle',icon:'&#9851;&#65039;',tag:'Recovered',line:'#6ee7b7'},discharge:{label:'Discharge',icon:'&#11015;&#65039;',tag:'WWTP out',line:'#fbbf24'}};
const factoryData={dpl1:{monthly:[547,664,770,838,957,1016,994,884,785,957,621,655],out:[34,58,96,100,99,98,78,85,74,120,82,69]},dpl2:{monthly:[480,560,640,710,820,890,860,780,700,830,550,600],out:[28,48,82,88,86,84,66,72,62,104,70,58]},uril:{monthly:[180,220,280,310,360,400,380,340,300,360,210,100],out:[12,18,32,36,30,28,24,26,22,38,24,10]}};
const now=new Date(),cm=Math.min(now.getMonth(),11),frac=now.getDate()/new Date(now.getFullYear(),now.getMonth()+1,0).getDate();

// ═══ STATE ═══
let activePeriod='td';
let bccMeter='all',bccMeter2='all',bccMeterU='all';
let fccFactory='all',ovRcFactory='all';
let wrMode='all';
let globalFilter={from:null,to:null};
const charts={};
const liveR={wpu:12.5,dpu:3.8,wpu2:10.2,dpu2:3.1,wpuU:4.2,dpuU:1.1};
const fs={};
const API=(window.__WMS_CONFIG__ && window.__WMS_CONFIG__.API_BASE_URL) ? window.__WMS_CONFIG__.API_BASE_URL : 'http://localhost:8001';
const dpl1Api={cards:null,rawCards:null,mainChart:null,recyclingChart:null,loading:null,loadingKey:'',requestSeq:0,error:'',defaultsApplied:false,range:'td'};
function getfs(id){return fs[id]||(fs[id]={p:'daily',w:'',mo:'',yr:''});}

