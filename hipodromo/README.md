# 🏇 Jackpot Jockeys

Carreras de caballos donde cada caballo es una **red neuronal** entrenada por neuroevolución, a partir
del campeón del simulador F1 de este repositorio. Una pantalla grande transmite la carrera como en la TV
y cada jugador apuesta, ayuda a su favorito y sabotea al resto desde **su celular**.

## Jugar

```bash
cd hipodromo
node server.js
```

1. Abre `http://localhost:3000` en la pantalla grande (TV, proyector o laptop). Crea una **sala** con un
   código de 4 letras.
2. Los jugadores escanean el QR o abren `http://<ip>:3000/cel` y escriben el código. En la misma WiFi
   funciona directo; para jugar con gente que está en otro lado, ver **Jugar por internet**.
3. Cada jugador empieza la partida con **1000 fichas**.

No necesita `npm install`: solo Node 18+. En la pantalla, la tecla **S** muestra los sensores de las
redes y la **C** activa o desactiva la cámara que sigue a la punta.

### App de escritorio

Jackpot Jockeys también es una app normal de Mac: doble clic en **Jackpot Jockeys** (en Aplicaciones o en
Launchpad) y abre el juego en su propia ventana, con el servidor por dentro, la sala creada y el QR listo
para los celulares. No hace falta terminal ni navegador.

- Menú **Juego**: Nueva sala (⌘N), Pantalla completa (⌃⌘F), **Compartir por internet** (⌘I: abre el túnel
  de Cloudflare, copia el enlace y el QR pasa a servir desde cualquier lugar), Dejar de compartir y Abrir en
  el navegador.
- Usa el primer puerto libre desde el 3000 y guarda las cuentas en `~/Library/Application Support/Jackpot Jockeys`.

Para generarla o actualizarla después de cambiar el juego:

```bash
npm install                 # una vez: Electron y el empaquetador (solo para construir la app)
npm run app                 # probarla sin empaquetar
npm run empaquetar          # → dist/Jackpot Jockeys-darwin-arm64/Jackpot Jockeys.app
npm run empaquetar-windows  # → versión para Windows (Jackpot Jockeys.exe)
```

Luego copia `Jackpot Jockeys.app` a Aplicaciones. Si npm se niega a correr el instalador de Electron, apruébalo
con `npm install-scripts approve electron`. La app no está firmada: si la pasas a otra Mac, la primera vez hay que
abrirla con clic derecho → Abrir.

Nada queda corriendo en segundo plano: el juego, la sala y el enlace de internet existen solo mientras la app
está abierta. Al cerrarla se apagan el servidor y el túnel.

### Windows

`npm run empaquetar-windows` genera `dist/Jackpot Jockeys-win32-x64/` (para pasarla a otra PC, comprímela en un
zip). En la PC con Windows 10 u 11 (64 bits):

1. Descomprime el zip donde quieras y abre **Jackpot Jockeys.exe** (no hace falta instalar nada más).
2. Como la app no está firmada, Windows SmartScreen puede avisar: **Más información → Ejecutar de todas formas**.
3. La primera vez, el Firewall de Windows pregunta si la app puede usar la red: marca **Redes privadas** y
   permite el acceso; sin eso los celulares no pueden conectarse por WiFi.
4. Las cuentas se guardan en `%APPDATA%\Jackpot Jockeys`. Pantalla completa con **F11**.
5. Para jugar por internet, instala cloudflared una vez con `winget install --id Cloudflare.cloudflared` y usa
   el menú Juego → Compartir por internet.

El QR usa la dirección de la red WiFi/Ethernet de la PC y evita los adaptadores virtuales (Hyper-V, WSL,
VirtualBox…) que suelen tener las PC con Windows.

### Jugar por internet

```bash
brew install cloudflared   # una sola vez
npm run compartir
```

