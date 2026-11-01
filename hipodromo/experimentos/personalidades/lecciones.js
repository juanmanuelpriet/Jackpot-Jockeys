// ¿Aprenden de una carrera? node prueba.js <gru|mlp> <lecciones>
const {learnFromRace}=require('./evolucion'),fs=require('fs'),{mulberry32}=require('./sim'),{HORSES,loadBrains,loadHandicap}=require('./establo');
const [tipo,Ns]=process.argv.slice(2),n=+Ns,old=[['caballos_corredor.json',0],['caballos_bravo_150.json',0],['caballos_corredor.json',1],['caballos_bravo_100.json',0],['caballos_corredor.json',2],['caballos_bravo_60.json',0]].map(([f,i])=>JSON.parse(fs.readFileSync(f))[i]);
const br=tipo==='gru'?loadBrains(()=>{}):old,hc=tipo==='gru'?loadHandicap():[.9227,1.2198,.9246,1.0582,.9252,.9496],w=['nieve','luna','volcan','desierto','pantano','hipodromo'];
let ok=0;for(let k=0;k<n;k++){const i=k%6,t=Date.now(),r=learnFromRace({brain:br[i],form:hc[i],pers:HORSES[i].pers,report:{falls:1},rivals:[1,2,3].map(d=>br[(i+d)%6]),world:w[k%6],rng:mulberry32(k*97+1)});if(r.improved)ok++;
console.log(tipo,process.env.ESCALA||1,HORSES[i].pers,'mejoró',r.improved,r.summary.antes,'→',r.summary.despues,((Date.now()-t)/1000).toFixed(0)+'s');}
console.log('TOTAL',tipo,process.env.ESCALA||1,ok+'/'+n);
