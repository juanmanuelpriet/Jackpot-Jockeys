# Experimentos

Código de las pruebas documentadas en la sección *Experimentos* de `docs/como_funciona.pdf`. Nada de esto entra al juego ni a la app.

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
