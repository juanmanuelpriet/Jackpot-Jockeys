// Los seis caballos conducidos por la heurística con su personalidad, todos con la misma forma base
const R=__dirname+'/base/',fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES}=require(R+'establo');const {conEstilo}=require(R+'piloto');
const sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS),N=+process.argv[2]||15,brain=JSON.parse(fs.readFileSync(R+'caballos_corredor.json'))[0];
const F={corredor:+(process.env.F_C||.97),picaro:+(process.env.F_P||.96),bravo:+(process.env.F_B||1.03),muybravo:+(process.env.F_M||1.1)};
const rng=mulberry32(7);Math.random=mulberry32(9);const st={};
for(const wd of worlds)for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],wd),gt=drawGates(6,rng);
 const hs=HORSES.map((x,i)=>{const h=new Horse(tr,brain,{id:i,form:F[x.pers]*(.93+rng()*.14),lane:laneOffset(gt[i],6)});h.piloto=conEstilo(x.pers);return h;});
 const max=FPS*80;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,win=hs.reduce((a,b)=>rk(b)<rk(a)?b:a);
 hs.forEach((h,i)=>{const p=HORSES[i].pers,s=st[p]=st[p]||{n:0,w:0,g:0,t:0,f:0};s.n++;if(h===win)s.w++;s.g+=h.hitsGiven;s.t+=h.hitsTaken;s.f+=h.falls;s.j=(s.j||0)+h.jumps;s.d=(s.d||0)+h.dodges;s.st=(s.st||0)+h.stumbles;s.m=(s.m||0)+h.mudHits;});}
for(const p in st){const s=st[p];console.log(p.padEnd(9),"gana",(s.w/s.n*100).toFixed(0)+"%","golpes",(s.g/s.n).toFixed(2),"recibe",(s.t/s.n).toFixed(2),"salidas",(s.f/s.n).toFixed(2),"salta",(s.j/s.n).toFixed(1),"esquiva",(s.d/s.n).toFixed(1),"tropieza",(s.st/s.n).toFixed(1),"pisa",(s.m/s.n).toFixed(1));}