Arranca el servidor y lo publica con un túnel temporal y gratuito de Cloudflare. Muestra un enlace
`https://….trycloudflare.com`: ábrelo en la pantalla grande y el QR ya sirve para cualquier celular,
esté donde esté. Si ya tienes el juego publicado en otro lado, arráncalo con `PUBLIC_URL=https://tu-dominio node server.js`.
Cada pantalla crea su propia sala, así que pueden jugarse varias partidas a la vez.

## La partida

**No hay final: se juega hasta aburrirse.** Las carreras se suceden sin límite y **cada 8 carreras hay un Gran
Premio** en el que todas las cuotas pagan 50 % más (la pantalla dice cuántas faltan). En vez de premios al final hay
**cuatro podios en vivo** (top 3), en el panel de la pantalla grande, en el resultado de cada carrera y en el botón 🏆
del celular:

| Podio | Quién va primero |
|---|---|
| 💰 Más dinero | más fichas netas (fichas menos deuda) |
| 💸 Más gastador | más fichas gastadas en apuestas y poderes |
| 🕴️ Amigo de la mafia | más fichas pedidas a la mafia (préstamos y sabotajes) |
| 🏋️ Mejor entrenador | dueño del caballo que más carreras ha ganado |

| Fase | Duración | Qué pasa |
|------|----------|----------|
| Apuestas | Sin reloj: arranca 5 s después de que **todos** tocan "Estoy listo" (si alguien se arrepiente, se cancela) | Ves la pista nueva, el cajón y la forma de cada caballo, y apuestas |
| Carrera | 25–75 s según la pista | Usas poderes, sabotajes de la mafia, haces combos con tu peña |
| Resultados | 25 s | Repetición de la llegada en cámara lenta y pago de los boletos |

La pantalla muestra cuántos están listos y quién falta. Si alguien se distrae, la pantalla que creó la sala tiene el botón **¡Iniciar ya!** para arrancar sin esperar.

**Ritmo:** en el juego la simulación corre al 60 % de su velocidad (`SIM_SPEED` en `sim.js`) para dar tiempo a pensar. La física por paso no cambia, así que las redes se comportan igual; los tiempos de los poderes que muestra el celular ya están en segundos reales.

**Tipos de apuesta**, con nombres que entiende cualquiera:

| Apuesta | Eliges | Ganas si… | Paga en la carrera 1 |
|---|---|---|---|
| Que gane | 1 caballo | llega 1º | x2 |
| Top 2 | 1 caballo | llega 1º o 2º | x1.5 |
| Podio | 1 caballo | llega entre los 3 primeros | x1.2 |
| Pareja | 2 caballos | son 1º y 2º, en cualquier orden | x4 |
| 1º y 2º | 2 caballos | llegan en ese orden exacto | x8 |
| 1º, 2º y 3º | 3 caballos | llegan en ese orden exacto | x30 |

**Cuotas fijas que salen de los resultados** (`cuotas.js`). En la **carrera 1 todos los caballos son iguales** y
manda el azar: "Que gane" paga x2 en cualquiera. Cada caballo tiene una **forma** que empieza en 0 y, después de
cada carrera, sube o baja según su puesto (1º +0.6 … 6º −0.5; las carreras viejas pesan menos). La probabilidad de
ganar sale de esa forma y las combinadas de la fórmula de Harville, la de los hipódromos. Así, **el que gana paga
menos la próxima vez y el que pierde paga más**: tras ganar dos veces seguidas un caballo baja a x1.4 y el que llegó
último dos veces sube a x9–x10. Además, el **factor de pago** sube carrera a carrera: en la carrera 1 la casa es
tacaña (x2) y desde la carrera 5 devuelve en promedio el 85 % de lo apostado, así que la partida se pone más jugosa
según avanza la partida. En el Gran Premio (cada 8 carreras) todo paga 50 % más. No hay que esperar a ninguna simulación: las cuotas están listas
apenas empieza la carrera. El celular y la pantalla muestran los últimos puestos de cada caballo (🥇 🥈 🥉 4º…).

**Lo que ves en tu boleto es lo que cobras:** la cuota queda fija al apostar y, si aciertas, cobras monto × cuota,
sin importar lo que apuesten los demás.

