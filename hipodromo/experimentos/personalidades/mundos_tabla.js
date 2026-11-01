// Promedio por caballo y carrera en cada mundo con los cerebros y el hándicap del juego. node mundos_tabla.js <carpeta> <carreras por mundo>
const R=process.argv[2]+'/';const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES,loadBrains,loadHandicap}=require(R+'establo');const sizes=['corta','media','larga'],b=loadBrains(()=>{}),hc=loadHandicap(),N=+process.argv[3];
const rng=mulberry32(77);Math.random=mulberry32(78);
for(const w of Object.keys(MUNDOS)){let t=0,no=0,f=0,s=0,m=0,g=0,n=0;for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),gt=drawGates(6,rng);
 const hs=HORSES.map((x,i)=>new Horse(tr,b[i],{id:i,form:hc[i]*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));const max=FPS*90;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 for(const h of hs){n++;if(h.finished)t+=h.finishTick/FPS;else no++;f+=h.falls;s+=h.stumbles;m+=h.mudHits;g+=h.hitsGiven;}}
 console.log(w.padEnd(10),'tiempo',(t/(n-no)).toFixed(1),'nollega',(no/n*100).toFixed(1)+'%','salidas',(f/n).toFixed(1),'tropiezos',(s/n).toFixed(1),'pisados',(m/n).toFixed(1),'golpes',(g/n).toFixed(1));}
