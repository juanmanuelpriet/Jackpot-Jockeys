# Etapa 5: Simulación de Carrera + Mundos — Spec Completa

---

## 1) Modelo de Mundo (World Spec)

### Estructura del Mundo

Cada carrera ocurre en un **World** generado proceduralmente a partir de un seed. El mundo define la pista, la física ambiental, los hazards pre-posicionados, y los posibles atajos.

| Concepto | Descripción |
|---|---|
| **Bioma** | Define estética y parámetros físicos globales (fricción, drag, visibilidad). MVP: 4 biomas. |
| **Track** | Secuencia lineal de segmentos con 3 carriles. Distancia total en metros, con checkpoints. |
| **Hazards** | Obstáculos o zonas especiales pre-posicionadas en segmentos específicos. |
| **Shortcuts** | Atajos opcionales que reducen distancia pero agregan riesgo (ej. salto, zona estrecha). |
| **Laps** | Número de vueltas. MVP: 2–3 laps según largo de track. |

### Biomas MVP

| Bioma | Fricción Base | Drag | Hazard Bonus | Descripción |
|---|---|---|---|---|
| `desert` | 0.92 | 0.01 | sand_trap | Arena. Baja fricción, sin agua. |
| `jungle` | 0.88 | 0.02 | vine_snare | Vegetación densa, alta fricción. |
| `ice` | 0.78 | 0.005 | ice_patch | Resbaladizo. Baja fricción, bajo drag. |
| `neon_city` | 0.95 | 0.015 | oil_slick | Urbano. Alta fricción, obstáculos artificiales. |

### Track Representation: Lista de Segmentos (Opción B)

Cada segmento es un tramo con metadata:

```
Segment {
  id: int,
  type: "straight" | "curve_left" | "curve_right" | "chicane",
  length_m: float,          // metros de este tramo
  lanes: 3,                 // siempre 3 para MVP
  friction_mult: float,     // multiplicador sobre fricción base del bioma
  elevation: float,         // -1.0 (bajada) a 1.0 (subida), afecta vel
  hazard_ids: [string],     // hazards activos en este segmento
  shortcut: ShortcutDef | null,
  is_checkpoint: bool,      // ¿es punto de control para markets?
}
```

### WorldConfig JSON (ejemplo completo)

```json
{
  "seed": "a7f3c9e1b2d4",
  "biome": "jungle",
  "laps": 2,
  "track_length_m": 1200.0,
  "physics": {
    "base_friction": 0.88,
    "base_drag": 0.02,
    "gravity_accel": 9.8
  },
  "segments": [
    {
      "id": 0,
      "type": "straight",
      "length_m": 150.0,
      "friction_mult": 1.0,
      "elevation": 0.0,
      "hazard_ids": [],
      "shortcut": null,
      "is_checkpoint": false
    },
    {
      "id": 1,
      "type": "curve_right",
      "length_m": 80.0,
      "friction_mult": 0.9,
      "elevation": 0.1,
      "hazard_ids": ["vine_snare"],
      "shortcut": null,
      "is_checkpoint": true
    },
    {
      "id": 2,
      "type": "straight",
      "length_m": 200.0,
      "friction_mult": 1.0,
      "elevation": -0.2,
      "hazard_ids": [],
      "shortcut": {
        "id": "shortcut_0",
        "entry_pos_m": 50.0,
        "exit_pos_m": 180.0,
        "saved_m": 40.0,
        "risk": "stun_25pct"
      },
      "is_checkpoint": false
    }
  ],
  "checkpoints": [1, 5, 9],
  "hazard_schedule": [
    {"tick": 600, "type": "crosswind", "lane": 1, "duration_ticks": 100},
    {"tick": 1200, "type": "chaos_dice", "lane": -1, "duration_ticks": 1}
  ],
  "num_horses": 6
}
```

---

## 2) Generación Procedural por Seed

### Algoritmo