**El celular** usa la misma estética del hipódromo que la pantalla grande (verde paño, dorado y crema, tipografías
Oswald y Playfair), minimalista y con botones grandes. Apostar son 3 toques: ① eliges **qué apuestas** en una
cuadrícula de 6 fichas con "hasta cuánto paga" cada una; ② tocas tu **caballo** (en las apuestas de un caballo cada
fila dice directamente "gana 200"; en las combinadas los eliges en orden y aparecen 1º, 2º, 3º); ③ eliges el
**monto** en el panel fijo de abajo, cuyo botón dice "Apostar 100 · ganas 200". Al lado está **Listo**. Una nota
arriba explica de dónde salen las cuotas de esa carrera. Durante la carrera el panel cambia a los **poderes** (toca
un caballo y luego el poder), arriba aparece **cuánto cobrarías si terminara ahora** y tus boletos. Al terminar,
una tarjeta con el ganador y tu resultado neto. Las reacciones están en el botón 😂 de arriba.

**Al terminar cada carrera** el celular muestra tu balance: lo que apostaste, lo que gastaste en poderes, lo que
cobraste, lo que se llevó la mafia (y comisión de peña o premio de dueño si los hubo) y el **resultado** neto.

**Datos móviles:** los celulares que no están en la WiFi de la pantalla no pueden abrir la dirección local del QR
(`192.168…`); para ellos hay que activar **Compartir por internet** (la pantalla lo recuerda debajo del QR). Para
que vaya fluido por el túnel y gaste pocos datos: las páginas van comprimidas (la del celular pesa ~17 KB), las
fuentes cargan sin bloquear, el WebSocket comprime cada mensaje (permessage-deflate), la parte fija del estado
(precios, poderes, disfraces) se manda solo una vez, no se repiten mensajes idénticos y los celulares reciben 2
actualizaciones por segundo (más una inmediata tras cada acción). En carrera un celular recibe ~2.5 KB/s en vez
de ~28 KB/s.

**Versiones:** el servidor lee las páginas al arrancar, así que la pantalla y los celulares siempre usan el mismo
código que él aunque se actualicen los archivos con el juego abierto. Si el juego se reinicia con una versión nueva,
la pantalla y los celulares se recargan solos.

**Conexión:** la pantalla y los celulares usan WebSocket en los dos sentidos: el estado llega 4 veces por segundo y las
acciones del celular (apostar, poderes, reacciones…) viajan por esa misma conexión, sin abrir una petición nueva,
así responden al instante incluso por internet.

**Repeticiones y clips:** al terminar cada carrera la pantalla repite la llegada en cámara lenta. El botón
"Guardar clip" la graba como video (`.webm`) para mandarla al grupo.

**Reacciones:** desde el botón 😂 del celular cada jugador lanza reacciones (😂 Jajaja, 🔥 ¡Vamos!,
🤡 Payaso, 💸 Mi plata…, 😱 ¡Nooo!, 😭 Llora, 👑 El rey, 🐎 ¡Corre!) que suben flotando por la pantalla grande con
su nombre. Una cada 1.5 s por jugador, para que nadie llene la pantalla.

**Cómo se juega:** al abrir el juego, la pantalla grande arranca con una **intro de caballos corriendo** (con
disfraces al azar) y luego un **tutorial a pantalla completa** de 8 pasos, con el QR y el código de la sala siempre
a la vista para que la gente vaya entrando. Cada paso explica una regla con un **ejemplo** con números (la meta, los
caballos con cerebro, cómo apostar, cómo cambian las cuotas, lo difícil paga más, poderes, la mafia y Listo). Se
salta con **Enter** o el botón "Saltar y jugar", sale una vez por sesión y la tecla **H** lo vuelve a mostrar. El
celular tiene su propio tutorial de 9 pasos, también con ejemplos, la primera vez y con el botón **?**.

## La mafia de Don Caballone

