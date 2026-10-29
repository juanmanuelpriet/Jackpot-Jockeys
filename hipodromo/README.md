# 🏇 Hipódromo Neuronal

Carreras de caballos donde cada caballo es una **red neuronal** entrenada por neuroevolución
(la misma red 5→5→3→3→2 del simulador F1). Una pantalla grande muestra la carrera y cada
jugador apuesta y lanza poderes desde **su celular**.

## Jugar

```bash
cd hipodromo
node server.js
```

1. Abre `http://localhost:3000` en la pantalla grande (TV, proyector o laptop).
2. Los jugadores escanean el QR o abren la URL `http://<ip>:3000/cel` desde su celular
   (deben estar en la **misma red WiFi**).
3. Cada jugador empieza con **1000 fichas**.

No necesita `npm install`: solo Node 18+.

## Cómo funciona una ronda

| Fase | Duración | Qué pasa |
|------|----------|----------|
| Apuestas | 30 s (o botón "¡Arrancar ya!") | Ves la pista y sus obstáculos, la forma de cada caballo y apuestas |
| Carrera | ~30 s, 3 vueltas | Usas poderes para ayudar o sabotear caballos |
| Resultados | 12 s | Se reparte el pozo y empieza otra carrera |

**Pozo (apuesta mutua):** todo lo apostado + lo gastado en poderes + el jackpot acumulado se
reparte entre quienes apostaron al ganador, en proporción a lo que apostó cada uno. Si nadie
le apostó al ganador, todo el pozo pasa al **JACKPOT** de la siguiente carrera.
Si te quedas sin fichas, recibes 200 de rescate al iniciar la siguiente ronda.

## Poderes (buffs y debuffs)

| Poder | Costo | Efecto |
|-------|-------|--------|
| 🥕 Zanahoria | 80 | Turbo +50 % de velocidad por 3 s |
| 🛡️ Escudo | 60 | Inmune a Vendas y Lazo por 6 s |
| 🙈 Vendas | 100 | Ciega los sensores de la red 2.5 s (corre "a ciegas") |
| 🪢 Lazo | 120 | Frena al caballo en seco 1.5 s |

## Obstáculos

- **Vallas** ocupan un lado de la pista. Los sensores de la red las "ven" como pared, así que
  el caballo aprende a esquivarlas; si llega a más de 6.5 de velocidad **las salta**, si no, tropieza.
- **Barro**: invisible para los sensores; frena al caballo mientras lo pisa.
- Si un caballo se sale de la pista no muere: el jinete lo regresa al centro, pero pierde tiempo.

## Entrenar los caballos

`campeon_original.json` son los pesos de `f1_best_brain.weights.h5` (el campeón entrenado en
Python). `entrenar.js` sigue evolucionándolo **en pistas con obstáculos** y guarda los 6 mejores
cerebros distintos en `caballos.json` (un cerebro por caballo):

```bash
node entrenar.js 200   # ~30 s
```

Con 200 generaciones los caballos pasan de ~5.5 a ~3 tropiezos por carrera y bajan su tiempo
de ~34 s a ~30 s en pistas con 9 obstáculos.

## Archivos

- `sim.js`: pista procedimental, obstáculos, físicas y red neuronal (port de `track.py`, `car.py` y `brain.py`)
- `server.js`: servidor HTTP + Server-Sent Events, fases del juego, apuestas y poderes
- `public/pantalla.html`: la carrera en la pantalla grande
- `public/cel.html`: el control del jugador en el celular
- `jugadores.json`: saldos guardados (se crea solo)

> Las fichas son virtuales. El juego no maneja dinero real.
