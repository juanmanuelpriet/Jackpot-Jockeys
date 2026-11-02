// Sin maestro: una red mejora compitiendo, con estrategias evolutivas de perturbaciones en espejo. node es.js <cupo> <generaciones> <salida> [red inicial]
// GEN, POB, CARR, SIGMA, LR e HILOS ajustan el costo. Los rivales son las demás redes de la liga, congeladas.
const R=__dirname+'/base/',fs=require('fs'),{Worker,isMainThread,parentPort,workerData}=require('worker_threads');
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const F={corredor:.97,picaro:.96,bravo:1.03,muybravo:1.1},sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS);
const CUPOS=['corredor.1','corredor.2','picaro.1','picaro.2','bravo.1','bravo.2','muybravo.1','muybravo.2'];
// Qué premia cada personalidad, además del puesto: golpear, salir de pista, tropezar
const PREMIO={corredor:{g:-.05,f:-.10,t:-.05},picaro:{g:.06,f:-.12,t:-.03},bravo:{g:.12,f:-.02,t:-.03},muybravo:{g:.18,f:0,t:-.02}};
const leer=c=>JSON.parse(fs.readFileSync(process.env.RIV?process.env.RIV+'/'+c+'.json':__dirname+'/'+c+'/red_final.json'));
const plano=b=>{const v=[];for(const l of b){for(const f of l.W)v.push(...f);v.push(...l.b);}return Float64Array.from(v)};
const volcar=(b,v)=>{let i=0;return b.map(l=>({...l,W:l.W.map(f=>f.map(()=>v[i++])),b:l.b.map(()=>v[i++])}))};
function carrera(me,pers,rivales,seed){const rng=mulberry32(seed);Math.random=mulberry32(seed+1);
 const wd=worlds[Math.floor(rng()*worlds.length)],tr=new Track(Math.floor(rng()*1e6),null,sizes[Math.floor(rng()*3)],wd),gt=drawGates(6,rng);
 const ri=rivales.slice();for(let i=ri.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[ri[i],ri[j]]=[ri[j],ri[i]];}
 const lista=ri.slice(0,5).map(x=>[x.b,x.p]).concat([[me,pers]]),hs=lista.map(([b,p],i)=>new Horse(tr,b,{id:i,form:F[p]*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));
 const max=FPS*80;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,x=hs[5],pl=1+hs.filter(o=>rk(o)<rk(x)).length,P=PREMIO[pers];
 return {pl,g:x.hitsGiven,f:x.falls,t:x.stumbles,j:x.jumps,d:x.dodges,valor:(6-pl)/5+(pl===1?.5:0)+.01*(x.jumps+x.dodges)+P.g*x.hitsGiven+P.f*x.falls+P.t*x.stumbles};}
if(!isMainThread){const {molde,pers,rivales}=workerData;
 parentPort.on('message',({id,v,seeds})=>{const me=volcar(molde,v);let s=0,pl=0,w=0,p3=0,g=0,f=0,t=0,j=0,d=0;for(const se of seeds){const r=carrera(me,pers,rivales,se);s+=r.valor;pl+=r.pl;if(r.pl===1)w++;if(r.pl<=3)p3++;g+=r.g;f+=r.f;t+=r.t;j+=r.j;d+=r.d;}
  const n=seeds.length;parentPort.postMessage({id,s:s/n,pl:pl/n,w:w/n,p3:p3/n,g:g/n,f:f/n,t:t/n,j:j/n,d:d/n});});return;}
const [cupo,GensS,salida,inicial]=process.argv.slice(2),Gens=+GensS,pers=cupo.split('.')[0];
const POB=+process.env.POB||16,CARR=+process.env.CARR||6,SIGMA=+process.env.SIGMA||.02,LR=+process.env.LR||.003,HILOS=+process.env.HILOS||2,VAL=+process.env.VAL||240,CADA=+process.env.CADA||20;
const molde=inicial?JSON.parse(fs.readFileSync(inicial)):leer(cupo),rivales=CUPOS.filter(c=>c!==cupo).map(c=>({b:leer(c),p:c.split('.')[0]}));
const hilos=[...Array(HILOS)].map(()=>new Worker(__filename,{workerData:{molde,pers,rivales}}));
function lote(tareas){return new Promise(ok=>{const res=[];let sig=0,hechas=0;const dar=w=>{if(sig<tareas.length){const id=sig++;w.postMessage({id,...tareas[id]});}};
 for(const w of hilos){w.removeAllListeners('message');w.on('message',m=>{res[m.id]=m;hechas++;if(hechas===tareas.length)ok(res);else dar(w);});dar(w);}});}
const parte=(v,seeds,n)=>{const a=[];for(let i=0;i<n;i++)a.push({v,seeds:seeds.slice(i*seeds.length/n|0,(i+1)*seeds.length/n|0)});return a};
const unir=r=>{const n=r.length,o={};for(const k of ['s','pl','w','p3','g','f','t','j','d'])o[k]=r.reduce((a,x)=>a+x[k],0)/n;return o};
const fmt=o=>`valor ${o.s.toFixed(3)} gana ${(o.w*100).toFixed(1)}% podio ${(o.p3*100).toFixed(1)}% puesto ${o.pl.toFixed(2)} golpes ${o.g.toFixed(2)} salidas ${o.f.toFixed(2)} trop ${o.t.toFixed(2)} salta ${o.j.toFixed(1)} esq ${o.d.toFixed(1)}`;
(async()=>{const th=plano(molde),th0=th.slice(),m=new Float64Array(th.length),s2=new Float64Array(th.length),rng=mulberry32(4242+cupo.length*17+cupo.charCodeAt(0)+(+cupo.slice(-1))*1009);
 const gauss=()=>Math.sqrt(-2*Math.log(1-rng()))*Math.cos(2*Math.PI*rng());
 const sv=[...Array(VAL)].map((_,i)=>900000000+i*7);
 const base=unir(await lote(parte(th0,sv,HILOS*2)));console.log(cupo,'inicio',fmt(base));
 let mejor=base.s,t0=Date.now();
 for(let g=1;g<=Gens;g++){const seeds=[...Array(CARR)].map(()=>Math.floor(rng()*8e8)),eps=[],tareas=[];
  for(let i=0;i<POB;i++){const e=new Float64Array(th.length);for(let k=0;k<e.length;k++)e[k]=gauss();eps.push(e);for(const sg of [1,-1]){const v=new Float64Array(th.length);for(let k=0;k<v.length;k++)v[k]=th[k]+sg*SIGMA*e[k];tareas.push({v,seeds});}}
  const r=await lote(tareas),orden=r.map((x,i)=>[x.s,i]).sort((a,b)=>a[0]-b[0]),rango=new Float64Array(r.length);orden.forEach(([,i],q)=>rango[i]=q/(r.length-1)-.5);
  const gr=new Float64Array(th.length);for(let i=0;i<POB;i++){const d=rango[2*i]-rango[2*i+1];for(let k=0;k<gr.length;k++)gr[k]+=d*eps[i][k];}
  for(let k=0;k<gr.length;k++){const q=gr[k]/(2*POB*SIGMA);m[k]=.9*m[k]+.1*q;s2[k]=.999*s2[k]+.001*q*q;const mh=m[k]/(1-Math.pow(.9,g)),sh=s2[k]/(1-Math.pow(.999,g));th[k]+=LR*mh/(Math.sqrt(sh)+1e-8);}
  if(g%CADA===0||g===Gens){const o=unir(await lote(parte(th,sv,HILOS*2)));let dist=0;for(let k=0;k<th.length;k++)dist+=(th[k]-th0[k])**2;
   console.log(cupo,'gen',g,fmt(o),'dist',Math.sqrt(dist/th.length).toFixed(4),((Date.now()-t0)/g/1000).toFixed(1)+'s/gen');
   fs.writeFileSync(salida.replace('.json','_'+g+'.json'),JSON.stringify(volcar(molde,th)));
   if(o.s>mejor){mejor=o.s;fs.writeFileSync(salida,JSON.stringify(volcar(molde,th)));}}}
 process.exit(0);})();
