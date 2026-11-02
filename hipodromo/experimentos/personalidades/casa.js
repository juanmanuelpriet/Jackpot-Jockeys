// ¿Alguna estrategia le gana a la casa con las cuotas por victorias? node casa.js <carpeta> <carreras> <semilla>
const R=process.argv[2]+'/',fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {repartir,loadPerfiles,loadHandicapPers,loadWorldEdges}=require(R+'establo');const {winFactor,recordRace,payFactors,oddsFor}=require(R+'cuotas');
const sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS),B=loadPerfiles(),HP=loadHandicapPers(),E=loadWorldEdges(),N=+process.argv[3],seed=+process.argv[4];
const rng=mulberry32(seed);Math.random=mulberry32(seed+1);const rec={},norm=a=>{const s=a.reduce((x,y)=>x+y,0);return a.map(x=>x/s)};
const out={};const add=(fase,k,st,ret)=>{const o=(out[fase+'|'+k]=out[fase+'|'+k]||[0,0]);o[0]+=st;o[1]+=ret};
const P=[0,1,2,3,4,5],pairs=P.flatMap(i=>P.filter(j=>j!==i).map(j=>[i,j])),tris=pairs.flatMap(([i,j])=>P.filter(k=>k!==i&&k!==j).map(k=>[i,j,k]));
const hit={ganador:(s,o)=>o[0]===s[0],place:(s,o)=>o.slice(0,2).includes(s[0]),podio:(s,o)=>o.slice(0,3).includes(s[0]),quiniela:(s,o)=>o.slice(0,2).includes(s[0])&&o.slice(0,2).includes(s[1]),exacta:(s,o)=>o[0]===s[0]&&o[1]===s[1],trifecta:(s,o)=>o[0]===s[0]&&o[1]===s[1]&&o[2]===s[2]};
const sels={ganador:P.map(i=>[i]),place:P.map(i=>[i]),podio:P.map(i=>[i]),quiniela:pairs.filter(([i,j])=>i<j),exacta:pairs,trifecta:tris};
let L=repartir(rng);for(let c=0;c<N;c++){const race=c%10+1;if(c%10===0)L=repartir(rng);const wd=worlds[Math.floor(rng()*worlds.length)],tr=new Track(Math.floor(rng()*1e6),null,sizes[c%3],wd),gt=drawGates(6,rng),by=E[wd]?.edge||{};
 const exp=norm(L.map(h=>by[h.pers]||1)),p=race<=1?P.map(()=>1/6):norm(exp.map((x,i)=>x*winFactor(rec[L[i].slot]))),pay=payFactors(race,1,6);
 const hs=L.map((x,i)=>new Horse(tr,B[x.slot],{id:i,form:HP[x.pers]*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));
 const max=FPS*90;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,ord=P.slice().sort((a,c)=>rk(hs[a])-rk(hs[c]));
 const fase=race<5?'1-4':'5+';
 for(const t in sels){const odd=sels[t].map(s=>oddsFor(t,s,p,pay));
  sels[t].forEach((s,i)=>add(fase,t+' a todo',1,hit[t](s,ord)?odd[i]:0));
  const fav=odd.indexOf(Math.min(...odd)),lar=odd.indexOf(Math.max(...odd));
  add(fase,t+' favorito',1,hit[t](sels[t][fav],ord)?odd[fav]:0);add(fase,t+' mas paga',1,hit[t](sels[t][lar],ord)?odd[lar]:0);}
 ord.forEach((i,pl)=>{rec[L[i].slot]=recordRace(rec[L[i].slot],pl===0,exp[i])});}
console.log(JSON.stringify({out,rec}));
