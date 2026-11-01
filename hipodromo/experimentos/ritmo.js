// ¿Dosifican? Acelerador por tramo de carrera y aguante al llegar. node ritmo.js <raíz> <carreras por mundo>
const R=process.argv[2]+'/',N=+process.argv[3];
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES,loadBrains,loadHandicap}=require(R+'establo');
const brains=loadBrains(()=>{}),hc=loadHandicap(),sizes=['corta','media','larga'],PERS=['corredor','picaro','bravo','muybravo'];
const rng=mulberry32(99);Math.random=mulberry32(98);const G={},A={},C={},U={};PERS.forEach(p=>{G[p]=[0,0,0,0];C[p]=[0,0,0,0];A[p]=[0,0];U[p]=[0,0];});
for(const w of Object.keys(MUNDOS))for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),g=drawGates(6,rng);
 const hs=brains.map((b,i)=>new Horse(tr,b,{id:i,form:hc[i]*(.93+rng()*.14),lane:laneOffset(g[i],6)}));const max=FPS*95;let t=0;
 while(t<max&&!hs.every(h=>h.finished)){t++;stepRace(hs);hs.forEach((h,i)=>{const p=HORSES[i].pers;if(!h.finished){const q=Math.min(3,Math.floor(h.laps/tr.laps*4));G[p][q]+=(h.gas+1)/2;C[p][q]++;U[p][0]+=h.aguante<.3?1:0;U[p][1]++;}if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;A[p][0]+=h.aguante;A[p][1]++;}});}}
for(const p of PERS)console.log(p.padEnd(9),'acelerador por cuarto',G[p].map((x,i)=>(x/C[p][i]*100).toFixed(0)+'%').join(' '),'| aguante al llegar',(A[p][0]/A[p][1]).toFixed(2),'| cansado',(U[p][0]/U[p][1]*100).toFixed(0)+'%');
