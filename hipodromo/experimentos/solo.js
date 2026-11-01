// Solo en la pista y con rivales: heurística contra redes. node solo.js <raíz> <solo por mundo> <con rivales por mundo>
const R=process.argv[2]+'/',NS=+process.argv[3],NR=+process.argv[4];
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES,loadBrains,loadHandicap}=require(R+'establo');const {piloto}=require(R+'piloto');
const brains=loadBrains(()=>{}),hc=loadHandicap(),sizes=['corta','media','larga'];
console.log('mundo      ideal | H.tiempo sale trop pisa saltos vel% | DonG.tiempo sale trop pisa | Herr.tiempo | H con rivales: gana puesto');
for(const w of Object.keys(MUNDOS)){const row=[];let ideal=0;
 for(const who of ['H',0,1]){const rng=mulberry32(7);Math.random=mulberry32(8);let T=0,n=0,fa=0,st=0,mu=0,ju=0,sp=0,tk=0;ideal=0;
  for(let r=0;r<NS;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w);
   const h=new Horse(tr,who==='H'?brains[0]:brains[who],{id:0,form:1,lane:0});if(who==='H')h.piloto=piloto;
   const max=FPS*90;let t=0;while(t<max&&!h.finished){t++;stepRace([h]);sp+=h.speed;tk++;if(h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
   let L=0;for(let k=0;k<tr.path.length;k++){const a=tr.path[k],b=tr.path[(k+1)%tr.path.length];L+=Math.hypot(a[0]-b[0],a[1]-b[1]);}
   ideal+=L*tr.laps/(9*tr.world.vel)/FPS;T+=(h.finished?h.finishTick:max)/FPS;n++;fa+=h.falls;st+=h.stumbles;mu+=h.mudHits;ju+=h.jumps;}
  row.push(who==='H'?[(T/n).toFixed(1),(fa/n).toFixed(2),(st/n).toFixed(2),(mu/n).toFixed(2),(ju/n).toFixed(1),(sp/tk/(9*MUNDOS[w].vel)*100).toFixed(0)].join(' '):who===0?[(T/n).toFixed(1),(fa/n).toFixed(2),(st/n).toFixed(2),(mu/n).toFixed(2)].join(' '):(T/n).toFixed(1));
 }
 const rng=mulberry32(11);Math.random=mulberry32(12);let wn=0,pl=0;
 for(let r=0;r<NR;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),g=drawGates(6,rng);
  const hs=[...brains.slice(0,5),brains[5]].map((b,i)=>new Horse(tr,b,{id:i,form:(i<5?hc[i]:1)*(i<5?(.93+rng()*.14):1),lane:laneOffset(g[i],6)}));hs[5].piloto=piloto;
  const max=FPS*(tr.size==='larga'?80:60);let t=0;while(t<max&&!hs.every(h=>h.finished)){t++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
  const rk=x=>x.finished?x.finishTick:1e9-x.total,me=hs[5],p=1+hs.filter(x=>rk(x)<rk(me)).length;pl+=p;if(p===1)wn++;}
 console.log(w.padEnd(10),(ideal/NS).toFixed(1),'|',row[0],'|',row[1],'|',row[2],'|',(wn/NR*100).toFixed(0)+'%',(pl/NR).toFixed(2));
}
