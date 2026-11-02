// Todas las redes juntas, con reparto al azar por carrera. node liga.js <carreras por mundo> <semilla> [carpeta de redes alternas para un cupo: cupo=ruta ...]
const R=__dirname+'/base/',fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(R+'sim');
const F=process.env.FS?(([a,b,c,d])=>({corredor:a,picaro:b,bravo:c,muybravo:d}))(process.env.FS.split(',').map(Number)):{corredor:.97,picaro:.96,bravo:1.03,muybravo:1.1},sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS),N=+process.argv[2]||50,seed=+process.argv[3]||777;
const CUPOS=['corredor.1','corredor.2','picaro.1','picaro.2','bravo.1','bravo.2','muybravo.1','muybravo.2'];
const ruta={};for(const c of CUPOS)ruta[c]=__dirname+'/'+c+'/red_final.json';
for(const a of process.argv.slice(4)){const [c,p]=a.split('=');ruta[c]=p;}
const B={};for(const c of CUPOS)B[c]=JSON.parse(fs.readFileSync(ruta[c]));
const rng=mulberry32(seed);Math.random=mulberry32(seed+1);const st={};
for(const wd of worlds)for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],wd),gt=drawGates(6,rng);
 const baraja=CUPOS.slice();for(let i=7;i>0;i--){const j=Math.floor(rng()*(i+1));[baraja[i],baraja[j]]=[baraja[j],baraja[i]];}
 const reparto=baraja.slice(0,6),hs=reparto.map((c,i)=>new Horse(tr,B[c],{id:i,form:F[c.split('.')[0]]*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));
 const max=FPS*80;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 const rk=x=>x.finished?x.finishTick:1e9-x.total,ord=hs.slice().sort((a,c)=>rk(a)-rk(c));
 hs.forEach((h,i)=>{for(const key of [reparto[i],reparto[i].split('.')[0]]){const s=st[key]=st[key]||{n:0,w:0,p:0,g:0,re:0,f:0,tr:0,j:0,d:0,t:0};const pl=ord.indexOf(h);s.n++;if(pl===0)s.w++;if(pl<3)s.p++;s.g+=h.hitsGiven;s.re+=h.hitsTaken;s.f+=h.falls;s.tr+=h.stumbles;s.j+=h.jumps;s.d+=h.dodges;s.t+=h.finished?h.finishTick/FPS:80;}});}
for(const k of Object.keys(st).sort()){const s=st[k],m=x=>(x/s.n).toFixed(2);console.log(k.padEnd(11),'n',String(s.n).padStart(4),'gana',(s.w/s.n*100).toFixed(0).padStart(3)+'%','podio',(s.p/s.n*100).toFixed(0).padStart(3)+'%','golpes',m(s.g),'recibe',m(s.re),'salidas',m(s.f),'trop',m(s.tr),'salta',m(s.j),'esq',m(s.d),'t',m(s.t));}
