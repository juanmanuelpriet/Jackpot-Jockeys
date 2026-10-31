# 🏇 Jackpot Jockeys

Carreras de caballos donde cada caballo es una **red neuronal**. Una pantalla grande transmite la carrera y cada
jugador apuesta, ayuda a su favorito y sabotea al resto desde **su celular**.

> Las fichas son virtuales. El juego no maneja dinero real.

## Cómo abrirlo

**App de escritorio:** abre **Jackpot Jockeys** desde Aplicaciones. Crea la sala y el QR sola, y al cerrarla no
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

**Tutoriales:** la pantalla grande tiene el suyo. El celular muestra uno corto al entrar y una guía la primera vez que
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

La cuota queda fija al apostar: lo que dice tu boleto es lo que cobras. En la carrera 1 todos los caballos son iguales.
Después, el que gana paga menos y el que pierde paga más.

**La casa gana a la larga.** La forma de un caballo pesa poco en las cuotas (`cuotas.js`), ninguna cuota paga más de
1.2 veces lo que pagaría con todos iguales, y un potro entrenado paga menos. Con 2000 carreras simuladas, desde la
carrera 5 ninguna estrategia recupera más de ~0.87 por ficha. El análisis está en
`analisis/Jackpot_Jockeys_Analisis.xlsx`; se hizo antes de los potros entrenados y de que la casa aprendiera. Si un caballo mejora, sus cuotas bajan para mantener esa ventaja.

### Personalidades

En la pantalla grande se ven mientras se apuesta; en el celular, junto al nombre. Datos de 450 carreras simuladas:

| | Personalidad | Cómo corre | Podio | Choques por carrera | Gana en pista corta / larga |
|---|---|---|---|---|---|
| 💨 | Corredor | Limpio y constante | 55 % | 2.7 | 20 % / 12 % |
| 🦊 | Pícaro | Empuja a veces y recibe pocos golpes | 51 % | 3.4 | 13 % / 13 % |
| 😤 | Bravo | Busca pelea | 48 % | 5.0 | 11 % / 27 % |
| 🔥 | Muy bravo | Todo o nada | 36 % | 5.4 | 16 % / 23 % |

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

**Red neuronal:** 14 → 8 → 3 → 3 → 2 (tanh). Decide giro y acelerador y no tiene ninguna regla de embestir. Percibe:

- 5 sensores de distancia a bordes y vallas
- distancia, rumbo y velocidad del rival más cercano, y si tiene escudo o furia
- si él mismo tiene furia o turbo
- distancia al barro y de qué lado está
- su puesto en la carrera

| Caballo | Personalidad | Cerebro |
|---|---|---|
| Don Galope, Sir Relincho, Pura Sangre Fría | Corredor | `caballos_corredor.json` |
| Pancho Trotes | Pícaro | `caballos_bravo_60.json` |
| Patas de Trueno | Bravo | `caballos_bravo_100.json` |
| Herradura Loca | Muy bravo | `caballos_bravo_150.json` |

**Salida pareja:** cada carrera sortea los carriles, y `handicap.json` ajusta la velocidad para que los caballos de la
casa ganen parecido.

**Pistas:** cada carrera genera una nueva, corta, media o larga, siempre de 2 vueltas. Los caballos entrenan en pistas
que nunca vieron.

**Obstáculos:** las vallas se saltan con buena velocidad; si no, el caballo tropieza. El barro frena. Quien se sale
vuelve al centro, pero pierde tiempo.

**Embestidas:** el que va hacia el otro con más ímpetu lo aturde 0.6 s y sale con un impulso de medio segundo.

**Aprenden de cada carrera:** al terminar, los caballos de la casa repasan de uno en uno y en un hilo aparte, empezando por los que peor llegaron:

1. **Repaso:** 30 generaciones contra los rivales que tuvo cerca, premiando sobre todo llegar primero y castigando más lo que le falló (salidas, vallas, barro y golpes).
2. **Examen:** de 36 pistas. Solo se queda con lo aprendido si gana a más rivales y, si es bravo o pícaro, conserva al menos 80 % de sus embestidas.
3. **Cuotas:** `houseEdges` (`evolucion.js`) corre 600 carreras simuladas y baja las cuotas del que quedó mejor. Sin esto, apostarle siempre al mejor le ganaba a la casa (1.12 por ficha); con esto, ninguna estrategia pasó de 0.99.

Con 42 lecciones por caballo, medidas en 500 carreras contra los originales, los seis llegan en mejor puesto: de 0.03 a 0.44 puestos, y solo unos claramente más que el ruido. Solo uno gana cada carrera, así que no pueden ganar siempre.

Lo aprendido se guarda en `caballos_aprendidos.json`, junto a las cuentas. Los cerebros de fábrica no cambian y borrar ese archivo los restaura.

## Entrenar los caballos de la casa

```bash
node entrenar.js corredor 300            # caballos_corredor.json
node entrenar.js bravo 300 60            # caballos_bravo_60.json (pícaro)
node entrenar.js bravo 200 100 1.2 150   # caballos_bravo_100.json (bravo)
node entrenar.js bravo 200 150 1.2 180   # caballos_bravo_150.json (muy bravo)
node calibrar.js 8 500                   # handicap.json
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
| `establo.js` | Caballos, personalidades, poderes y disfraces |
| `evolucion.js`, `entrenador.js` | Neuroevolución y entrenamiento de potros en un hilo aparte |
| `entrenar.js`, `calibrar.js`, `torneo.js`, `analisis.ipynb` | Entrenamiento de la casa, hándicap y análisis |
| `narrador.js` | Frases del narrador |
| `compartir.js`, `app/main.js` | Túnel de Cloudflare y app de escritorio |
| `public/pantalla.html`, `public/cel.html` | Pantalla grande y celular |
| `aprendiz.js` | Aprendizaje de los caballos de la casa en un hilo aparte |
| `jugadores.json`, `caballos_aprendidos.json` | Cuentas y lo que aprendió la casa; se crean solos y no se versionan |
