// ¿Dosificar a mano le gana a ir a fondo? La misma red, con el acelerador limitado.
const R=process.argv[2]+'/';const {Track,Horse,stepRace,predict,mulberry32,FPS,MUNDOS}=require(R+'sim');const {loadBrains}=require(R+'establo');const {piloto}=require(R+'piloto');
const b=loadBrains(()=>{}),sizes=['corta','media','larga'];
for(const cap of [1,.92,.85,.8,.75,.7,'H']){let T=0,n=0,fa=0,ag=0;const rng=mulberry32(7);Math.random=mulberry32(8);
 for(const w of Object.keys(MUNDOS))for(let r=0;r<15;r++){const tr=new Track(Math.floor(rng()*1e6),null,sizes[r%3],w),h=new Horse(tr,b[0],{id:0,form:1,lane:0});
  h.piloto=cap==='H'?piloto:(x=>{const [s,g]=predict(x.brain,x.inputs(1));return [s,Math.min(g,cap*2-1)];});
  let t=0;const max=FPS*95;while(t<max&&!h.finished){t++;stepRace([h]);if(h.laps>=tr.laps){h.finished=true;h.finishTick=h.ticks;}}
  T+=(h.finished?h.finishTick:max)/FPS;n++;fa+=h.falls;ag+=h.aguante;}
 console.log(cap==='H'?'heurística':'tope '+(cap*100)+'%','tiempo',(T/n).toFixed(1),'sale',(fa/n).toFixed(2),'aguante al llegar',(ag/n).toFixed(2));}
