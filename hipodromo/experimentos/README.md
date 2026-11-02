# Experimentos

Código de las pruebas documentadas en la sección *Experimentos* de `docs/como_funciona.pdf`. Solo lo de `personalidades/` llegó al juego, con sus redes ya entrenadas en `perfiles_gru.json`.

Cada prueba corre en una copia aparte del proyecto, con el parche que le corresponde:

| Archivo | Para qué |
|---|---|
| `piloto.js` | Caballo de heurística, sin red. Se activa con `horse.piloto = piloto` |
| `solo.js` | Heurística contra redes, solos y con rivales |
| `resistencia.diff` | Añade resistencia a `sim.js`. Se activa con `JJ_AGUANTE=1` |
| `carrera.js`, `ritmo.js`, `tope.js` | Miden disputa, acelerador por tramo y topes a mano |
| `arquitecturas.diff` | Añade sentidos, red ancha, GRU y memoria de entradas |
| `corre.sh`, `lista.txt`, `mide.js` | Entrenan y miden cada arquitectura |

En `imitacion/` está el entrenamiento con gradientes: `gen.js` graba, `entrena.py` aprende (necesita PyTorch), `ronda.sh` repite las rondas, `gru32_mejor.json` es la mejor red y `afina.sh` la afina con evolución. Espera una carpeta `base/` a su lado, igual que `corre.sh`.

`corre.sh` espera una carpeta `base/` a su lado con el proyecto ya parchado y `piloto.js`. Para correr todo:

```bash
xargs -P 8 -L 1 ./corre.sh < lista.txt
```

El script de las pruebas de cruces no se conservó; su método y sus resultados están en el PDF.

En `personalidades/` están las GRU que corren en el juego. `piloto.js` es la heurística con las cuatro personalidades y `ronda.sh` entrena una con `lista.txt`. Espera a su lado una carpeta `base/` con el proyecto y ese `piloto.js`, y en su `sim.js` la línea de la red debe decir `this.piloto ? this.piloto(this) : predict(this.brain, this.inputs(others.length), this.mem)`. `cand.js` mide cada red contra la casa, `stats.js` las personalidades (con `HC=corredor,pícaro,bravo,muy bravo` prueba velocidades), `casa.js` si una estrategia le gana a la casa y `lecciones.js` si aprenden de una carrera `mundos_tabla.js` los resultados por mundo y `potros.js` los potros entrenados contra la casa (`node potros.js <corredor|bravo> <semilla> <carreras>`).

Para las redes actuales, `redes_imitadoras.json` guarda las 8 redes tras imitar, y el juego usa las del ciclo 1 de la liga:

| Archivo | Para qué |
|---|---|
| `ronda.sh` | Imita. `RONDAS=25 CARRERAS=80 PASOS=4000` es el entrenamiento pesado; `CAPAS=3` prueba tres capas y `NI=18` quita los sentidos nuevos |
| `es.js` | Una red mejora compitiendo, sin maestro |
| `ciclos.sh` | `zsh ciclos.sh 5 40`: todas mejoran a la vez y enfrentan las versiones nuevas de las demás |
| `liga.js` | Corre todas juntas con reparto al azar. `FS=1,.98,1,1.09` cambia las velocidades |
| `cand15.js` | Compara redes en la ronda 15, en las mismas carreras |
| `stats.js` | Por personalidad. `PH=` prueba otra velocidad de potro |

`es.js`, `liga.js` y `ciclos.sh` esperan cada red en `<perfil>/red_final.json`, junto a ellos.
