#!/bin/zsh
# afina.sh <semilla>: afina una red imitadora con evolución y la mide. Espera base/ a su lado.
I=${0:A:h}; s=$1; d=$I/afina$s; mkdir -p $d/logs; cp $I/base/*.js $I/base/*.json $d/; cd $d
python3 -I -c "import json;b=json.load(open('$I/gru32_mejor.json'));json.dump([b],open('caballos_corredor.json','w'))"
export JJ_SEMILLA=$s ARQ_BASE=$I/base ARQ_NOMBRE=afinada.$s
node entrenar.js corredor 300 0 1 100 > entrena.txt 2>&1 && node $I/mide.js $I/base $d/caballos_corredor.json
