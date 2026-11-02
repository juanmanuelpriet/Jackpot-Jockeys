// Potro entrenado contra la casa: podio y retorno de apostarle. node mide.js <perfil> <semilla> <carreras>
const H=require('path').join(__dirname,'../../')+'/',fs=require('fs');
const {Track,Horse,stepRace,drawGates,laneOffset,mulberry32,FPS,MUNDOS}=require(H+'sim');
const {repartir,loadPerfiles,loadHandicapPers,loadWorldEdges,POTROS,loadColtBrain}=require(H+'establo');
const {trainHorse,bodyOpts}=require(H+'evolucion');const {winFactor,recordRace,trainedEdge,payFactors,oddsFor}=require(H+'cuotas');
const [perfil,seedS,NS]=process.argv.slice(2),seed=+seedS,N=+NS,B=loadPerfiles(),HP=loadHandicapPers(),E=loadWorldEdges(),sizes=['corta','media','larga'],worlds=Object.keys(MUNDOS);
const read=f=>JSON.parse(fs.readFileSync(H+f)),co=read('caballos_corredor.json'),riv=[co[0],read('caballos_bravo_100.json')[0],co[1]];
const norm=a=>{const s=a.reduce((x,y)=>x+y,0);return a.map(x=>x/s)};
function mide(brain,body,sem){const rng=mulberry32(sem);Math.random=mulberry32(sem+1);const rec={},base=POTROS[perfil].handicap,ob=bodyOpts(body,base),edge=trainedEdge(body);let w=0,p3=0,f=0,t=0,g=0,st=0,rg=0,rp=0,n5=0;
 for(let c=0;c<N;c++){const race=c%10+1,wd=worlds[Math.floor(rng()*worlds.length)],tr=new Track(Math.floor(rng()*1e6),null,sizes[c%3],wd),gt=drawGates(6,rng),by=E[wd]?.edge||{},L=repartir(rng).slice(0,5);
  const key=[...L.map(x=>x.slot),'POTRO'],exp=norm([...L.map(x=>by[x.pers]||1),edge]),P=race<=1?norm([1,1,1,1,1,edge]):norm(exp.map((x,i)=>x*winFactor(rec[key[i]]))),pay=payFactors(race,1,6);
  const hs=L.map((x,i)=>new Horse(tr,B[x.slot],{id:i,form:HP[x.pers]*(.93+rng()*.14),lane:laneOffset(gt[i],6)}));hs.push(new Horse(tr,brain,{id:5,form:ob.form*(.93+rng()*.14),agility:ob.agility,power:ob.power,lane:laneOffset(gt[5],6)}));
  const max=FPS*90;let k=0;while(k<max&&!hs.every(h=>h.finished)){k++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
  const rk=x=>x.finished?x.finishTick:1e9-x.total,ord=[0,1,2,3,4,5].sort((a,b)=>rk(hs[a])-rk(hs[b])),pl=ord.indexOf(5),x=hs[5];
  if(pl===0)w++;if(pl<3)p3++;f+=x.falls;t+=x.stumbles;g+=x.hitsGiven;
  if(race>=5){n5++;st+=1;if(pl===0)rg+=oddsFor('ganador',[5],P,pay);if(pl<3)rp+=oddsFor('podio',[5],P,pay);}
  ord.forEach((i,q)=>{rec[key[i]]=recordRace(rec[key[i]],q===0,exp[i])});}
 return `gana ${(w/N*100).toFixed(0)}% podio ${(p3/N*100).toFixed(0)}% golpes ${(g/N).toFixed(2)} salidas ${(f/N).toFixed(2)} trop ${(t/N).toFixed(2)} retorno ganador ${(rg/n5).toFixed(2)} podio ${(rp/n5).toFixed(2)} edge ${edge.toFixed(2)}`;}
let brain=loadColtBrain(perfil),body={};const rng=mulberry32(seed*31+7);
const emit=(tag)=>console.log(perfil,seed,tag,mide(brain,body,seed*1000+5));
emit('0 sin entrenar');
['velocidad','control','agresion','velocidad','control','velocidad'].forEach((focus,i)=>{const t0=Date.now(),r=trainHorse({brain,body,focus,form:POTROS[perfil].handicap,rivals:riv,rng});
 if(r.improved){brain=r.brain;body=r.body;}console.log(perfil,seed,'entreno',i+1,focus,'mejoró',!!r.improved,JSON.stringify(body),((Date.now()-t0)/1000|0)+'s');emit((i+1)+' entrenos');});