```python
def generate_world(seed: str, num_horses: int = 6) -> WorldConfig:
    rng = seeded_rng(seed)  # hashlib SHA256 -> int -> Random(int)
    
    # 1. Bioma
    biome = rng.choice(["desert", "jungle", "ice", "neon_city"])
    physics = BIOME_PHYSICS[biome]
    
    # 2. Track params
    num_segments = rng.randint(8, 14)            # 8-14 segmentos
    laps = rng.choice([2, 2, 3])                  # 2 laps más probable
    
    # 3. Generar segmentos
    segments = []
    total_length = 0.0
    checkpoint_interval = num_segments // 3       # ~3 checkpoints por vuelta
    
    for i in range(num_segments):
        seg_type = rng.choice(["straight", "straight", "curve_left", "curve_right", "chicane"])
        
        length = {
            "straight": rng.uniform(100, 250),
            "curve_left": rng.uniform(60, 120),
            "curve_right": rng.uniform(60, 120),
            "chicane": rng.uniform(40, 80),
        }[seg_type]
        
        elevation = rng.uniform(-0.3, 0.3)
        friction_mult = 1.0 + rng.uniform(-0.15, 0.05)
        
        # Hazards: max 1 por segmento, max 40% de segmentos tienen hazard
        hazard_ids = []
        if rng.random() < 0.35 and seg_type != "chicane":
            hazard_ids = [rng.choice(BIOME_HAZARDS[biome])]
        
        # Shortcut: max 2 por track, solo en rectas largas
        shortcut = None
        if seg_type == "straight" and length > 180 and rng.random() < 0.2:
            saved = rng.uniform(20, 50)
            shortcut = ShortcutDef(
                entry_pos_m=rng.uniform(20, 60),
                exit_pos_m=length - rng.uniform(20, 40),
                saved_m=saved,
                risk=rng.choice(["stun_25pct", "slowdown_50pct_2s"])
            )
        
        is_checkpoint = (i > 0 and i % checkpoint_interval == 0)
        
        segments.append(Segment(i, seg_type, length, friction_mult, 
                                elevation, hazard_ids, shortcut, is_checkpoint))
        total_length += length
    
    # 4. Scheduled global events (2-4 por carrera, no antes de tick 300)
    hazard_schedule = []
    total_ticks_estimate = int((total_length * laps / 15.0) * 20)  # ~15 m/s avg, 20Hz
    for _ in range(rng.randint(2, 4)):
        tick = rng.randint(300, max(301, total_ticks_estimate - 200))
        event_type = rng.choice(["crosswind", "chaos_dice", "turbo_zone", "toll_gate"])
        hazard_schedule.append(ScheduledHazard(tick, event_type, lane=-1, duration_ticks=rng.randint(40, 120)))
    
    return WorldConfig(seed, biome, laps, total_length, physics, 
                       segments, checkpoints, hazard_schedule, num_horses)
```

### Sanity Checks (validación post-generación)

| Regla | Límite |
|---|---|
| Track total | 800m ≤ total ≤ 3000m |
| Segmentos | 8 ≤ count ≤ 14 |
| Hazards por track | ≤ 5 estáticos |
| Shortcuts por track | ≤ 2 |
| Scheduled events | 2 ≤ count ≤ 4 |
| No 3 curvas seguidas | Reroll si ocurre |
| Checkpoints | ≥ 2 por vuelta |

Si falla un check → re-seed con `seed + "_retry_N"` hasta pasar.

---

## 3) Simulación (Tick Loop)

### Tick Rate: **20 Hz** (50ms por tick)

Razón: suficiente para sensación fluida en dashboard (60fps interpola 3 ticks), sin matar CPU en un server Python.

### Estado por Corredor

```python
@dataclass
class HorseState:
    horse_id: str
    pos_m: float          # posición en metros sobre el track (0..track_len*laps)
    lane: int             # 0, 1, 2 (izq, centro, der)
    vel_mps: float        # metros/segundo
    accel: float          # aceleración actual
    stamina: float        # 0.0-1.0, se gasta al sprintar, recarga lento
    status_flags: set     # {"stunned", "boosted", "slowed", "shielded"}
    stun_ticks_left: int  # ticks restantes de stun
    lap: int              # vuelta actual (0-indexed)
    segment_idx: int      # segmento actual
    finished: bool        # cruzó la meta final
    finish_tick: int      # tick en que terminó (-1 si no)
```

### Tick Loop (pseudocódigo)

