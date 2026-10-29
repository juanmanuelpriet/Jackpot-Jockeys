# Contexto del Proyecto: F1 Racing ML (Neuroevolution Simulator)

## 📌 Descripción General
El proyecto "F1 Racing ML" es un simulador de evolución neuronal (neuroevolución) donde vehículos virtuales aprenden a conducir autónomamente alrededor de circuitos procedimentales generados aleatoriamente. Se utilizan **Algoritmos Genéticos** que entrenan una **Red Neuronal** basada en la supervivencia del más apto.

El sistema fue iterado tanto en **JavaScript (p5.js)** como en **Python (Pygame + TensorFlow)**. El entorno principal y final en Python permite la aceleración por hardware (TensorFlow Metal para Apple Silicon) y separa claramente en dos scripts principales el proceso de "Entrenamiento" y el de "Prueba".

## 🏁 Arquitectura y Stack Tecnológico
- **Python 3.10+**
- **Pygame:** Renderizado 2D y simulación del entorno físico (coches, sensores y colisiones).
- **TensorFlow / Keras:** Red neuronal subyacente. Entorno optimizado para Apple Silicon (`tensorflow-macos` y `tensorflow-metal`).
- **p5.js:** (A través de `sketch.js`) Implementación referencial equivalente para entornos web.

## 🧠 Arquitectura de la Red Neuronal (`brain.py`)
La inteligencia de cada vehículo consiste en un perceptrón multicapa secuencial ligero:
- **Entradas (5):** Sensores de distancia ("raycasts") distribuidos en forma de abanico al frente del vehículo.
- **Capas Ocultas (3):** 5 neuronas -> 3 neuronas -> 3 neuronas, con activación `tanh`.
- **Salidas (2):** Aceleración (gas) y Dirección (steer), retornando valores entre -1 y 1 gracias a su activación `tanh`.

## 🧬 Lógica del Algoritmo Genético (`main_app.py`)
1. **Población:** Se instancian `NUM_CARS` (ej. 30 vehículos), configurados en `config.py`.
2. **Fitness/Puntaje:** La "aptitud" se calcula en base al progreso neto logrado al recorrer un spline a lo largo del circuito. 
3. **Fin de Generación:** Se activa cuando se acaba el tiempo máximo establecido, o cuando todos los coches mueren (ya sea por salir de pista o quedarse bloqueados `stuck_frames`).
4. **Selección y Élite:** Se selecciona el **Top 20%** de los mejores vehículos de la generación actual. 
5. **Mutación:** De este selecto grupo y manera aleatoria, se obtienen copias de los pesos genéticos (`w`) y se aplica un factor de distribución aleatorio (mutación gaussiana dependiente de `MUTATION_RATE`), poblando así la siguiente generación.
6. **Entorno Dinámico:** Al generarse el reset generacional, **la pista se recalcula algorítmicamente**. Esto se hace para evitar que el algoritmo memorice y logre una red adaptable en cualquier circuito.

## 🏆 Modalidades y Archivos Principales
- **`main_app.py`:** Entorno de **Entrenamiento Masivo**. Genera y guarda automáticamente en un archivo el mejor "cerebro" (`f1_best_brain.weights.h5`).
- **`tournament.py`:** Entorno **Evaluativo ("Torneo")**. Lee obligatoriamente el archivo `.h5` previamente entrenado. Corre 3 rondas enfrentando 5 vehículos idénticos pero con ligeras perturbaciones en el desove, contando victorias puras. No entrena, solo evalúa.
- **`brain.py`:** Wrapper del modelo en Keras.
- **`car.py`:** Lógica de movimiento, físicas e implementación de raycasting en grillas 2D para alto rendimiento.
- **`track.py`:** Algoritmo que dibuja y genera el polígono cóncavo continuo no auto-intersectado como pista de carreras y su asfalto.
- **`hud.py`:** Visualización renderizada (conexiones de la red, cerebros, nodos, graficos matplotlib).

## 🌩️ Eventos "God-Mode" (Modificadores / Hazards)
Mecánicas asimétricas ("Buffs y Debuffs") dispuestas para probar la resilencia del agente. Durante las carreras se arrojan eventos divinos aleatoriamente regidos por un cooldown (gestión mediante `item.py` o instanciado por `main_app`):
1. **Boost (Turbo):** Aumento temporal de la velocidad tope.
2. **Ceguera:** Los sensores del auto devuelven 0, cegando su percepción del entorno temporalmente.
3. **Congelado:** Impide absolutamente el movimiento.

## 📌 Contexto Estratégico para el Asistente
- Las reglas físicas deben ser respetadas entre Python y el equivalente en JS para guardar paridad en experimentaciones.
- Pygame es un cuello de botella por no ser multihilo por naturaleza; los cambios de renderizado (`track.draw()`, `sensors.draw()`) siempre deben ir orientados a bajo consumo (ej. dibujado simple, grid checking en vez de check-pixel-perfect de choques).
