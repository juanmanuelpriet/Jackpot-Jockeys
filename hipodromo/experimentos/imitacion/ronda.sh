#!/bin/zsh
# ronda.sh <nombre> <arq> <unidades> <semilla> <pasos>: varias rondas de imitar (DAgger) y medir
I=${0:A:h}; n=$1; a=$2; u=$3; s=$4; p=$5; d=$I/$n; rm -rf $d; mkdir -p $d; cd $I
node gen.js $d/d0.bin 40 $((s*1000)) > $d/log.txt
for r in 1 2 3 4 5 6 7 8 9 10; do
  python3 -I entrena.py $a $u $d $p $s >> $d/log.txt 2>&1 || { echo "$n FALLO" >> $I/resultados.txt; exit 1; }
  cp $d/red.json $d/red_$r.json
  echo "ronda $r $(node gen.js $d/d$r.bin 40 $((s*1000+r)) $d/red.json)" >> $d/log.txt
done
python3 -I entrena.py $a $u $d $p $s >> $d/log.txt 2>&1; cp $d/red.json $d/red_11.json
ARQ_BASE=$I/base ARQ_NOMBRE=$n node mide.js $I/base $d/red_11.json >> $I/resultados.txt
node iguales.js $d >> $d/log.txt
rm -f $d/d*.bin
