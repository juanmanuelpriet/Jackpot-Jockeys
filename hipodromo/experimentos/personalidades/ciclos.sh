#!/bin/zsh
# ciclos.sh <ciclos> <generaciones>: todas las redes mejoran a la vez; al final de cada ciclo cada una pasa a enfrentar la versión nueva de las demás
I=${0:A:h}; cd $I; C=$1; G=$2; O=$I/es/liga; rm -rf $O; mkdir -p $O/0
CUPOS=(corredor.1 corredor.2 picaro.1 picaro.2 bravo.1 bravo.2 muybravo.1 muybravo.2)
for c in $CUPOS; do cp $c/red_final.json $O/0/$c.json; done
for n in {1..$C}; do p=$((n-1)); mkdir -p $O/$n
  for c in $CUPOS; do RIV=$O/$p HILOS=1 CADA=$G node es.js $c $G $O/$n/$c.tmp.json $O/$p/$c.json > $O/$n/$c.log 2>&1 & done; wait
  for c in $CUPOS; do mv $O/$n/$c.tmp_$G.json $O/$n/$c.json; rm -f $O/$n/$c.tmp*(N).json; done
  a=(); for c in $CUPOS; do a+=($c=$O/$n/$c.json); done
  node liga.js 50 $((5000+n)) $a > $O/$n/liga.txt 2>&1
  echo "ciclo $n $(date +%H:%M)" >> $O/hechos.txt
done