```python
def run_simulation(world: WorldConfig, powers_queue: Queue) -> RaceLog:
    rng = seeded_rng(world.seed)
    horses = init_horses(world.num_horses, rng)  # stats base por seed
    tick = 0
    telemetry = []
    events = []
    
    while not all_finished(horses):
        tick += 1
        
        # 0. Procesar powers entrantes
        while not powers_queue.empty():
            power = powers_queue.get()
            if power.apply_tick <= tick:
                apply_power_modifier(horses, power)
                events.append(PowerEvent(tick, power))
        
        # 1. AI Decision (determinista por seed)
        for h in horses:
            if h.finished or h.stun_ticks_left > 0:
                continue
            ai_decide(h, world, rng, tick)  # cambia lane, ajusta accel
        
        # 2. Aplicar física de entorno
        for h in horses:
            if h.finished:
                continue
            seg = get_segment(world, h.pos_m)
            
            # Fricción = biome_base * segment_mult
            friction = world.physics.base_friction * seg.friction_mult
            
            # Elevación: subida frena, bajada acelera
            elev_force = -seg.elevation * 2.0
            
            # Drag cuadrático
            drag = -world.physics.base_drag * h.vel_mps * abs(h.vel_mps)
            
            # Stamina: si accel > threshold, gasta stamina
            if h.accel > 3.0 and h.stamina > 0:
                h.stamina -= 0.002
            else:
                h.stamina = min(1.0, h.stamina + 0.0005)
            
            stamina_mult = 0.6 + 0.4 * h.stamina  # fatigado = 60% fuerza
            
            # Integrar
            net_accel = (h.accel * stamina_mult * friction) + elev_force + drag
            h.vel_mps = max(0.5, h.vel_mps + net_accel * DT)  # min 0.5 m/s
            h.vel_mps = min(h.vel_mps, 25.0)                   # cap 25 m/s
            h.pos_m += h.vel_mps * DT
        
        # 3. Aplicar power modifiers activos
        for h in horses:
            if "boosted" in h.status_flags:
                h.vel_mps *= 1.15
            if "slowed" in h.status_flags:
                h.vel_mps *= 0.75
            if h.stun_ticks_left > 0:
                h.vel_mps = 0.0
                h.stun_ticks_left -= 1
                if h.stun_ticks_left == 0:
                    h.status_flags.discard("stunned")
        
        # 4. Colisiones (mismo lane, proximity < 2m)
        for i, a in enumerate(horses):
            for b in horses[i+1:]:
                if a.lane == b.lane and abs(a.pos_m - b.pos_m) < 2.0:
                    # Colisión elástica simplificada
                    avg_vel = (a.vel_mps + b.vel_mps) / 2
                    a.vel_mps = avg_vel * 0.85
                    b.vel_mps = avg_vel * 0.85
                    # El que va detrás se desvía lane
                    behind = a if a.pos_m < b.pos_m else b
                    behind.lane = clamp(behind.lane + rng.choice([-1, 1]), 0, 2)
                    events.append(CollisionEvent(tick, a.horse_id, b.horse_id))
        
        # 5. Hazards (segment-based)
        for h in horses:
            seg = get_segment(world, h.pos_m)
            for haz_id in seg.hazard_ids:
                if is_in_hazard_zone(h, seg, haz_id):
                    effect = apply_hazard(h, haz_id, rng)
                    events.append(HazardEvent(tick, h.horse_id, haz_id, effect))
        
        # 6. Scheduled global events
        for sched in world.hazard_schedule:
            if sched.tick == tick:
                for h in horses:
                    if sched.lane == -1 or h.lane == sched.lane:
                        apply_hazard(h, sched.type, rng)
                events.append(GlobalEvent(tick, sched.type))
        
        # 7. Checkpoint/Lap detection
        for h in horses:
            new_seg = get_segment_idx(world, h.pos_m)
            if new_seg != h.segment_idx:
                h.segment_idx = new_seg
                if world.segments[new_seg % len(world.segments)].is_checkpoint:
                    events.append(CheckpointEvent(tick, h.horse_id, new_seg, h.lap))
            
            # Lap complete
            new_lap = int(h.pos_m / world.track_length_m)
            if new_lap > h.lap:
                h.lap = new_lap
                events.append(LapEvent(tick, h.horse_id, h.lap))
                if h.lap >= world.laps:
                    h.finished = True
                    h.finish_tick = tick
        
        # 8. Emitir telemetría (cada tick)
        telemetry.append(snapshot_tick(tick, horses))
    
    return RaceLog(world.seed, telemetry, events)
```

### Constantes MVP

