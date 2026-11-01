// Qué tan interesante es la carrera. node carrera.js <raíz> <carreras por mundo> [piloto]
const R=process.argv[2]+'/',N=+process.argv[3];
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES,loadBrains,loadHandicap}=require(R+'establo');
const brains=loadBrains(()=>{}),hc=loadHandicap(),sizes=['corta','media','larga'],PERS=['corredor','picaro','bravo','muybravo'];
const worlds=Object.keys(MUNDOS),rng=mulberry32(4242);Math.random=mulberry32(4243);
let races=0,Tt=0,n=0,fa=0,st=0,mu=0,hi=0,dnf=0,g=0,g2=0,gn=0,top=0,lead=0,leadHalf=0,leadQ=0,last=0,gap=0;const win={};PERS.forEach(p=>win[p]=0);let inTop=0;
for(const w of worlds)for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),gg=drawGates(6,rng);
 const hs=brains.map((b,i)=>new Horse(tr,b,{id:i,form:hc[i]*(.93+rng()*.14),lane:laneOffset(gg[i],6)}));
 const max=FPS*(tr.size==='larga'?95:75);let t=0,cur=-1,ch=0,atHalf=-1,atQ=-1;
 while(t<max&&!hs.every(h=>h.finished)){t++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}
  if(t%FPS===0){const pr=hs.map(h=>h.finished?tr.laps+1/h.finishTick:h.laps),l=pr.indexOf(Math.max(...pr)),fr=Math.max(...hs.map(h=>h.laps))/tr.laps;
   if(fr>.1){if(cur>=0&&l!==cur)ch++;cur=l;}if(atHalf<0&&fr>=.5)atHalf=l;if(atQ<0&&fr>=.75)atQ=l;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,best=hs.reduce((a,b,i)=>rk(b)<rk(hs[a])?i:a,0),order=hs.map(rk).sort((a,b)=>a-b).filter(x=>x<1e8);
 win[HORSES[best].pers]++;races++;lead+=ch;if(atHalf===best)leadHalf++;if(atQ===best)leadQ++;if(order.length>1)gap+=(order[order.length-1]-order[0])/FPS;
 hs.forEach(h=>{n++;Tt+=(h.finished?h.finishTick:max)/FPS;if(!h.finished)dnf++;fa+=h.falls;st+=h.stumbles;mu+=h.mudHits;hi+=h.hitsGiven;
  g+=h.gasSum;g2+=h.gasSq;gn+=h.gasN;top+=h.gasTop;});}
const mg=g/gn,sd=Math.sqrt(Math.max(0,g2/gn-mg*mg));
console.log(`t ${(Tt/n).toFixed(1)}s nolleg ${(dnf/n*100).toFixed(1)}% sale ${(fa/n).toFixed(2)} trop ${(st/n).toFixed(2)} pisa ${(mu/n).toFixed(1)} da ${(hi/n).toFixed(1)}\n gas medio ${(mg*100).toFixed(0)}% desv ${(sd*100).toFixed(0)} a fondo ${(top/gn*100).toFixed(0)}% | cambios de lider ${(lead/races).toFixed(2)} lider 50% gana ${(leadHalf/races*100).toFixed(0)}% lider 75% gana ${(leadQ/races*100).toFixed(0)}% dif 1-ult ${(gap/races).toFixed(1)}s | gana ${PERS.map(p=>p+' '+(win[p]/races/HORSES.filter(h=>h.pers===p).length*100).toFixed(0)).join(' ')}`);
