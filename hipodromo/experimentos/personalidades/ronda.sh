#!/bin/zsh
# ronda.sh <personalidad> <semilla>: rondas de imitar (DAgger) para una personalidad, GRU de 32
I=${0:A:h}; g=$1; s=$2; d=$I/$g.$s; rm -rf $d; mkdir -p $d; cd $I
node gen.js $g $d/d0.bin 40 $((s*1000)) > $d/log.txt
for r in 1 2 3 4 5 6 7 8 9 10; do
  python3 -I entrena.py gru 32 $d 1500 $s >> $d/log.txt 2>&1 || { echo "$g.$s FALLO" >> $I/hechos.txt; exit 1; }
  cp $d/red.json $d/red_$r.json
  echo "ronda $r $(node gen.js $g $d/d$r.bin 40 $((s*1000+r)) $d/red.json)" >> $d/log.txt
done
python3 -I entrena.py gru 32 $d 1500 $s >> $d/log.txt 2>&1; cp $d/red.json $d/red_11.json
node iguales.js $d >> $d/log.txt
rm -f $d/d*.bin
echo "$g.$s listo" >> $I/hechos.txt
