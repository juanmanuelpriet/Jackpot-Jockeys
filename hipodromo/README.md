# 🏇 Jackpot Jockeys

Carreras de caballos donde cada caballo es una **red neuronal** entrenada por neuroevolución, a partir
del campeón del simulador F1 de este repositorio. Una pantalla grande transmite la carrera como en la TV
y cada jugador apuesta, ayuda a su favorito y sabotea al resto desde **su celular**.

## Jugar

```bash
cd hipodromo
node server.js
```

1. Abre `http://localhost:3000` en la pantalla grande (TV, proyector o laptop).
2. Los jugadores escanean el QR o abren `http://<ip>:3000/cel` desde su celular
   (deben estar en la **misma red WiFi**).
3. Cada jugador empieza con **1000 fichas**.

No necesita `npm install`: solo Node 18+. En la pantalla, la tecla **S** muestra los sensores de las
redes y la **C** activa o desactiva la cámara que sigue a la punta.

## Cómo funciona una ronda

| Fase | Duración | Qué pasa |
|------|----------|----------|
| Apuestas | 30 s (o el botón "Arrancar carrera") | Ves la pista nueva, el cajón y la forma de cada caballo, y apuestas |
| Carrera | 15–45 s según la pista | Usas poderes para ayudar o sabotear caballos |
| Resultados | 12 s | Se reparte el pozo y empieza otra carrera |

**Pozo (apuesta mutua):** todo lo apostado + lo gastado en poderes + el jackpot acumulado se
reparte entre quienes apostaron al ganador, en proporción a lo que apostó cada uno. Si nadie
le apostó al ganador, todo el pozo pasa al **jackpot** de la siguiente carrera.
Si te quedas sin fichas, recibes 200 de rescate al iniciar la siguiente ronda.

## Poderes

| Poder | Costo | Efecto |
|-------|-------|--------|
| Zanahoria | 50 | Turbo +50 % de velocidad por 4 s |
| Escudo | 60 | Inmune a vendas, lazo, charco, rayo y embestidas por 6 s |
| Vendas | 100 | Ciega los sensores de la red 2.5 s (corre "a ciegas") |
| Lazo | 120 | Frena al caballo en seco 1.5 s |
| Furia | 90 | +15 % de velocidad, no lo pueden embestir y sus embestidas aturden el doble, 5 s |
| Charco | 45 | Tira un charco de barro justo delante del caballo |
| Rayo | 250 | Aturde 1 s a **todos** los demás caballos (el escudo protege) |

Los costos de la zanahoria y el charco se bajaron después de medir en el torneo que casi no cambiaban
el resultado (ver la sección 12 de `analisis.ipynb`).

## Los caballos

| # | Caballo | Estilo | Cerebro |
|---|---|---|---|
| 1 | Backprop | corredor | `caballos_corredor.json` |
| 2 | Overfitting | muy bravo | `caballos_bravo_150.json` |
| 3 | Gradiente | corredor | `caballos_corredor.json` |
| 4 | Dropout | bravo | `caballos_bravo_100.json` |
| 5 | Tanh Tanh | corredor | `caballos_corredor.json` |
| 6 | Bug en Producción | pícaro | `caballos_bravo_60.json` |

La red es **13 → 8 → 3 → 3 → 2** (tanh). No tiene ninguna regla de "embestir": solo decide giro y
acelerador a partir de lo que percibe:

- 5 sensores de distancia a bordes y vallas
- distancia, rumbo y velocidad relativa del rival más cercano, y si ese rival tiene escudo o furia
- si él mismo tiene furia o turbo
- distancia al barro que tiene adelante
- su puesto en la carrera

El campeón de Python tenía 5 entradas y 5 neuronas ocultas; las entradas y neuronas nuevas arrancaron
con pesos en cero, así que todo lo que hacen con ellas lo aprendieron en este entrenamiento.

**Embestidas:** cuando dos caballos chocan, el que va hacia el otro con más ímpetu lo embiste. La víctima
queda aturdida 0.6 s (1.2 s si el atacante tiene furia) y desviada, y el atacante sale con un impulso
de medio segundo. El escudo y la furia protegen de las embestidas.

