# 🏇 Jackpot Jockeys

Carreras de caballos donde cada caballo es una **red neuronal**. Una pantalla grande transmite la carrera y cada
jugador apuesta, ayuda a su favorito y sabotea al resto desde **su celular**.

> Las fichas son virtuales. El juego no maneja dinero real.

## Cómo abrirlo

**App de escritorio:** descárgala para [Mac](https://github.com/juanmanuelpriet/Jackpot-Jockeys/releases/latest/download/Jackpot-Jockeys-Mac.zip) o [Windows](https://github.com/juanmanuelpriet/Jackpot-Jockeys/releases/latest/download/Jackpot-Jockeys-Windows.zip) y ábrela; en Mac, muévela a Aplicaciones. Crea la sala y el QR sola, y al cerrarla no
queda nada corriendo.

**Desde la terminal** (solo necesita Node 18+):

```bash
cd hipodromo
node server.js
```

Abre `http://localhost:3000` en la pantalla grande. Los jugadores escanean el QR o abren `http://<ip>:3000/cel` y
escriben el código de la sala.

**Teclas en la pantalla grande:** `H` cómo se juega · `S` sensores de las redes · `C` cámara · `Enter` salta el tutorial.

### Jugar con datos móviles o desde otro lugar

La dirección local del QR solo sirve en la misma WiFi. Para otras redes:

- **En la app:** menú Juego → **Compartir por internet** (⌘I).
- **En la terminal:**

  ```bash
  brew install cloudflared   # una sola vez
  npm run compartir
  ```

### Generar la app

```bash
npm install                 # una vez
npm run app                 # probarla sin empaquetar
npm run empaquetar          # Mac: dist/Jackpot Jockeys-darwin-arm64/
npm run empaquetar-windows  # Windows: dist/Jackpot Jockeys-win32-x64/
```

La app no está firmada:

- **En otra Mac:** la primera vez se abre con clic derecho → Abrir.
- **En Windows:** en el aviso de SmartScreen toca **Más información → Ejecutar de todas formas**. En el Firewall
  marca **Redes privadas**, o los celulares no podrán conectarse. Para jugar por internet instala cloudflared con
  `winget install --id Cloudflare.cloudflared`.

## Cómo se juega

Cada jugador empieza con **1000 fichas** y se juega hasta que se aburran. Cada 8 carreras hay un **Gran Premio** que
paga 50 % más.

| Fase | Duración | Qué pasa |
|---|---|---|
| Apuestas | Sin reloj: arranca 5 s después de que todos tocan **Listo** | Tocas un caballo, escribes cuánto y confirmas; puedes quitar cualquier apuesta |
| Carrera | Depende de la pista | Usas poderes y sabotajes |
| Resultados | 25 s | Repetición de la llegada y pagos |

El anfitrión puede arrancar con **¡Iniciar ya!** y devolver a todos a las fichas iniciales con **Reiniciar fichas**.

**Podios en vivo:** 💰 Más dinero · 💸 Más gastador · 🕴️ Amigo de la mafia · 🏋️ Mejor entrenador.

**Video tutorial:** sale con voz la primera vez que se abre el juego en un equipo y se salta con **Saltar video** o Enter. Se vuelve a ver con la tecla **V**. Se graba con `npm run video` en un Mac (`video/guion.js` tiene lo que dice).

**Tutoriales:** la pantalla grande también tiene uno por pasos. El celular muestra uno corto al entrar y una guía la primera vez que
abres Mi caballo, Mafia o Peña. Cada sección la repite con **¿Cómo funciona?**.

### Apuestas

| Apuesta | Ganas si… | Paga en la carrera 1 |
|---|---|---|
| Que gane | tu caballo llega 1º | x2 |
| Top 2 | llega 1º o 2º | x1.5 |
| Podio | llega entre los 3 primeros | x1.2 |
| Pareja | tus 2 caballos son 1º y 2º, en cualquier orden | x4 |
| 1º y 2º | llegan en ese orden | x8 |
| 1º, 2º y 3º | llegan en ese orden | x30 |

La cuota queda fija al apostar: lo que dice tu boleto es lo que cobras. En la carrera 1 de cada partida todos los caballos de la casa pagan igual.
Después, cuenta el mundo y las veces que cada caballo ha ganado en el juego frente a las que se esperaban: el que gana de más paga menos y el que gana de menos paga más.

**La casa gana a la larga.** Las victorias se guardan en `victorias.json` entre partidas y pesan poco al principio y más con el tiempo (`cuotas.js`). Ninguna cuota paga más de
1.2 veces lo que pagaría con todos iguales, y un potro entrenado paga menos. Con 11000 carreras simuladas, ninguna estrategia probada recuperó más de 0.84 por ficha, sin simular poderes ni potros. El análisis de
`analisis/Jackpot_Jockeys_Analisis.xlsx` es de las cuotas anteriores. Si un caballo mejora, sus cuotas bajan para mantener esa ventaja.

### Personalidades

En la pantalla grande se ven mientras se apuesta; en el celular, junto al nombre. Cada partida reparte las personalidades al azar, y otra vez tras cada Gran Premio. Datos de unas 900 carreras simuladas por personalidad, en todos los mundos. El pícaro golpea tanto como el corredor; se distinguen en que el corredor rodea los obstáculos y el pícaro los salta:

| | Personalidad | Cómo corre | Podio | Choques por carrera | Gana en pista corta / larga |
|---|---|---|---|---|---|
| 💨 | Corredor | Limpio y constante | 64 % | 1.6 | 23 % / 18 % |
| 🦊 | Pícaro | Empuja a veces y casi no se sale, pero recibe muchos golpes | 59 % | 1.6 | 20 % / 13 % |
| 😤 | Bravo | Busca pelea y rinde parejo | 47 % | 2.2 | 15 % / 13 % |
| 🔥 | Muy bravo | Todo o nada | 30 % | 3.6 | 8 % / 23 % |

### Poderes

Se usan en carrera con un toque: los de ayuda van a tu caballo y los de freno al rival que va más cerca delante de él. Si tocas otro caballo, van a ese. Cada jugador espera 4 s entre poderes.

| Poder | Costo | Efecto |
|---|---|---|
| 🥕 Zanahoria | 70 | 4 s: +35 % de velocidad, salta todas las vallas y no se sale |
| 🛡️ Escudo | 60 | 6 s inmune a ataques |
| 🙈 Vendas | 100 | Ciega sus sensores 2.5 s |
| 🪢 Lazo | 120 | Lo frena en seco 1.5 s |
| 😤 Furia | 90 | 5 s: +15 % de velocidad, no lo embisten y sus choques aturden el doble |
| 💩 Charco | 45 | Tira barro delante de él |
| ⚡ Rayo | 250 | Aturde 1 s a todos los demás |

### Mafia

Un banco malo. Nadie queda eliminado:

- **Préstamo:** 200 o 500 fichas, con deuda máxima de 2500.
- **Interés:** la deuda sube 12 % cada carrera.
- **Cobrador:** se lleva la mitad de cada premio hasta cobrarse.
- **Sabotaje:** congela a un caballo 2 s y lo ciega 3 s, aunque tenga escudo. Suma 300 a tu deuda. Uno por carrera.

### Peñas

Equipos de hasta 3 jugadores:

- **Regalos:** se pasan hasta 300 fichas por carrera.
- **Comisión:** cuando uno cobra, los demás reciben 10 % de su premio. Lo paga la casa.
- **Combo:** dos aliados usan un poder del mismo tipo sobre el mismo caballo en 5 s y el efecto dura más.
- **Traición:** te llevas el 20 % de las fichas de cada aliado y la peña se disuelve. Requiere una carrera juntos.

### Tu propio caballo

- **Comprar:** 400 fichas, corredor o bravo. Es tuyo entre partidas.
- **Correr:** hasta 3 potros por carrera, y hasta 8 caballos en total. Se inscribe solo.
- **Premio de dueño:** si gana cobras 50 × su cuota de Que gane, con un mínimo de 100, más el 20 % de lo que ganó la casa con las apuestas de esa carrera.
- **Disfraces:** de 150 a 400 fichas. Solo cambian el dibujo.

**Entrenar** cuesta 150 fichas. Eliges velocidad, choques o control, y `trainHorse` (`evolucion.js`) hace tres cosas:

1. **Sube el cuerpo:** +1.5 % de velocidad (tope +6 %), +5 % de giro (tope +20 %) o +10 % de fuerza (tope +40 %). Los
   caballos ya corren casi al tope de la física, así que el cerebro solo no puede pasar de ahí.
2. **Reentrena el cerebro** 60 generaciones, en un hilo aparte y en pistas nuevas, premiando ese rasgo.
3. **Toma un examen** de 36 pistas contra su versión anterior, con las mismas salidas y la misma suerte. Si no mejora
   más que el ruido de la medida, o corre mucho peor, sigue igual y se devuelven las fichas.

Se puede entrenar lo que quieras y cuando quieras, pero **cada entrenamiento le cuesta una carrera**. Mientras se apuesta sale de esa carrera y se devuelven los boletos que lo llevan; si ya está corriendo, empieza al terminar y se salta la siguiente.

## Cómo funcionan los caballos

**Red neuronal:** los seis caballos de la casa son GRU de 32 unidades (5346 pesos, con memoria). Los potros de los jugadores son perceptrones 18 → 8 → 3 → 3 → 2 (199 pesos), porque su entrenamiento se probó con ellos. Ambos deciden giro y acelerador y no tienen ninguna regla de embestir. Perciben:

- 5 sensores de distancia a bordes y vallas
- distancia, rumbo y velocidad del rival más cercano, y si tiene escudo o furia
- si él mismo tiene furia o turbo
- distancia al obstáculo que se pisa adelante, de qué lado está y qué tan grave es
- agarre del suelo, viento de lado y gravedad
- su puesto en la carrera

Hay 8 perfiles en `perfiles_gru.json`, dos por personalidad, y cada partida reparte 6 al azar entre los caballos de la casa.

Las GRU aprendieron imitando a una heurística con cada personalidad y luego compitiendo sin maestro. Los potros nacen de `caballos_corredor.json` o `caballos_bravo_100.json`.

**Salida:** cada carrera sortea los carriles, y `handicap.json` da una velocidad a cada personalidad: 1 al corredor, 0.98 al pícaro, 1 al bravo y 1.09 al muy bravo. No ganan igual a propósito: igualarlos del todo borra las personalidades.

**Pistas:** cada carrera genera una nueva, corta, media o larga, siempre de 2 vueltas. Los caballos entrenan en pistas
que nunca vieron.

**Mundos:** cada carrera se corre en uno distinto al anterior. Los mismos cerebros corren en todos, y entrenaron en todos:

| | Mundo | Física | Obstáculos |
|---|---|---|---|
| 🏇 | Hipódromo | La de siempre | Vallas y barro |
| ❄️ | Nieve | Derrapa en las curvas | Pinos, hielo y nevadas |
| 🌙 | Luna | Poca gravedad y mucha inercia | Rocas y cráteres |
| 🌋 | Volcán | La ceniza acorta la vista | Lava, géiseres y basalto |
| 🏜️ | Desierto | Viento de lado | Cactus, arena y remolinos |
| 🐊 | Pantano | Suelo blando | Troncos, ciénaga y caimanes |

A cada personalidad le va distinto en cada mundo, y las cuotas lo saben (`cuotas_mundo.json`). Las ecuaciones completas,
lo medido y las limitaciones están en [docs/como_funciona.pdf](docs/como_funciona.pdf).

**Obstáculos:** casi todos se pueden saltar con buena velocidad o esquivar, y ambas cosas valen lo mismo al aprender. Si no le
alcanza, el caballo tropieza o los pisa: frenan, hacen perder el control, aturden o queman. Los que tienen aro rojo no se saltan:
pino y cactus hay que rodearlos, y géiser, remolino y caimán alcanzan también al que va en el aire. Cada mundo explica sus
obstáculos en pantalla. Quien se sale vuelve al centro, pero pierde tiempo.

**Embestidas:** el que va hacia el otro con más ímpetu lo aturde 0.6 s y sale con un impulso de medio segundo.

**Aprenden de cada carrera:** al terminar, los caballos de la casa repasan de uno en uno y en un hilo aparte, empezando por los que peor llegaron:

1. **Repaso:** 30 generaciones, con mutaciones 20 veces más suaves porque una GRU se rompe con las normales, contra los rivales que tuvo cerca, premiando sobre todo llegar primero y castigando más lo que le falló (salidas, vallas, barro y golpes).
2. **Examen:** de 36 pistas. Solo se queda con lo aprendido si gana a más rivales y, si es bravo o pícaro, conserva al menos 80 % de sus embestidas.
3. **Cuotas:** `houseEdges` (`evolucion.js`) corre 600 carreras simuladas y baja las cuotas del que quedó mejor. Sin esto, apostarle siempre al mejor le ganaba a la casa (1.12 por ficha); con esto, ninguna estrategia pasó de 0.99.

Con las GRU, 4 de 12 lecciones pasaron el examen, que es poco exigente. Lo aprendido se guarda en cada perfil, no en cada caballo. Todavía no se mide cuánto ganan de más tras muchas lecciones. Con las redes anteriores, tras 8 lecciones por caballo y 600 carreras de comparación, solo Herradura Loca mejoró con claridad.

Lo aprendido se guarda en `perfiles_aprendidos.json`, junto a las cuentas. Lo aprendido antes por las redes anteriores no se usa. Los cerebros de fábrica no cambian y borrar ese archivo los restaura.

## Entrenar los caballos de la casa

Las GRU de `perfiles_gru.json` se entrenan como explica `experimentos/README.md`. Los comandos de abajo entrenan los perceptrones de los que nacen los potros; `calibrar.js` con 0 iteraciones conserva las velocidades de `handicap.json` y solo mide las cuotas por mundo.

```bash
node entrenar.js corredor 300 0 1 100    # caballos_corredor.json
node entrenar.js bravo 300 60 1 100      # caballos_bravo_60.json (pícaro)
node entrenar.js bravo 250 100 1.2 150   # caballos_bravo_100.json (bravo)
node entrenar.js bravo 250 150 1.2 180   # caballos_bravo_150.json (muy bravo)
node calibrar.js 0 400                   # cuotas_mundo.json
node torneo.js 600 0.7                   # logs/torneo.csv
jupyter notebook analisis.ipynb          # gráficas en analisis/
```

Los argumentos de `entrenar.js bravo` son generaciones, premio por embestida, velocidad y premio por puesto. Reinicia
el servidor para que use los caballos nuevos.

## Archivos

| Archivo | Qué hace |
|---|---|
| `server.js`, `websocket.js` | Servidor HTTP y WebSocket, salas y cuentas |
| `sala.js` | Reglas de la partida: apuestas, poderes, mafia, peñas, potros y podios |
| `cuotas.js` | Cuotas de la casa |
| `sim.js` | Pistas, física, choques y red neuronal |
| `mundos.js` | Física y obstáculos de cada mundo |
| `establo.js` | Caballos, personalidades, poderes y disfraces |
| `evolucion.js`, `entrenador.js` | Neuroevolución y entrenamiento de potros en un hilo aparte |
| `entrenar.js`, `calibrar.js`, `torneo.js`, `analisis.ipynb` | Entrenamiento de la casa, hándicap y análisis |
| `narrador.js` | Frases del narrador |
| `compartir.js`, `app/main.js` | Túnel de Cloudflare y app de escritorio |
| `public/pantalla.html`, `public/cel.html` | Pantalla grande y celular |
| `public/tutorial.webm`, `video/` | Video tutorial y lo que lo graba |
| `aprendiz.js` | Aprendizaje de los caballos de la casa en un hilo aparte |
| `cuotas_mundo.json` | Ventaja de cada personalidad en cada mundo |
| `docs/como_funciona.pdf` | Cómo funciona todo, con ecuaciones y mediciones |
| `perfiles_gru.json` | Los 8 perfiles de los caballos de la casa |
| `experimentos/` | Código de las pruebas: heurística, resistencia, arquitecturas y las GRU del juego |
| `jugadores.json`, `caballos_aprendidos_gru.json`, `victorias.json` | Cuentas, lo que aprendió la casa y sus victorias; se crean solos y no se versionan |
