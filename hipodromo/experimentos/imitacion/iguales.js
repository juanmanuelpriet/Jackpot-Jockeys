const {predict}=require(__dirname+'/base/sim'),fs=require('fs'),d=process.argv[2];const b=JSON.parse(fs.readFileSync(d+'/red.json')),c=JSON.parse(fs.readFileSync(d+'/control.json'));
const mem=[];let e=0;c.x.forEach((x,i)=>{const o=predict(b,x,mem);e=Math.max(e,Math.abs(o[0]-c.y[i][0]),Math.abs(o[1]-c.y[i][1]));});console.log('error maximo',e.toExponential(2));
