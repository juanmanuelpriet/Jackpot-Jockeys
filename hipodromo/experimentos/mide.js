// Mide un corredor contra rivales fijos y pistas iguales. node mide.js <carpeta de código> <archivo cerebro|H>  (env de la variante)
const R=process.argv[2]+'/',who=process.argv[3],fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,upgradeBrain,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES}=require(R+'establo');const {piloto}=require(R+'piloto');
const base=process.env.ARQ_BASE+'/',hcj=JSON.parse(fs.readFileSync(base+'handicap.json'));
const rivals=HORSES.slice(0,5).map(h=>upgradeBrain(JSON.parse(fs.readFileSync(base+h.cerebro[0]))[h.cerebro[1]])),hc=HORSES.map(h=>hcj[h.name]??1);
const me=who==='H'?rivals[0]:upgradeBrain(JSON.parse(fs.readFileSync(who))[0]);
const sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS),byW={};
const rng=mulberry32(31337);Math.random=mulberry32(5150);let T=0,n=0,fa=0,st=0,mu=0;
for(const w of worlds){let tw=0;for(let r=0;r<20;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),h=new Horse(tr,me,{id:0,form:1,lane:0});if(who==='H')h.piloto=piloto;
 const max=FPS*90;let t=0;while(t<max&&!h.finished){t++;stepRace([h]);if(h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const s=(h.finished?h.finishTick:max)/FPS;T+=s;tw+=s;n++;fa+=h.falls;st+=h.stumbles;mu+=h.mudHits;}byW[w]=(tw/20).toFixed(1);}
let wn=0,pl=0,m=0;for(const w of worlds)for(let r=0;r<30;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),g=drawGates(6,rng);
 const hs=[...rivals,me].map((b,i)=>new Horse(tr,b,{id:i,form:i<5?hc[i]*(.93+rng()*.14):1,lane:laneOffset(g[i],6)}));if(who==='H')hs[5].piloto=piloto;
 const max=FPS*(tr.size==='larga'?80:60);let t=0;while(t<max&&!hs.every(h=>h.finished)){t++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,p=1+hs.filter(x=>rk(x)<rk(hs[5])).length;pl+=p;m++;if(p===1)wn++;}
console.log([(process.env.ARQ_NOMBRE||who).padEnd(20),(T/n).toFixed(2),(fa/n).toFixed(2),(st/n).toFixed(2),(mu/n).toFixed(1),(wn/m*100).toFixed(0)+'%',(pl/m).toFixed(2),Object.values(byW).join(' ')].join('\t'));
