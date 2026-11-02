// Estadísticas por personalidad con el hándicap del juego. node stats.js <carpeta> <carreras por mundo> [potro corredor|bravo]
const R=process.argv[2]+'/',fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {repartir,loadPerfiles,loadHandicapPers,POTROS,loadColtBrain}=require(R+'establo');
const sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS),N=+process.argv[3],potro=process.argv[4],B=loadPerfiles(),HP=loadHandicapPers();
const rng=mulberry32(2026);Math.random=mulberry32(99);const st={},tiempos={};
for(const wd of worlds)for(let r=0;r<N;r++){const sz=sizes[r%3],tr=new Track(Math.floor(rng()*1e6),null,sz,wd),gt=drawGates(6,rng),L=repartir(rng);
 const hs=L.map((x,i)=>new Horse(tr,potro&&i===0?loadColtBrain(potro):B[x.slot],{id:i,form:(potro&&i===0?(+process.env.PH||POTROS[potro].handicap):HP[x.pers])*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));
 const max=FPS*90;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,ord=hs.slice().sort((a,c)=>rk(a)-rk(c)),gap=(rk(ord[1])-rk(ord[0]))/FPS;(tiempos.g=tiempos.g||[]).push(gap);
 hs.forEach((h,i)=>{const p=(potro&&i===0)?'POTRO':L[i].pers,s=st[p]=st[p]||{n:0,podio:0,g:0,t:0,f:0,tr:0,w:{corta:0,media:0,larga:0},nz:{corta:0,media:0,larga:0}};s.n++;s.nz[sz]++;const pl=ord.indexOf(h);if(pl<3)s.podio++;if(pl===0)s.w[sz]++;s.g+=h.hitsGiven;s.t+=h.hitsTaken;s.f+=h.falls;s.tr+=h.stumbles;});}
for(const p of Object.keys(st)){const s=st[p],pc=z=>(s.w[z]/s.nz[z]*100).toFixed(0);console.log(p.padEnd(9),'n',s.n,'podio',(s.podio/s.n*100).toFixed(0)+'%','golpes',(s.g/s.n).toFixed(2),'recibe',(s.t/s.n).toFixed(2),'salidas',(s.f/s.n).toFixed(2),'tropiezos',(s.tr/s.n).toFixed(2),'gana c/m/l',pc('corta'),pc('media'),pc('larga'));}
console.log('ventaja del ganador',(tiempos.g.reduce((a,c)=>a+c,0)/tiempos.g.length).toFixed(2)+' s');
