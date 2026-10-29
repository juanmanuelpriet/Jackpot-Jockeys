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

Una partida son **8 carreras**. La última es el **Gran Premio**: todas las cuotas pagan 50 % más. Al final hay
**premios de la noche** (Campeón, Saboteador, Ángel de la guarda, Ojo de halcón, Moroso del año, Judas,
Mecenas, Entrenador estrella), que quedan como trofeos en tu cuenta. Después arranca otra partida y todos
vuelven a 1000 fichas y sin deudas. Gana la noche quien tenga más fichas **netas** (fichas menos deuda).

| Fase | Duración | Qué pasa |
|------|----------|----------|
| Apuestas | Sin reloj: arranca 5 s después de que **todos** tocan "Estoy listo" (si alguien se arrepiente, se cancela) | Ves la pista nueva, el cajón y la forma de cada caballo, y apuestas |
| Carrera | 25–75 s según la pista | Usas poderes, pides favores a la mafia, haces combos con tu peña |
| Resultados | 25 s | Repetición de la llegada en cámara lenta y pago de los boletos |

La pantalla muestra cuántos están listos y quién falta. Si alguien se distrae, la pantalla que creó la sala tiene el botón **¡Iniciar ya!** para arrancar sin esperar.

**Ritmo:** en el juego la simulación corre al 60 % de su velocidad (`SIM_SPEED` en `sim.js`) para dar tiempo a pensar. La física por paso no cambia, así que las redes se comportan igual; los tiempos de los poderes que muestra el celular ya están en segundos reales.

**Tipos de apuesta**, como en un hipódromo:

| Apuesta | Eliges | Ganas si… |
|---|---|---|
| Ganador | 1 caballo | llega 1º |
| Placé | 1 caballo | llega 1º o 2º |
| Podio | 1 caballo | llega entre los 3 primeros |
| Quiniela | 2 caballos | son 1º y 2º, en cualquier orden |
| Exacta | 1º y 2º | llegan en ese orden exacto |
| Trifecta | 1º, 2º y 3º | llegan en ese orden exacto |

**Cuotas fijas, como en una casa de apuestas.** Antes de cada carrera la casa **simula esa misma carrera 100
veces** (misma pista, cajones, forma del día y redes neuronales, con un poco de ruido) para estimar la probabilidad
de que gane cada caballo. Las combinadas salen de la fórmula de Harville, la que usan los hipódromos, y la cuota
es `(1 − 10 %) / probabilidad`: la casa se queda en promedio el 10 %. Mientras simula (1–2 s), la pantalla muestra
una presentación de la carrera con un consejo y el celular avisa que está calculando.

**Lo que ves en tu boleto es lo que cobras:** la cuota queda fija al apostar y, si aciertas, cobras monto × cuota,
sin importar lo que apuesten los demás. El favorito paga poco (x1.3–x3), un caballo sin chance paga x20–x30,
una Exacta puede pagar x15–x400 y una **Trifecta x80–x3.000**. En el Gran Premio todas las cuotas suben 50 %.
Se puede comprobar que son justas: los caballos que las cuotas daban por 29 % ganaron el 32 % de las carreras de
prueba, y los de 49 %, el 52 %.

**El celular** tiene estilo iOS (modo claro u oscuro según el teléfono) y está pensado para que hasta un niño
pueda jugar: apostar son 3 toques. ① Eliges **qué apuestas** en una cuadrícula de 6 fichas con palabras sencillas
(Que gane, Top 2, Podio, Pareja, 1º y 2º, 1º-2º-3º) y "hasta cuánto paga" cada una. ② Tocas tu **caballo**: en las
apuestas de un caballo cada fila dice directamente "gana 720"; en las combinadas los vas eligiendo en orden y
aparecen 1º, 2º, 3º. ③ Eliges el **monto** en el panel fijo de abajo, cuyo botón dice "Apostar 50 · ganas 360".
Al lado está **Listo**. Durante la carrera ese panel cambia a los **poderes** (toca un caballo y luego el poder),
arriba aparece **cuánto cobrarías si terminara ahora** y tus boletos con lo que paga cada uno. Al terminar, una
tarjeta con el ganador y tu resultado neto. Las reacciones están en el botón 😂 de arriba.

**Conexión:** la pantalla y los celulares usan WebSocket en los dos sentidos: el estado llega 4 veces por segundo y las
acciones del celular (apostar, poderes, reacciones…) viajan por esa misma conexión, sin abrir una petición nueva,
así responden al instante incluso por internet.

**Repeticiones y clips:** al terminar cada carrera la pantalla repite la llegada en cámara lenta. El botón
"Guardar clip" la graba como video (`.webm`) para mandarla al grupo.

**Reacciones:** desde el botón 😂 del celular cada jugador lanza reacciones (😂 Jajaja, 🔥 ¡Vamos!,
🤡 Payaso, 💸 Mi plata…, 😱 ¡Nooo!, 😭 Llora, 👑 El rey, 🐎 ¡Corre!) que suben flotando por la pantalla grande con
su nombre. Una cada 1.5 s por jugador, para que nadie llene la pantalla.

**Cómo se juega:** al abrir el juego, la pantalla grande arranca con una **intro de caballos corriendo** (con
disfraces al azar) y luego un **tutorial a pantalla completa** de 7 pasos, con el QR y el código de la sala siempre
a la vista para que la gente vaya entrando mientras la casa simula las cuotas. Se salta con **Enter** o el botón
"Saltar y jugar", sale una vez por sesión y la tecla **H** lo vuelve a mostrar. El celular tiene su propio tutorial
de 6 pasos (hoja inferior) la primera vez y con el botón **?**.

## La mafia de Don Caballone

Nadie queda eliminado: si te quedas sin fichas (o quieres apostar más), **la mafia te presta** 200 o 500.
- Interés del **12 % por carrera**, hasta 2500 de deuda.
- Mientras debas, su **cobrador se queda con la mitad** de lo que ganes hasta saldar la deuda.
- **Favor de Don Caballone** (en carrera): "arregla" a un caballo con lazo 2 s y vendas 3 s, **ignora escudos**.
  Uno por carrera y se paga con +300 de deuda.

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
- **Inscríbelo**: hasta 3 caballos de jugadores corren en cada carrera junto a los de la casa.
- **Entrénalo** (150 fichas) en velocidad, agresión o control: corre una neuroevolución real de 10
  generaciones sobre su red, en un hilo aparte, contra los corredores de la casa y en pistas nuevas.
  El celular muestra cómo cambiaron sus embestidas, salidas y tropiezos.
- Si gana, cobras un **premio de propietario**: 50 × su cuota de Ganador (mínimo 100), así que ganar con un
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
- `sala.js`: una partida: apuestas, poderes, mafia, peñas, caballos de jugadores y premios
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