Nadie queda eliminado: si te quedas sin fichas (o quieres apostar más), **la mafia te presta** 200 o 500.
- Interés del **12 % por carrera**, hasta 2500 de deuda.
- Mientras debas, su **cobrador se queda con la mitad** de lo que ganes hasta saldar la deuda.
- **Sabotaje de la mafia** (en carrera): tocas un caballo y el botón 🕴️ Sabotaje; la mafia lo **congela 2 s** y le
  tapa los ojos 3 s más, **aunque tenga escudo**. No cuesta fichas: se suma +300 a tu deuda. Uno por carrera.
  La pestaña Mafia del celular explica el préstamo y el sabotaje paso a paso.

## Peñas (alianzas)

Hasta 3 jugadores contra el resto:
- Se pasan fichas (máximo 300 por carrera).
- Cuando un aliado cobra una apuesta, los demás reciben **10 % de comisión** (la paga la casa).
- **Combos**: si dos aliados usan un poder del mismo tipo sobre el mismo caballo en menos de 5 s, el
  segundo dura el doble (o 1.5× si es de ayuda).
- **Traición**: te llevas el 20 % de las fichas de cada aliado, la peña se disuelve, toda la sala se entera
  y nadie puede aliarse contigo por unos minutos. Solo se puede después de una carrera juntos.

## Disfraces

Cada carrera, los caballos de la casa pueden salir disfrazados al azar (40 % de probabilidad cada uno), y el
narrador anuncia el desfile. En la pestaña **Caballo** del celular hay una **tienda de disfraces** para tu potro:

| Disfraz | Precio | | Disfraz | Precio |
|---|---|---|---|---|
| 🦖 T-Rex | 300 | | 🐄 Vaca | 200 |
| 🤖 Robot | 300 | | 🦆 Pato de hule | 200 |
| 🤡 Payaso | 250 | | 🦓 Cebra | 150 |
| 🦄 Unicornio | 400 | | 🍕 Pizza | 350 |
| 👻 Fantasma | 350 | | 🐎 Clásico | gratis |

Los disfraces comprados quedan en tu cuenta entre partidas. Solo cambian el dibujo: no hacen más rápido a nadie.

## Tu propio caballo

- **Compra un potro** (400 fichas), corredor o bravo, y ponle nombre. Es tuyo entre partidas.
- **Inscríbelo**: hasta 3 caballos de jugadores corren en cada carrera junto a los de la casa. Si lo compras o
  inscribes mientras se apuesta, **entra a esa misma carrera** al final de la fila (hasta 8 caballos; los demás
  conservan su número y los boletos ya hechos no cambian). Si la carrera ya arrancó, corre en la siguiente.
  En el celular tu caballo lleva la etiqueta **TUYO** y la pestaña Mi caballo dice con qué número corre.
- **Entrénalo** (150 fichas) en velocidad, agresión o control: corre una neuroevolución real de 10
  generaciones sobre su red, en un hilo aparte, contra los corredores de la casa y en pistas nuevas.
  El celular muestra cómo cambiaron sus embestidas, salidas y tropiezos.
- Si gana, cobras un **premio de propietario**: 50 × su cuota de "Que gane" (mínimo 100), así que ganar con un
  potro sin chance paga mucho más.

## Poderes

| Poder | Costo | Efecto |
|-------|-------|--------|
| Zanahoria | 70 | El jinete toma las riendas 4 s: +35 % de velocidad, salta todas las vallas y no se sale |
| Escudo | 60 | Inmune a vendas, lazo, charco, rayo y embestidas por 6 s |
| Vendas | 100 | Ciega los sensores de la red 2.5 s (corre "a ciegas") |
| Lazo | 120 | Frena al caballo en seco 1.5 s |
| Furia | 90 | +15 % de velocidad, no lo pueden embestir y sus embestidas aturden el doble, 5 s |
| Charco | 45 | Tira un charco de barro justo delante del caballo |
| Rayo | 250 | Aturde 1 s a **todos** los demás caballos (el escudo protege) |