| Constante | Valor |
|---|---|
| `DT` (delta time) | 0.05s (1/20Hz) |
| `MAX_VEL` | 25 m/s (~90 km/h) |
| `MIN_VEL` | 0.5 m/s |
| `STUN_DURATION` | 20 ticks (1s) |
| `COLLISION_RADIUS` | 2.0m |
| `STAMINA_DRAIN` | 0.002/tick al sprintar |
| `STAMINA_REGEN` | 0.0005/tick en reposo |

---

## 4) Hazards/Eventos Globales (MVP)

### 8 Hazards Concretos

| # | ID | Tipo | Trigger | Efecto | Duración | Telemetría |
|---|---|---|---|---|---|---|
| 1 | `sand_trap` | Segment | Pisar zona (lane any) | `vel *= 0.6` | 40 ticks (2s) | `HAZARD_EVENT` |
| 2 | `vine_snare` | Segment | Pisar zona | Stun 15 ticks + retroceso 3m | Instantáneo | `HAZARD_EVENT` |
| 3 | `ice_patch` | Segment | Pisar zona | Lane aleatorio forzado + `vel *= 0.85` | 20 ticks | `HAZARD_EVENT` |
| 4 | `oil_slick` | Segment | Pisar zona (lane específico) | Stun 10 ticks | Instantáneo | `HAZARD_EVENT` |
| 5 | `crosswind` | Scheduled | Tick programado | Empuja todos 1 lane a la derecha | 100 ticks (5s) | `GLOBAL_EVENT` |
| 6 | `chaos_dice` | Scheduled | Tick programado | Random: boost O stun a CADA caballo (50/50) | Instantáneo | `GLOBAL_EVENT` |
| 7 | `turbo_zone` | Segment | Pisar zona (lane central) | `vel *= 1.4` por 30 ticks | 30 ticks | `HAZARD_EVENT` |
| 8 | `toll_gate` | Scheduled | Tick programado | El último lugar sube 3 posiciones de vel, el primero baja 2 | 60 ticks | `GLOBAL_EVENT` |

### Balance

- Max 5 hazards estáticos en segmentos por track.
- Max 4 eventos scheduled globales por carrera.
- `chaos_dice` aparece max 1 vez.
- `turbo_zone` solo en lane central → incentiva riesgo de colisión.

---

## 5) Telemetría Estándar (Dashboard + IA)

### Nivel 1: TICK_UPDATE (cada tick, broadcast cada 3 ticks para ahorro de BW)

```json
{
  "event_name": "TICK_UPDATE",
  "tick": 1420,
  "horses": [
    {
      "id": "horse_1",
      "pos_m": 847.3,
      "lane": 1,
      "vel_mps": 14.2,
      "lap": 1,
      "segment_idx": 7,
      "status": ["boosted"],
      "stamina": 0.72,
      "finished": false
    }
  ]
}
```

**Broadcast:** Cada 3 ticks (~6.67 Hz) al dashboard via WS. El dashboard interpola posiciones a 60fps en el frontend.

### Nivel 2: Event Telemetry (solo cuando pasa algo)

```json
{
  "event_name": "COLLISION_EVENT",
  "tick": 1205,
  "horse_a": "horse_2",
  "horse_b": "horse_5",
  "pos_m": 623.1,
  "lane": 2
}
```

```json
{
  "event_name": "HAZARD_EVENT",
  "tick": 890,
  "horse_id": "horse_3",
  "hazard_id": "vine_snare",
  "effect": "stun_15_ticks",
  "segment_idx": 4
}
```

```json
{
  "event_name": "LAP_CHECKPOINT_EVENT",
  "tick": 1100,
  "horse_id": "horse_1",
  "checkpoint_idx": 5,
  "lap": 1,
  "pos_m": 600.0,
  "is_lap_complete": false
}
```

### Nivel 3: Snapshot (resync completo)

```json
{
  "event_name": "SIM_SNAPSHOT",
  "tick": 1420,
  "seed": "a7f3c9e1b2d4",
  "world_config_hash": "sha256:3fa9...",
  "horses": [ /* array completo de HorseState */ ],
  "active_powers": [
    {"power_id": "pwr_boost_01", "target": "horse_3", "expires_tick": 1500}
  ],
  "elapsed_events_count": 47
}
```

### RACE_FINISHED

