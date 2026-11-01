#!/bin/zsh
# corre.sh <nombre> <semilla> <VAR=valor...>: entrena un corredor con esa arquitectura y lo mide
A=${0:A:h}; n=$1; s=$2; shift 2; d=$A/$n.$s; rm -rf $d; mkdir -p $d/logs; cp $A/base/*.js $A/base/*.json $d/; cd $d
for kv in "$@"; do export $kv; done; export JJ_SEMILLA=$s ARQ_BASE=$A/base ARQ_NOMBRE=$n.$s
if [[ -n $JJ_PURA ]]; then node -e "
const {mutateBrain,mulberry32}=require('./sim');const fs=require('fs');const u=$JJ_PURA,n=18;
const zero=[{gru:true,W:Array.from({length:n+u},()=>new Array(u*3).fill(0)),b:new Array(u*3).fill(0)},{W:Array.from({length:u},()=>[0,0]),b:[0,0]}];
const rng=mulberry32(2000+$s);fs.writeFileSync('caballos_corredor.json',JSON.stringify(Array.from({length:8},()=>mutateBrain(zero,1,rng))));"; export JJ_CERO=1; elif [[ -n $JJ_CERO ]]; then node -e "
const {upgradeBrain,mutateBrain,mulberry32}=require('./sim');const fs=require('fs');const b=JSON.parse(fs.readFileSync('caballos_corredor.json'))[0];
const zero=upgradeBrain(b);for(const l of zero){l.W.forEach(r=>r.fill(0));l.b.fill(0);}
const rng=mulberry32(1000+$s);fs.writeFileSync('caballos_corredor.json',JSON.stringify(Array.from({length:8},()=>mutateBrain(zero,1,rng))));"; fi
node entrenar.js corredor ${JJ_GEN:-200} 0 1 100 > entrena.txt 2>&1 && node $A/mide.js $d $d/caballos_corredor.json >> $A/resultados.txt 2>&1 || echo "$n.$s FALLO: $(tail -2 entrena.txt | cut -c1-200)" >> $A/resultados.txt
rm -f logs/*.csv
