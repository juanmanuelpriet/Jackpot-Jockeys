// Graba lo que haría la heurística. node gen.js <salida.bin> <carreras por mundo> <semilla> [red.json]
// Sin red conduce la heurística; con red conduce la red y la heurística dice qué habría hecho (DAgger).
const fs=require('fs'),R=__dirname+'/base/';
const {Track,Horse,stepRace,drawGates,laneOffset,upgradeBrain,predict,mulberry32,FPS,MUNDOS}=require(R+'sim');
const {HORSES}=require(R+'establo');const {piloto}=require(R+'piloto');
const [out,Ns,seed,netf]=process.argv.slice(2),N=+Ns,hcj=JSON.parse(fs.readFileSync(R+'handicap.json'));
const rivals=HORSES.slice(0,5).map(h=>upgradeBrain(JSON.parse(fs.readFileSync(R+h.cerebro[0]))[h.cerebro[1]])),hc=HORSES.map(h=>hcj[h.name]??1);
const net=netf?JSON.parse(fs.readFileSync(netf)):null,sizes=['corta','media','larga'],rng=mulberry32(+seed);Math.random=mulberry32(+seed+1);
const NI=18,rows=[];let race=0,T=0,n=0,fa=0,st=0;
for(const w of Object.keys(MUNDOS))for(let r=0;r<N;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),solo=r%2===0,g=drawGates(6,rng);race++;
 const me=new Horse(tr,rivals[0],{id:5,form:1,lane:solo?0:laneOffset(g[5],6)});
 const hs=solo?[me]:[...rivals.map((b,i)=>new Horse(tr,b,{id:i,form:hc[i]*(.93+rng()*.14),lane:laneOffset(g[i],6)})),me];
 me.piloto=h=>{const x=h.inputs(hs.length),a=piloto(h);rows.push(race,...x,a[0],a[1]);if(!net)return a;return predict(net,x,h.mem);};
 const max=FPS*90;let t=0;while(t<max&&!hs.every(h=>h.finished)){t++;stepRace(hs);for(const h of hs)if(!h.finished&&h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
 if(solo){T+=(me.finished?me.finishTick:max)/FPS;n++;fa+=me.falls;st+=me.stumbles;}}
fs.writeFileSync(out,Buffer.from(new Float32Array(rows).buffer));
console.log(JSON.stringify({muestras:rows.length/(NI+3),t:+(T/n).toFixed(2),sale:+(fa/n).toFixed(2),trop:+(st/n).toFixed(2)}));