```json
{
  "event_name": "RACE_FINISHED",
  "tick": 3200,
  "placements": [
    {"horse_id": "horse_4", "position": 1, "finish_tick": 3050, "finish_time_s": 152.5},
    {"horse_id": "horse_1", "position": 2, "finish_tick": 3085, "finish_time_s": 154.25}
  ],
  "total_ticks": 3200,
  "total_time_s": 160.0,
  "seed": "a7f3c9e1b2d4"
}
```

---

## 6) Markets por Vuelta/Checkpoint (Integración con Apuestas)

### Creación de Markets

Al generar el WorldConfig, se crean markets adicionales:

```python
def create_lap_markets(race_id, world_config, db):
    # Market por cada lap
    for lap in range(1, world_config.laps + 1):
        market = Market(
            race_id=race_id,
            type=f"LapWinner_{lap}",
            status="Open",
            rake_pct=0.10,
        )
        db.add(market)
        # Selections = todos los caballos
        for i in range(1, world_config.num_horses + 1):
            sel = MarketSelection(market_id=market.id, selection_key=f"horse_{i}", pool_amount=0.0)
            db.add(sel)
    
    # Market por checkpoint (opcional, solo los primeros 3 checkpoints)
    for cp_idx in world_config.checkpoints[:3]:
        market = Market(
            race_id=race_id,
            type=f"CheckpointLeader_{cp_idx}",
            status="Open",
            rake_pct=0.10,
        )
        # ...
```

### Cierre y Liquidación

| Evento | Acción |
|---|---|
| Líder entra a 80% del segmento anterior al checkpoint | `MARKET_CLOSED` para ese market de checkpoint |
| Caballo cruza checkpoint/lap | `LAP_CHECKPOINT_EVENT` |
| Todos cruzan checkpoint | Mini-settlement parimutuel de ese market |
| Líder empieza última vuelta | Cerrar markets de laps anteriores si quedan abiertos |

### Mini-Settlement

Idéntico al settlement principal (parimutuel con rake), pero ejecutado en el momento del evento de lap/checkpoint, no al final de carrera. Los fondos se desbloquean inmediatamente.

---

## 7) Replays (Debug MVP)

### ReplayLog Schema

```json
{
  "version": "1.0",
  "seed": "a7f3c9e1b2d4",
  "world_config_hash": "sha256:3fa9b2c...",
  "tick_rate_hz": 20,
  "total_ticks": 3200,
  "num_horses": 6,
  "horse_base_stats": [
    {"id": "horse_1", "base_vel": 12.0, "base_accel": 2.5, "base_stamina": 0.85}
  ],
  "power_inputs": [
    {"tick": 450, "power_id": "pwr_oil_01", "target": "horse_3", "caster_user_id": 2},
    {"tick": 820, "power_id": "pwr_boost_01", "target": "horse_1", "caster_user_id": 5}
  ],
  "final_placements_hash": "sha256:e7d1a4...",
  "recorded_at": "2026-03-06T12:00:00Z"
}
```

### Almacenamiento

- **MVP**: JSON en columna `replay_log` tipo `JSONB` en tabla `races`.
- **Futuro**: Archivos `.replay.json.gz` en disco, path referenciado en DB.

### Reproducción

```python
def replay(log: ReplayLog) -> str:
    """Reconstruye la carrera y retorna hash de placements finales."""
    world = generate_world(log.seed)
    assert sha256(world) == log.world_config_hash
    
    sim = Simulation(world, tick_rate=log.tick_rate_hz)
    
    # Inyectar powers en los ticks correctos
    for pi in log.power_inputs:
        sim.schedule_power(pi.tick, pi.power_id, pi.target)
    
    result = sim.run()
    result_hash = sha256(result.placements)
    
    assert result_hash == log.final_placements_hash, "REPLAY MISMATCH!"
    return result_hash
```

---

## 8) Arquitectura de Integración con el Backend

### Decisión: **Opción A — Simulación dentro del backend (asyncio task)**

**Justificación MVP**: Evita complejidad Docker inter-servicio. La sim es liviana (6 caballos, 20Hz, puro math) y corre cómodamente en un async task de Python. Si crece, se extrae a microservicio sin cambiar la interfaz.

### Flujo de Integración

