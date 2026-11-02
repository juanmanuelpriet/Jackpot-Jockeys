// Mide cada red como sexto caballo contra la casa actual, con su velocidad de personalidad, y la casa misma como referencia
const R=__dirname+'/base/',fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,upgradeBrain,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES,loadBrains,loadHandicap}=require(R+'establo');
const F={corredor:.97,picaro:.96,bravo:1.03,muybravo:1.1},sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS),N=+process.env.N||50;
const all=loadBrains(()=>{}),hc=loadHandicap();
const tests=process.argv.slice(2).map(c=>[c,JSON.parse(fs.readFileSync(c+'/red_final.json')),c.split('.')[0],0]);
HORSES.forEach((h,i)=>tests.push(['actual:'+h.pers+':'+i,all[i],h.pers,1,i]));
for(const [c,me,pers,old,idx] of tests){const house=old?all.filter((_,j)=>j!==idx):all.slice(0,5),hh=old?hc.filter((_,j)=>j!==idx):hc.slice(0,5);
 const rng=mulberry32(31337);Math.random=mulberry32(5150);let w=0,g=0,t=0,fa=0,st=0,pl=0,m=0,j=0,d=0,p3=0,mud=0;
 for(const wd of worlds)for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],wd),gt=drawGates(6,rng);
  const hs=[...house,me].map((b,i)=>new Horse(tr,b,{id:i,form:(i<5?hh[i]:F[pers])*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));
  const max=FPS*80;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
  const rk=x=>x.finished?x.finishTick:1e9-x.total,x=hs[5],p=1+hs.filter(o=>rk(o)<rk(x)).length;m++;pl+=p;if(p===1)w++;if(p<=3)p3++;g+=x.hitsGiven;t+=x.hitsTaken;fa+=x.falls;st+=x.stumbles;j+=x.jumps;d+=x.dodges;mud+=x.mudHits;}
 console.log(c.padEnd(22),'gana',(w/m*100).toFixed(0).padStart(3)+'%','podio',(p3/m*100).toFixed(0).padStart(3)+'%','puesto',(pl/m).toFixed(2),'golpes',(g/m).toFixed(2),'recibe',(t/m).toFixed(2),'salidas',(fa/m).toFixed(2),'trop',(st/m).toFixed(2),'pisa',(mud/m).toFixed(2),'salta',(j/m).toFixed(1),'esq',(d/m).toFixed(1));}
