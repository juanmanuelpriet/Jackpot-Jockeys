# jeckpot3

| Carpeta | Qué es |
|---|---|
| [`hipodromo/`](hipodromo/) | **Jackpot Jockeys**: el juego de carreras de caballos con redes neuronales, apuestas desde el celular, mafia, peñas y app de escritorio. Empieza por su [README](hipodromo/README.md). |
| [`f1/`](f1/) | El proyecto original: simulador F1 de neuroevolución en Python y JavaScript, su análisis (`data.ipynb`) y la documentación. Su red campeona es el punto de partida de los caballos. |

## Descargar y jugar

**La app, sin instalar nada más:** [**Mac (Apple Silicon)**](https://github.com/juanmanuelpriet/Jackpot-Jockeys/releases/latest/download/Jackpot-Jockeys-Mac.zip) · [**Windows**](https://github.com/juanmanuelpriet/Jackpot-Jockeys/releases/latest/download/Jackpot-Jockeys-Windows.zip). No está firmada: en Mac se abre la primera vez con clic derecho → Abrir, y en Windows con Más información → Ejecutar de todas formas.

**O desde el código:**

Solo necesitas [Node 18 o más nuevo](https://nodejs.org).

1. Descarga el juego: [**Jackpot-Jockeys-train3.zip**](https://github.com/juanmanuelpriet/Jackpot-Jockeys/archive/refs/heads/train3.zip) (unos 47 MB) y descomprímelo.
2. Abre una terminal en la carpeta `hipodromo` y ejecuta:

   ```bash
   node server.js
   ```

3. Abre `http://localhost:3000` en la pantalla grande. Los jugadores escanean el QR con el celular, en la misma WiFi.
   Para que entren desde otra red o con datos móviles, toca **🌎 Abrir a internet** debajo del QR.

O con git:

```bash
git clone -b train3 --single-branch https://github.com/juanmanuelpriet/Jackpot-Jockeys.git
cd Jackpot-Jockeys/hipodromo
node server.js
```