```
RaceEngine (state machine)
  │
  ├─ BettingOpen: crea WorldConfig, crea lap/checkpoint markets
  │
  ├─ RaceRunning: instancia Simulation(world_config)
  │     │
  │     ├─ sim.run() en asyncio.create_task()
  │     ├─ cada 3 ticks: broadcast TICK_UPDATE via manager.broadcast()
  │     ├─ en eventos: broadcast COLLISION/HAZARD/LAP events
  │     ├─ powers_queue: recibe POST /powers/cast y lo inyecta al sim
  │     └─ al terminar: emite RACE_FINISHED
  │
  ├─ Settling: usa placements del sim para settlement parimutuel
  │
  └─ Results: guarda ReplayLog en DB
```

### API Interna (function calls, no HTTP)

```python
class RaceSimulation:
    def __init__(self, world: WorldConfig, lobby_id: str):
        ...
    
    async def run(self):
        """Loop principal. Emite eventos via WS manager."""
        ...
    
    def apply_power(self, power_id: str, target_id: str, tick: int):
        """Llamado por POST /powers/cast handler."""
        ...
    
    def get_snapshot(self) -> dict:
        """Para GET_STATE_SNAPSHOT requests durante RaceRunning."""
        ...
    
    def get_placements(self) -> List[Placement]:
        """Resultado final post-simulación."""
        ...
    
    def get_replay_log(self) -> ReplayLog:
        """Log completo para almacenamiento y debug."""
        ...
```

### Modificación a `race_engine.py`

```python
async def _handle_race(self, race, db):
    if not self.simulation:
        world = generate_world(race.race_seed)
        self.simulation = RaceSimulation(world, self.lobby_id)
        asyncio.create_task(self.simulation.run())
    
    if self.simulation.is_finished():
        self.placements = self.simulation.get_placements()
        self.replay_log = self.simulation.get_replay_log()
        self._transition(race, "Settling", db)
    else:
        await asyncio.sleep(0.1)  # Check again next cycle
```

### Cola de Powers (Thread-safe)

```python
# En POST /powers/cast handler:
engine = engines.get(lobby_id)
if engine and engine.simulation:
    engine.simulation.apply_power(power_id, target_id, engine.simulation.current_tick)
```

---

## 9) Plan de Implementación (10 días) + DoD

### Plan Día a Día

| Día | Entregable | Archivos |
|---|---|---|
| **D1** | `WorldConfig` dataclasses + `generate_world(seed)` | `core/world.py` |
| **D2** | Sanity checks + tests de generación (10 seeds distintas) | `core/world.py`, `tests/test_world.py` |
| **D3** | `RaceSimulation` class + tick loop básico (pos, vel, accel) | `core/simulation.py` |
| **D4** | Lanes, colisiones, stamina, AI decisions | `core/simulation.py` |
| **D5** | 8 hazards + eventos schedulados | `core/hazards.py` |
| **D6** | Telemetría WS: `TICK_UPDATE`, `COLLISION_EVENT`, `HAZARD_EVENT`, `LAP_CHECKPOINT_EVENT` | `core/simulation.py`, `ws/manager.py` |
| **D7** | Lap/checkpoint markets: creación, cierre, mini-settlement | `core/race_engine.py`, `db/repository.py` |
| **D8** | `ReplayLog` + `replay_runner` + columna DB | `core/replay.py`, migrations |
| **D9** | Tests de determinismo (5 seeds) + perf profiling | `tests/test_simulation.py` |
| **D10** | Demo E2E: GM crea → jugadores apuestan → carrera simula → dashboard muestra posiciones live → settlement | Integración completa |

### Definition of Done (DoD)

| Criterio | Prueba |
|---|---|
| ✅ 5 carreras seguidas con tracks distintos por seed | `test_5_races_different_seeds` |
| ✅ Dashboard muestra posiciones en vivo + hazards + powers | Visual: barras de progreso se mueven en sync con TICK_UPDATE |
| ✅ Las mismas seed + acciones = mismos placements | `test_determinism: assert placements_a == placements_b` |
| ✅ Markets por lap se cierran y liquidan correctamente | `test_lap_market_settlement` |
| ✅ Replay reproduce la misma carrera (hash final igual) | `test_replay_hash_match` |
| ✅ 6 caballos a 20Hz sin lag perceptible | Profiling: tick < 2ms promedio |
| ✅ Powers inyectados mid-race afectan la simulación | `test_power_modifies_outcome` |
| ✅ Colisiones producen cambio de lane y slowdown | `test_collision_resolution` |
