#!/bin/zsh
# ronda.sh <carpeta> [semilla]: rondas de imitar (DAgger) para Einstein. RONDAS, CARRERAS (por mundo) y PASOS ajustan cuánto entrena
# DESDE=n sigue una carpeta que ya tiene n rondas (sin volver a grabar al maestro). TASA cambia la tasa de aprendizaje.
I=${0:A:h}; d=$1; s=${2:-1}; RONDAS=${RONDAS:-12}; CARRERAS=${CARRERAS:-8}; PASOS=${PASOS:-1500}; DESDE=${DESDE:-0}; TASA=${TASA:-2e-3}; mkdir -p $d
[ $DESDE = 0 ] && echo "maestro $(node $I/gen.js $d/d0 $CARRERAS $((s*1000)))" > $d/log.txt
for r in {$((DESDE+1))..$((DESDE+RONDAS))}; do
  python3 -I $I/entrena.py $d $PASOS $s $TASA >> $d/log.txt 2>&1 || { echo "FALLO" >> $d/log.txt; exit 1; }
  cp $d/red.json $d/red_$r.json
  echo "ronda $r $(node $I/gen.js $d/d$r $CARRERAS $((s*1000+r)) $d/red.json)" >> $d/log.txt
done
node $I/control.js $d >> $d/log.txt
echo listo >> $d/log.txt
