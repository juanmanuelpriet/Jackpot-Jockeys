# AGENT.md — Hipodromo RL Environment

## Propósito

Este subproyecto (`hipodromo/`) no es un juego arcade final.

Su propósito es ser un entorno de entrenamiento RL determinista, reproducible y modular para agentes de conducción 2D estilo AG-RACE.

La prioridad no es "hacerlo más vistoso".
La prioridad es:
- mejorar el entorno
- mejorar los agentes baseline
- mantener separación clara de responsabilidades
- preparar el reemplazo futuro por un `NeuralAgent`

---

## Qué se está construyendo

Se está construyendo un entorno 2D de conducción con:
- pista procedural por seed
- agentes que siguen la pista
- física hover/antigravity simple
- reward externa
- eventos del mundo deterministas
- observaciones fijas para futura red neuronal

El sistema debe comportarse como un entorno RL tipo Gymnasium.

API objetivo:
- `reset(config, seed)`
- `step(action_dict)`

`step(...)` debe devolver:
- `observations`
- `rewards`
- `terminated`
- `truncated`
- `info`

---

## Alcance permitido

Trabajar solo en:
- `hipodromo/scenes/`
- `hipodromo/agents/`
- `hipodromo/track/`
- `hipodromo/scripts/`
- `hipodromo/config/`
- `hipodromo/ui/` solo si mejora debug útil para entrenamiento

No tocar otras partes del repositorio salvo necesidad real y justificada.

---

## Lo que NO se debe hacer

No agregar:
- power-ups arcade
- combate
- misiles
- aceite tipo Mario Kart
- sistemas de inventario
- features cosméticas complejas
- UI innecesaria
- features de juego final

No mezclar:
- reward dentro del agente
- IA dentro del vehículo
- física dentro de RewardManager
- lógica de entorno dentro de Vehicle

No reescribir todo desde cero sin justificación.

---

## Arquitectura obligatoria

### `scenes/Race2D.gd`
Rol: Environment Manager.

Responsabilidades:
- exponer `reset(config, seed)` y `step(action_dict)`
- orquestar el episodio
- desacoplar física e inferencia
- aplicar `action hold`
- recopilar observaciones
- pedir rewards al `RewardManager`
- actualizar `WorldEventManager`
- construir `terminated`, `truncated`, `info`
- registrar logging por episodio

No debe:
- decidir cómo conduce cada agente
- contener reward hardcodeada del agente
- contener física detallada del vehículo

### `config/EnvironmentConfig.gd`
Rol: fuente única de verdad.

Debe contener:
- `seed`
- `num_agents`
- `physics_fps`
- `inference_fps`
- `curriculum_phase`
- `max_steps_per_episode`
- `event_frequency`
- `event_intensity`
- `debug_flags`
- parámetros físicos importantes

Toda corrida debe depender de esta configuración.

### `agents/Vehicle.gd`
Rol: actuador físico puro.

Debe:
- aplicar solo inputs de control
- ejecutar física a 60 Hz
- exponer estado dinámico
- aceptar modificadores externos del mundo

Inputs mínimos:
- `throttle`
- `brake`
- `steer`

Métodos recomendados:
- `apply_inputs(...)`
- `set_friction_modifier(...)`
- `set_control_inversion(...)`
- `apply_disturbance(...)`

No debe:
- calcular reward
- decidir acciones
- contener lógica de IA
- conocer reglas del episodio

### `agents/BaselineAgent.gd`
Rol: observador + policy baseline.

Debe:
- construir observaciones
- decidir acciones heurísticas
- seguir la pista de forma estable
- implementar fallback de seguridad

Baseline recomendado:
- Pure Pursuit o lookahead equivalente
- control lateral P o PID simple
- velocidad objetivo según curvatura
- recovery cuando se sale de pista
- fallback si queda stuck o con heading grave

Debe exponer:
- `get_observation_dict()`
- `get_observation_vector()`

No debe:
- calcular la reward principal
- modificar física directamente
- saltarse `Vehicle.apply_inputs(...)`

### `track/TrackGenerator.gd`
Rol: geometría procedural + métricas espaciales.

Debe exponer:
- progreso escalar `s`
- `delta_s`
- heading de referencia
- curvatura local
- distancia lateral al centro
- `off_track`

Debe ser determinista por seed.

No debe:
- asignar rewards
- tomar decisiones del agente

### `track/WorldEventManager.gd`
Rol: caos controlado útil para entrenamiento.

Eventos permitidos:
- `WIND_GUST`
- `LOW_GRIP`
- `CONTROL_INVERTED`
- `SHORT_STUN`
- `SENSOR_NOISE`

Cada evento debe tener:
- tipo
- severidad
- duración
- decaimiento
- determinismo por seed

No debe implementar eventos arcade.

### `scripts/RewardManager.gd`
Rol: juez externo de recompensa.

Debe calcular reward usando:
- progreso positivo (`delta_s`)
- penalización por `off_track`
- penalización por colisión
- penalización por `stuck`
- penalización por zigzag sin avance
- bonus opcional por checkpoint o lap

La reward vive aquí o en coordinación con `Race2D`, nunca dentro del agente.

---

## OBS_SCHEMA_V1

La observación debe tener:
- tamaño fijo
- orden fijo
- normalización definida
- valores por defecto definidos

Bloques sugeridos:
1. track sensors
2. self state
3. track relation
4. rivals
5. world events

No cambiar el esquema silenciosamente.
Si cambia, versionar:
- `OBS_SCHEMA_V1`
- `OBS_SCHEMA_V2`

---

## Contrato temporal

- física a `60 Hz`
- inferencia a `10–30 Hz`
- entre inferencias se mantiene la última acción (`action hold`)

Esto debe estar explícito en el entorno.

---

## Determinismo y reproducibilidad

Misma `seed` + misma `config` deben producir:
- misma pista
- mismo schedule de eventos
- mismas condiciones iniciales

Registrar por episodio:
- `seed`
- `config_hash`
- `track_hash`
- `event_schedule_hash`
- `reward_total`
- `final_progress`
- `off_track_time`
- `collisions`
- `stuck_count`
- `terminated_cause`
- `truncated_cause`

---

## Currículo

### Fase 1
- 1 agente
- sin eventos o casi sin eventos

### Fase 2
- 2 agentes
- eventos leves
- baseline estable

### Fase 3
- múltiples agentes
- eventos completos
- condiciones cercanas al juego real

No activar el caos completo demasiado pronto.

---

## Forma correcta de trabajar sobre este proyecto

Antes de cambiar código:
1. leer la estructura actual de `hipodromo/`
2. identificar archivos exactos a tocar
3. justificar por qué
4. preferir cambios pequeños y explícitos
5. mantener el proyecto funcional tras cada fase

Cuando existan varias opciones:
- elegir la más mantenible
- elegir la más explícita
- evitar sofisticación innecesaria

---

## Meta final

La meta no es "hacer una IA bonita".
La meta es dejar un entorno RL sólido donde después se pueda reemplazar:

- `BaselineAgent.gd`
por
- `NeuralAgent.gd`

sin reescribir el resto del sistema.
