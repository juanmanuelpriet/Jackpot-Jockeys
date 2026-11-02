#!/bin/zsh
# ronda.sh <personalidad> <semilla>: rondas de imitar (DAgger) para una personalidad, GRU de 32. RONDAS, CARRERAS y PASOS ajustan cuánto entrena
I=${0:A:h}; g=$1; s=$2; RONDAS=${RONDAS:-10}; CARRERAS=${CARRERAS:-40}; PASOS=${PASOS:-1500}; ARQ=${ARQ:-gru}; d=$I/$g.$s; rm -rf $d; mkdir -p $d; cd $I
node gen.js $g $d/d0.bin $CARRERAS $((s*1000)) > $d/log.txt
for r in {1..$RONDAS}; do
  python3 -I entrena.py $ARQ 32 $d $PASOS $s >> $d/log.txt 2>&1 || { echo "$g.$s FALLO" >> $I/hechos.txt; exit 1; }
  cp $d/red.json $d/red_$r.json
  echo "ronda $r $(node gen.js $g $d/d$r.bin $CARRERAS $((s*1000+r)) $d/red.json)" >> $d/log.txt
done
python3 -I entrena.py $ARQ 32 $d $PASOS $s >> $d/log.txt 2>&1; cp $d/red.json $d/red_final.json
node iguales.js $d >> $d/log.txt
rm -f $d/d*.bin
echo "$g.$s listo" >> $I/hechos.txt