## Salida pareja

- **Sorteo de cajones:** cada carrera se sortea el carril de salida de cada caballo.
- **Hándicap** (`handicap.json`): `calibrar.js` simula cientos de carreras y ajusta un multiplicador de
  velocidad por caballo hasta que todos ganen parecido, como en las carreras con hándicap reales.
  El tope es ×1.25: más rápido que eso, las redes (entrenadas a velocidad normal) se salen en las curvas.
  Por eso **Overfitting** sigue siendo el caballo sorpresa: gana poco y paga mucho.

## Pistas

Cada carrera genera una pista **nueva y aleatoria**, al estilo de los juegos de mesa de carreras: se hace
crecer una figura de celdas en una cuadrícula de anchos variables, su contorno da rectas, horquillas y
chicanas, algunas esquinas se cortan en diagonal y todas se redondean con arcos. La meta va en la recta
más larga. Un control de calidad descarta curvas demasiado cerradas y tramos pegados entre sí.

| Pista | Cuadrícula | Vueltas |
|---|---|---|
| Corta | 5 × 3 | 2 |
| Media | 6 × 4 (sale el doble de veces) | 2 |
| Larga | 7 × 4 | 2 |

Como los caballos se entrenan y evalúan siempre en pistas que nunca vieron, tienen que adaptarse a lo que salga.

## Obstáculos

- **Vallas** en un lado de la pista. Los sensores las "ven" como pared: el caballo aprende a esquivarlas;
  si llega a más de 6.5 de velocidad **las salta**, si no, tropieza.
- **Barro:** frena al caballo mientras lo pisa. La red tiene un sensor para verlo venir.
- Si un caballo se sale de la pista no muere: el jinete lo regresa al centro, pero pierde tiempo.

## Entrenar, calibrar y analizar

```bash
node entrenar.js corredor 300        # → caballos_corredor.json
node entrenar.js bravo 300 60        # → caballos_bravo_60.json  (pícaro)
node entrenar.js bravo 300 100       # → caballos_bravo_100.json (bravo)
node entrenar.js bravo 300 150       # → caballos_bravo_150.json (muy bravo)
node calibrar.js 8 500               # → handicap.json
node torneo.js 600 0.7               # 600 carreras, 70 % con un poder al azar → logs/torneo.csv
jupyter notebook analisis.ipynb
```

El último número de `entrenar.js bravo` es el premio por embestida (su agresividad). Los bravos entrenan
contra los corredores ya entrenados, para que no aprendan a chocarse solo entre ellos. Cada entrenamiento
continúa desde los cerebros que ya existan y escribe una fila por generación en
`logs/entrenamiento_<nombre>.csv`. Reinicia el servidor para que use los caballos nuevos.

`analisis.ipynb` sigue el estilo de `data.ipynb`: convergencia del entrenamiento, pesos de entrada,
cómo decide la red (sensibilidad a cada entrada y agresión según la situación), victorias, salida pareja,
distribuciones, boxplots, efecto del largo de pista, correlación, pairplot, violín, outliers y cuánto
vale cada poder. Las gráficas se guardan en `analisis/`.

## Archivos

- `sim.js`: generador de pistas, obstáculos, choques, físicas y red neuronal (port de `track.py`, `car.py` y `brain.py`)
- `establo.js`: los 6 caballos, sus cerebros, el hándicap y los poderes (lo usan el juego y el torneo)
- `narrador.js`: las frases del narrador
- `server.js`: servidor HTTP + Server-Sent Events, fases del juego, apuestas y poderes
- `entrenar.js`, `calibrar.js`, `torneo.js`, `analisis.ipynb`: entrenamiento, hándicap, evaluación y análisis
- `public/pantalla.html`: la transmisión en la pantalla grande
- `public/cel.html`: el control del jugador en el celular
- `jugadores.json`: saldos guardados (se crea solo, no se versiona)
- `logs/anteriores/`: cerebros de iteraciones previas (pistas ovaladas, bravos sin agresividad)

> Las fichas son virtuales. El juego no maneja dinero real.