La zanahoria se rediseñó después de medir en el torneo que el turbo solo no cambiaba el resultado: a más
velocidad, las redes se estrellaban en las curvas. Ahora el jinete también evita que se salga.

## Los caballos

| # | Caballo | Estilo | Cerebro |
|---|---|---|---|
| 1 | Don Galope | corredor | `caballos_corredor.json` |
| 2 | Herradura Loca | muy bravo | `caballos_bravo_150.json` |
| 3 | Sir Relincho | corredor | `caballos_corredor.json` |
| 4 | Patas de Trueno | bravo | `caballos_bravo_100.json` |
| 5 | Pura Sangre Fría | corredor | `caballos_corredor.json` |
| 6 | Pancho Trotes | pícaro | `caballos_bravo_60.json` |

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
  Hoy queda entre ×0.93 y ×1.09, y cada caballo gana entre ~14 % y ~21 % de las carreras.
- Los bravos que pierden tiempo embistiendo se entrenan a la velocidad que tendrán con hándicap y con premio
  por puesto (ver **Entrenar**): así no dependen de un hándicap enorme, que las redes no saben controlar.

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
node entrenar.js corredor 300                  # → caballos_corredor.json
node entrenar.js bravo 300 60                  # → caballos_bravo_60.json  (pícaro)
node entrenar.js bravo 200 100 1.2 150         # → caballos_bravo_100.json (bravo)
node entrenar.js bravo 200 150 1.2 180         # → caballos_bravo_150.json (muy bravo)
node calibrar.js 8 500               # → handicap.json
node torneo.js 600 0.7               # 600 carreras, 70 % con un poder al azar → logs/torneo.csv
jupyter notebook analisis.ipynb
```

Los argumentos de `entrenar.js bravo` son: generaciones, premio por embestida (agresividad), velocidad a la
que entrena y premio por cada rival que deja atrás en la llegada. Herradura Loca y Patas de Trueno entrenan a ×1.2,
la velocidad que tienen en el juego con hándicap, y con premio por puesto: así embisten **y** quieren ganar. Los bravos entrenan
contra los corredores ya entrenados, para que no aprendan a chocarse solo entre ellos. Cada entrenamiento
continúa desde los cerebros que ya existan y escribe una fila por generación en
`logs/entrenamiento_<nombre>.csv`. Reinicia el servidor para que use los caballos nuevos.

`analisis.ipynb` sigue el estilo de `data.ipynb`: convergencia del entrenamiento, pesos de entrada,
cómo decide la red (sensibilidad a cada entrada y agresión según la situación), victorias, salida pareja,
distribuciones, boxplots, efecto del largo de pista, correlación, pairplot, violín, outliers y cuánto
vale cada poder. Las gráficas se guardan en `analisis/`.

## Archivos

- `sim.js`: generador de pistas, obstáculos, choques, físicas y red neuronal (port de `track.py`, `car.py` y `brain.py`)
- `sala.js`: una partida sin fin: apuestas, poderes, mafia, peñas, caballos de jugadores y podios
- `evolucion.js`: núcleo de la neuroevolución (lo usan `entrenar.js` y `entrenador.js`)
- `entrenador.js`: entrena el caballo de un jugador en un hilo aparte
- `compartir.js`: servidor + túnel de Cloudflare para jugar por internet
- `establo.js`: los 6 caballos, sus cerebros, el hándicap y los poderes (lo usan el juego y el torneo)
- `narrador.js`: las frases del narrador
- `server.js`: servidor HTTP + Server-Sent Events, salas y cuentas
- `entrenar.js`, `calibrar.js`, `torneo.js`, `analisis.ipynb`: entrenamiento, hándicap, evaluación y análisis
- `public/pantalla.html`: la transmisión en la pantalla grande
- `public/cel.html`: el control del jugador en el celular
- `jugadores.json`: cuentas (nombre, caballo propio y trofeos); se crea solo y no se versiona

> Las fichas son virtuales. El juego no maneja dinero real.
