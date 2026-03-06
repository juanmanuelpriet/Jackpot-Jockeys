# Etapa 5: Simulación de Carrera + Mundos — Spec Completa (v2)

> **Cambios vs v1:** Precisión entera (mm), RNG custom determinista, canonical hashing,
> segment mapping explícito, lane cooldowns, collision ordering, hazard geometry,
> power modifier stacks, telegraph por tick, telemetría con rank/progress,
> WS backpressure, market closure zones, mini-settlement con locks, replay completo.

---

## 1) Modelo de Mundo (World Spec)

### Unidades — TODO en enteros

| Magnitud | Unidad | Tipo | Razón |
|---|---|---|---|
| Posición | milímetros (mm) | `int` | Sin float drift entre plataformas |
| Velocidad | mm/s | `int` | Coherente con posición |
| Aceleración | mm/s² | `int` | Entero |
| Distancia track | mm | `int` | Entero |
| Stamina | 0–1000 (permil) | `int` | Evita 0.0–1.0 float |
| Dinero | centavos | `int` | Ya existe backend (pero usa float, migrar después) |
| Ticks | contador | `int` | Obvio |

### Biomas MVP

| Bioma | friction_permil | drag_permil | Hazard Nativo | Descripción |
|---|---|---|---|---|
| `desert` | 920 | 10 | `sand_trap` | Arena. Baja fricción. |
| `jungle` | 880 | 20 | `vine_snare` | Vegetación densa. |
| `ice` | 780 | 5 | `ice_patch` | Resbaladizo. |
| `neon_city` | 950 | 15 | `oil_slick` | Urbano, obstáculos artificiales. |

> `friction_permil=920` significa factor `0.920`. Se opera como `vel * friction_permil // 1000`.

### Track: Lista de Segmentos con Lookup Table

```python
@dataclass
class Segment:
    id: int
    type: str                     # "straight" | "curve_left" | "curve_right" | "chicane"
    length_mm: int                # milímetros
    lanes: int                    # siempre 3 MVP
    friction_mult_permil: int     # 1000 = neutral, 900 = resbaloso
    elevation_permil: int         # -300 a +300 (bajada/subida)
    hazard_slots: list[HazardSlot]  # hazards con zona explícita
    shortcut: ShortcutDef | None
    is_checkpoint: bool           # TRUE = punto de control para markets

@dataclass
class HazardSlot:
    hazard_id: str
    zone_start_permil: int        # 0-1000: inicio de zona dentro del segmento
    zone_end_permil: int          # 0-1000: fin de zona
    lane: int                     # -1 = todos, 0/1/2 = lane específico

@dataclass
class ShortcutDef:
    entry_offset_mm: int
    exit_offset_mm: int
    saved_mm: int
    risk: str
```

### Segment Lookup Table (pre-computada al construir track)

```python
# Al construir WorldConfig:
segment_start_mm: list[int] = []   # segment_start_mm[i] = posición absoluta de inicio
segment_end_mm: list[int] = []     # segment_end_mm[i] = posición absoluta de fin

cumulative = 0
for seg in segments:
    segment_start_mm.append(cumulative)
    cumulative += seg.length_mm
    segment_end_mm.append(cumulative)

track_length_mm = cumulative       # distancia total de 1 vuelta

def get_segment_idx(pos_mm: int) -> int:
    """Binary search o linear scan sobre segment_end_mm."""
    lap_pos = pos_mm % track_length_mm
    for i, end in enumerate(segment_end_mm):
        if lap_pos < end:
            return i
    return len(segments) - 1
```

### Checkpoints: por segmento (decisión)

Los checkpoints son **segment-based**: el flag `is_checkpoint=True` en el segmento define el punto. La posición absoluta se deriva de `segment_start_mm[idx]`. No hay duplicidad.

### Finish Line

Un caballo **termina** cuando `pos_mm >= track_length_mm * laps`. El tick exacto en que cruza se registra como `finish_tick`. No importa en qué parte del segmento final esté.

### WorldConfig JSON (ejemplo v2)

```json
{
  "seed": "a7f3c9e1b2d4",
  "sim_version": "1.0.0",
  "biome": "jungle",
  "laps": 2,
  "track_length_mm": 1200000,
  "physics": {
    "friction_permil": 880,
    "drag_permil": 20,
    "gravity_mmps2": 9800
  },
  "segments": [
    {
      "id": 0,
      "type": "straight",
      "length_mm": 150000,
      "friction_mult_permil": 1000,
      "elevation_permil": 0,
      "hazard_slots": [],
      "shortcut": null,
      "is_checkpoint": false
    },
    {
      "id": 1,
      "type": "curve_right",
      "length_mm": 80000,
      "friction_mult_permil": 900,
      "elevation_permil": 100,
      "hazard_slots": [
        {
          "hazard_id": "vine_snare",
          "zone_start_permil": 600,
          "zone_end_permil": 800,
          "lane": -1
        }
      ],
      "shortcut": null,
      "is_checkpoint": true
    }
  ],
  "segment_start_mm": [0, 150000],
  "segment_end_mm": [150000, 230000],
  "hazard_schedule": [
    {"tick": 600, "type": "crosswind", "push_direction": 1, "duration_ticks": 100},
    {"tick": 1200, "type": "chaos_dice", "lane": -1, "duration_ticks": 1}
  ],
  "num_horses": 6
}
```

### Canonical Hash

```python
import json, hashlib

def canonical_hash(obj: dict) -> str:
    canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

Siempre usar `sort_keys=True, separators=(",",":")`  para que el hash sea estable.

---

## 2) Generación Procedural por Seed

### RNG Determinista Custom: XorShift32

No depender de `random.Random` (varía entre CPython/PyPy/versiones). Implementación embebida:

```python
class DetRNG:
    """XorShift32 — determinista, portable, rápido."""
    
    def __init__(self, seed_str: str):
        h = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
        self.state = int(h[:8], 16) | 1  # nunca 0
    
    def _next(self) -> int:
        x = self.state
        x ^= (x << 13) & 0xFFFFFFFF
        x ^= (x >> 17)
        x ^= (x << 5) & 0xFFFFFFFF
        self.state = x & 0xFFFFFFFF
        return self.state
    
    def randint(self, lo: int, hi: int) -> int:
        """Inclusive [lo, hi]."""
        span = hi - lo + 1
        return lo + (self._next() % span)
    
    def choice(self, seq: list):
        return seq[self._next() % len(seq)]
    
    def random_permil(self) -> int:
        """0..999 (equivale a random() * 1000 truncado)."""
        return self._next() % 1000
```

### Algoritmo de Generación

```python
def generate_world(seed: str, num_horses: int = 6) -> WorldConfig:
    rng = DetRNG(seed)
    
    # 1. Bioma
    biome = rng.choice(["desert", "jungle", "ice", "neon_city"])
    physics = BIOME_PHYSICS[biome]
    
    # 2. Track params
    num_segments = rng.randint(8, 14)
    laps = rng.choice([2, 2, 3])  # 2 más probable
    
    # 3. Generar segmentos
    segments = []
    total_mm = 0
    segment_start_mm = []
    segment_end_mm = []
    checkpoint_interval = max(2, num_segments // 3)
    prev_type = ""
    curve_streak = 0
    shortcut_count = 0
    hazard_count = 0
    
    for i in range(num_segments):
        seg_type = rng.choice(["straight", "straight", "curve_left", "curve_right", "chicane"])
        
        # Regla: no 3 curvas seguidas
        if seg_type.startswith("curve"):
            curve_streak += 1
            if curve_streak >= 3:
                seg_type = "straight"
                curve_streak = 0
        else:
            curve_streak = 0
        
        length_mm = {
            "straight": rng.randint(100_000, 250_000),
            "curve_left": rng.randint(60_000, 120_000),
            "curve_right": rng.randint(60_000, 120_000),
            "chicane": rng.randint(40_000, 80_000),
        }[seg_type]
        
        elevation = rng.randint(-300, 300)
        friction_mult = 1000 + rng.randint(-150, 50)
        
        # Hazards: max 1 por segmento, max 5 total
        hazard_slots = []
        if hazard_count < 5 and rng.random_permil() < 350 and seg_type != "chicane":
            native = BIOME_HAZARDS[biome]
            haz_id = rng.choice(native)
            zone_start = rng.randint(200, 500)  # 20%-50% del segmento
            zone_end = zone_start + rng.randint(150, 250)  # 15%-25% ancho
            zone_end = min(zone_end, 950)
            lane = rng.choice([-1, -1, 0, 1, 2])  # -1=todos más probable
            hazard_slots.append(HazardSlot(haz_id, zone_start, zone_end, lane))
            hazard_count += 1
        
        # Shortcuts: max 2, solo rectas >180m
        shortcut = None
        if shortcut_count < 2 and seg_type == "straight" and length_mm > 180_000:
            if rng.random_permil() < 200:
                entry = rng.randint(20_000, 60_000)
                exit_off = length_mm - rng.randint(20_000, 40_000)
                saved = rng.randint(20_000, 50_000)
                risk = rng.choice(["stun_25pct", "slowdown_50pct_2s"])
                shortcut = ShortcutDef(entry, exit_off, saved, risk)
                shortcut_count += 1
        
        is_checkpoint = (i > 0 and i % checkpoint_interval == 0)
        
        segment_start_mm.append(total_mm)
        total_mm += length_mm
        segment_end_mm.append(total_mm)
        
        segments.append(Segment(i, seg_type, length_mm, friction_mult,
                                elevation, hazard_slots, shortcut, is_checkpoint))
    
    # 4. Scheduled global events (2–4)
    avg_ticks = (total_mm * laps) // 15_000 * 20  # ~15 m/s, 20Hz
    hazard_schedule = []
    for _ in range(rng.randint(2, 4)):
        tick = rng.randint(300, max(301, avg_ticks - 200))
        etype = rng.choice(["crosswind", "chaos_dice", "turbo_zone", "toll_gate"])
        dur = rng.randint(40, 120)
        push_dir = rng.choice([-1, 1]) if etype == "crosswind" else 0
        hazard_schedule.append(ScheduledHazard(tick, etype, push_dir, dur))
    
    # Sanity checks
    assert 800_000 <= total_mm <= 3_000_000, f"Track length {total_mm}mm OOB"
    assert 8 <= len(segments) <= 14
    assert hazard_count <= 5
    assert shortcut_count <= 2
    cp_count = sum(1 for s in segments if s.is_checkpoint)
    assert cp_count >= 2, f"Only {cp_count} checkpoints"
    
    config = WorldConfig(seed, "1.0.0", biome, laps, total_mm, physics,
                         segments, segment_start_mm, segment_end_mm,
                         hazard_schedule, num_horses)
    config.config_hash = canonical_hash(config.to_dict())
    return config
```

Si falla un assert → re-seed con `seed + "_r1"`, `"_r2"`, etc. Max 10 intentos.

---

## 3) Simulación (Tick Loop)

### Tick Rate: **20 Hz** (DT = 50ms)

### Estado por Corredor (todo enteros)

```python
@dataclass
class HorseState:
    horse_id: str
    pos_mm: int              # 0 .. track_length_mm * laps
    lane: int                # 0, 1, 2
    vel_mmps: int            # mm/s (0..25000 = 0..25 m/s)
    accel_mmps2: int         # mm/s²
    stamina_permil: int      # 0–1000
    active_mods: list        # [{type, mult_permil, expires_tick}]
    stun_ticks_left: int
    lane_change_cooldown: int  # ticks restantes hasta poder cambiar lane
    lap: int
    segment_idx: int
    finished: bool
    finish_tick: int         # -1 si no terminó
```

### Active Modifiers (en vez de status_flags)

```python
@dataclass
class ActiveMod:
    mod_type: str           # "speed_boost", "speed_slow", "stun"
    mult_permil: int        # 1000 = neutral, 1150 = +15%, 750 = -25%
    expires_tick: int        # tick en que se remueve
    source_power_id: str     # para telemetría
```

Múltiples mods se **stackean multiplicativamente**:

```python
def compute_speed_multiplier(mods: list[ActiveMod], tick: int) -> int:
    """Retorna permil multiplicador (1000 = 1x)."""
    result = 1000
    for mod in mods:
        if mod.expires_tick > tick and mod.mod_type != "stun":
            result = result * mod.mult_permil // 1000
    return result
```

### Lane Change Rules

- `lane_change_cooldown_ticks = 10` (0.5s)
- Al cambiar lane: `vel_mmps = vel_mmps * 900 // 1000` (penalidad -10%)
- Si cooldown > 0, AI no puede cambiar lane

### Tick Loop (pseudocódigo v2)

```python
DT_MS = 50  # 50ms = 20Hz

def run_simulation(world: WorldConfig, powers_queue: Queue) -> RaceResult:
    rng = DetRNG(world.seed + "_sim")
    horses = init_horses(world.num_horses, rng)
    tick = 0
    events: list[SimEvent] = []
    tick_snapshots: list[TickSnapshot] = []
    scheduled_powers: list[ScheduledPower] = []  # telegraph → applied → expired
    
    while not all_finished(horses):
        tick += 1
        
        # 0. Ingest powers from external queue (non-blocking)
        while not powers_queue.empty():
            pwr = powers_queue.get_nowait()
            telegraph_ticks = pwr.telegraph_ms // DT_MS
            apply_tick = tick + telegraph_ticks
            expire_tick = apply_tick + (pwr.duration_s * 1000 // DT_MS)
            scheduled_powers.append(ScheduledPower(
                pwr.power_id, pwr.target_id, pwr.caster_id,
                telegraph_tick=tick, apply_tick=apply_tick, expire_tick=expire_tick,
                mult_permil=POWER_EFFECTS[pwr.power_id].mult_permil
            ))
            events.append(TelegraphEvent(tick, pwr))
        
        # 0b. Apply/Expire scheduled powers
        for sp in scheduled_powers:
            if sp.apply_tick == tick:
                target = get_horse(horses, sp.target_id)
                target.active_mods.append(ActiveMod(
                    POWER_EFFECTS[sp.power_id].mod_type,
                    sp.mult_permil, sp.expire_tick, sp.power_id
                ))
                events.append(PowerAppliedEvent(tick, sp))
            if sp.expire_tick == tick:
                target = get_horse(horses, sp.target_id)
                target.active_mods = [m for m in target.active_mods 
                                       if m.source_power_id != sp.power_id 
                                       or m.expires_tick != tick]
                events.append(PowerExpiredEvent(tick, sp))
        
        # 1. AI Decision (determinista)
        for h in sorted(horses, key=lambda h: h.horse_id):  # orden estable
            if h.finished or h.stun_ticks_left > 0:
                continue
            ai_decide(h, world, rng, tick)  # ajusta accel, puede cambiar lane
        
        # 2. Física de entorno
        for h in sorted(horses, key=lambda h: h.horse_id):
            if h.finished:
                continue
            seg_idx = get_segment_idx(world, h.pos_mm)
            seg = world.segments[seg_idx]
            
            # Posición local dentro del segmento
            local_mm = h.pos_mm % world.track_length_mm - world.segment_start_mm[seg_idx]
            
            # Fricción combinada: biome * segment
            friction = world.physics.friction_permil * seg.friction_mult_permil // 1000
            
            # Elevación: subida frena, bajada acelera
            elev_force_mmps2 = -seg.elevation_permil * 2  # ±600 max
            
            # Drag cuadrático: -drag * vel² / 1000 (escalado)
            drag_mmps2 = -(world.physics.drag_permil * h.vel_mmps * abs(h.vel_mmps)) // (1000 * 1000)
            
            # Stamina
            if h.accel_mmps2 > 3000 and h.stamina_permil > 0:
                h.stamina_permil = max(0, h.stamina_permil - 2)
            else:
                h.stamina_permil = min(1000, h.stamina_permil + 1)
            
            stamina_mult = 600 + (400 * h.stamina_permil // 1000)  # 600..1000
            
            # Net accel (todo enteros)
            base_accel = h.accel_mmps2 * stamina_mult // 1000 * friction // 1000
            net_accel = base_accel + elev_force_mmps2 + drag_mmps2
            
            # Integrate: vel += accel * DT, pos += vel * DT
            h.vel_mmps = h.vel_mmps + net_accel * DT_MS // 1000
            
            # Clamp vel
            h.vel_mmps = max(500, min(h.vel_mmps, 25000))  # 0.5..25 m/s
            
            # Apply active modifiers (multiplicative stack)
            speed_mult = compute_speed_multiplier(h.active_mods, tick)
            effective_vel = h.vel_mmps * speed_mult // 1000
            
            # Stun override
            if h.stun_ticks_left > 0:
                effective_vel = 0
                h.stun_ticks_left -= 1
            
            # Update position
            h.pos_mm += effective_vel * DT_MS // 1000
            
            # Lane cooldown tick-down
            if h.lane_change_cooldown > 0:
                h.lane_change_cooldown -= 1
        
        # 3. Colisiones (sorted by horse_id para determinismo)
        sorted_h = sorted(horses, key=lambda h: h.horse_id)
        for i in range(len(sorted_h)):
            for j in range(i + 1, len(sorted_h)):
                a, b = sorted_h[i], sorted_h[j]
                if a.finished or b.finished:
                    continue
                if a.lane == b.lane and abs(a.pos_mm - b.pos_mm) < 2000:  # 2m
                    avg_vel = (a.vel_mmps + b.vel_mmps) // 2
                    a.vel_mmps = avg_vel * 850 // 1000
                    b.vel_mmps = avg_vel * 850 // 1000
                    # El que va detrás se desvía
                    behind = a if a.pos_mm < b.pos_mm else b
                    new_lane = behind.lane + rng.choice([-1, 1])
                    behind.lane = max(0, min(2, new_lane))
                    behind.lane_change_cooldown = 10
                    events.append(CollisionEvent(tick, a.horse_id, b.horse_id, a.pos_mm))
        
        # 4. Segment-based hazards
        for h in sorted(horses, key=lambda h: h.horse_id):
            if h.finished:
                continue
            seg_idx = get_segment_idx(world, h.pos_mm)
            seg = world.segments[seg_idx]
            local_mm = (h.pos_mm % world.track_length_mm) - world.segment_start_mm[seg_idx]
            local_permil = local_mm * 1000 // seg.length_mm
            
            for slot in seg.hazard_slots:
                if slot.zone_start_permil <= local_permil <= slot.zone_end_permil:
                    if slot.lane == -1 or slot.lane == h.lane:
                        effect = apply_hazard(h, slot.hazard_id, rng)
                        events.append(HazardEvent(tick, h.horse_id, slot.hazard_id, effect, seg_idx))
        
        # 5. Scheduled global events
        for sched in world.hazard_schedule:
            if sched.tick == tick:
                for h in sorted(horses, key=lambda h: h.horse_id):
                    if h.finished:
                        continue
                    if sched.type == "crosswind":
                        new_lane = h.lane + sched.push_direction
                        h.lane = max(0, min(2, new_lane))  # clamp, no wrap
                        h.lane_change_cooldown = 10
                    elif sched.type == "chaos_dice":
                        if rng.random_permil() < 500:
                            h.active_mods.append(ActiveMod("speed_boost", 1200, tick + 40, "chaos"))
                        else:
                            h.stun_ticks_left = max(h.stun_ticks_left, 15)
                    elif sched.type == "toll_gate":
                        # Handled after ranking
                        pass
                    elif sched.type == "turbo_zone":
                        if h.lane == 1:  # solo lane central
                            h.active_mods.append(ActiveMod("speed_boost", 1400, tick + 30, "turbo"))
                
                # toll_gate: último sube, primero baja
                if sched.type == "toll_gate":
                    ranked = sorted([h for h in horses if not h.finished], key=lambda h: -h.pos_mm)
                    if ranked:
                        ranked[0].vel_mmps = ranked[0].vel_mmps * 800 // 1000  # líder -20%
                        ranked[-1].vel_mmps = ranked[-1].vel_mmps * 1300 // 1000  # último +30%
                
                events.append(GlobalEvent(tick, sched.type))
        
        # 6. Checkpoint/Lap detection
        for h in horses:
            if h.finished:
                continue
            new_seg = get_segment_idx(world, h.pos_mm)
            if new_seg != h.segment_idx:
                h.segment_idx = new_seg
                if world.segments[new_seg % len(world.segments)].is_checkpoint:
                    events.append(CheckpointEvent(tick, h.horse_id, new_seg, h.lap))
            
            new_lap = h.pos_mm // world.track_length_mm
            if new_lap > h.lap:
                h.lap = new_lap
                events.append(LapEvent(tick, h.horse_id, h.lap))
                if h.lap >= world.laps:
                    h.finished = True
                    h.finish_tick = tick
        
        # 7. Emit tick snapshot (stored every tick, broadcast every 3)
        snap = build_tick_snapshot(tick, horses, world)
        tick_snapshots.append(snap)
    
    return RaceResult(world, tick_snapshots, events, build_placements(horses))
```

---

## 4) Hazards/Eventos Globales (MVP)

| # | ID | Tipo | Zona/Trigger | Efecto | Duración | Lane Policy |
|---|---|---|---|---|---|---|
| 1 | `sand_trap` | Segment | zone 60%–80% seg | `vel *= 600/1000` | 40 ticks | lane -1 o específico |
| 2 | `vine_snare` | Segment | zone 40%–60% seg | Stun 15 ticks, retroceso 3000mm | Instantáneo | lane -1 |
| 3 | `ice_patch` | Segment | zone 50%–75% seg | Lane forzado (rng), `vel *= 850/1000` | 20 ticks | lane -1 |
| 4 | `oil_slick` | Segment | zone 30%–50% seg | Stun 10 ticks | Instantáneo | lane específico (0/1/2) |
| 5 | `crosswind` | Scheduled | tick programado | Push todos +1 o -1 lane | 100 ticks | todos, clamp a 0 o 2 |
| 6 | `chaos_dice` | Scheduled | tick programado | 50% boost 1.2x / 50% stun 15t PER horse | Instantáneo | todos, max 1 por carrera |
| 7 | `turbo_zone` | Scheduled | tick programado | `vel *= 1400/1000` por 30 ticks | 30 ticks | SOLO lane 1 (central) |
| 8 | `toll_gate` | Scheduled | tick programado | Último +30% vel, Primero -20% vel | 60 ticks | todos (ranking-based) |

### Reglas de borde

- **Crosswind push a lane 2 (ya en 2):** No pasa nada (`max(0, min(2, lane+dir))`).
- **Hazard re-entry:** Cooldown de 40 ticks por hazard por caballo para evitar retrigger en loop.
- **Chaos dice:** Máximo 1 por carrera (validar en generación).

---

## 5) Telemetría Estándar (Dashboard + IA)

### TICK_UPDATE (broadcast cada 3 ticks = 6.67 Hz)

```json
{
  "event_name": "TICK_UPDATE",
  "tick": 1420,
  "horses": [
    {
      "id": "horse_1",
      "pos_mm": 847300,
      "lane": 1,
      "vel_mmps": 14200,
      "lap": 1,
      "segment_idx": 7,
      "rank": 2,
      "progress_permil": 706,
      "stamina_permil": 720,
      "active_mods": ["speed_boost"],
      "finished": false
    }
  ]
}
```

> `rank` = posición actual (1=líder). `progress_permil` = `pos_mm * 1000 // total_distance_mm`.

### Decimation adaptativa

```python
def broadcast_interval(active_lobbies: int) -> int:
    if active_lobbies <= 3:  return 3   # ticks
    if active_lobbies <= 10: return 5
    return 8  # 2.5 Hz para >10 lobbies
```

### Event Telemetry

```json
{"event_name": "COLLISION_EVENT", "tick": 1205,
 "horse_a": "horse_2", "horse_b": "horse_5", "pos_mm": 623100, "lane": 2}

{"event_name": "HAZARD_EVENT", "tick": 890,
 "horse_id": "horse_3", "hazard_id": "vine_snare", "effect": "stun_15",
 "segment_idx": 4, "local_permil": 650}

{"event_name": "LAP_CHECKPOINT_EVENT", "tick": 1100,
 "horse_id": "horse_1", "checkpoint_segment_idx": 5,
 "lap": 1, "pos_mm": 600000, "is_lap_complete": true}

{"event_name": "POWER_TELEGRAPH", "tick": 450,
 "power_id": "pwr_oil_01", "target_id": "horse_3", "apply_tick": 460}

{"event_name": "POWER_APPLIED", "tick": 460,
 "power_id": "pwr_oil_01", "target_id": "horse_3", "expires_tick": 520}

{"event_name": "POWER_EXPIRED", "tick": 520,
 "power_id": "pwr_oil_01", "target_id": "horse_3"}
```

### Backpressure: Ring Buffer + Drop

```python
class WSTelemetryBuffer:
    """Per-client ring buffer. Si el client se atrasa, se borra y manda snapshot."""
    
    def __init__(self, max_ticks: int = 200):   # 10s a 20Hz
        self.buffer = deque(maxlen=max_ticks)
    
    def push(self, tick_data):
        self.buffer.append(tick_data)
    
    def drain(self) -> list:
        items = list(self.buffer)
        self.buffer.clear()
        return items
    
    def is_lagging(self) -> bool:
        return len(self.buffer) >= self.buffer.maxlen
    
    # Si is_lagging(): no mandar buffer, mandar SIM_SNAPSHOT en vez
```

### SIM_SNAPSHOT (resync)

```json
{
  "event_name": "SIM_SNAPSHOT",
  "tick": 1420,
  "seed": "a7f3c9e1b2d4",
  "world_config_hash": "sha256:3fa9b2c...",
  "horses": [ "/* full HorseState array */" ],
  "active_powers": [
    {"power_id": "pwr_boost_01", "target": "horse_3",
     "apply_tick": 400, "expires_tick": 500}
  ]
}
```

### RACE_FINISHED

```json
{
  "event_name": "RACE_FINISHED",
  "tick": 3200,
  "placements": [
    {"horse_id": "horse_4", "position": 1, "finish_tick": 3050},
    {"horse_id": "horse_1", "position": 2, "finish_tick": 3085}
  ],
  "total_ticks": 3200,
  "seed": "a7f3c9e1b2d4",
  "config_hash": "sha256:3fa9b2c..."
}
```

---

## 6) Markets por Vuelta/Checkpoint

### Creación

Al generar WorldConfig (en `BettingOpen`), se crean markets adicionales:

- `LapWinner_1`, `LapWinner_2`, ... (uno por lap)
- `CheckpointLeader_3`, `CheckpointLeader_7`, ... (por segment_idx con `is_checkpoint`)

### Closure Zone: 90% del lap

```python
def check_market_closure(horses, world, tick, open_markets):
    leader = max(horses, key=lambda h: h.pos_mm)
    
    for market in open_markets:
        if market.type.startswith("LapWinner_"):
            lap_num = int(market.type.split("_")[1])
            close_at_mm = world.track_length_mm * lap_num * 900 // 1000  # 90% of lap
            if leader.pos_mm >= close_at_mm:
                close_market(market)
                emit_event("MARKET_CLOSED", market)
        
        elif market.type.startswith("CheckpointLeader_"):
            cp_idx = int(market.type.split("_")[1])
            cp_mm = world.segment_start_mm[cp_idx]
            close_at_mm = cp_mm - (cp_mm * 100 // 1000)  # 10% antes del CP
            if leader.pos_mm % world.track_length_mm >= close_at_mm:
                close_market(market)
```

### Mini-Settlement

Idéntico al settlement parimutuel principal pero ejecutado mid-carrera:

```python
def mini_settle(market, winner_horse_id, db):
    """
    Liquida un market de lap/checkpoint en el momento.
    Usa SELECT FOR UPDATE + transacción atómica.
    """
    with db.begin():
        market = db.query(Market).filter_by(id=market.id).with_for_update().one()
        assert market.status == "Closed"
        
        # Parimutuel standard (mismo code que settle_race pero 1 market)
        total_pool = sum(s.pool_amount for s in market.selections)
        net_pool = total_pool * (1000 - market.rake_permil) // 1000
        
        # ... (idéntico a settlement principal)
        
        market.status = "Settled"
        market.settled_at = now()
    
    # Broadcast
    await manager.broadcast(lobby_id, {
        "event_name": "MINI_SETTLEMENT_COMPLETE",
        "market_type": market.type,
        "winner": winner_horse_id,
        "total_pool": total_pool,
        "state_version": race.state_version
    })
```

---

## 7) Replays (Debug MVP)

### ReplayLog Completo

```json
{
  "version": "1.0",
  "sim_version": "1.0.0",
  "seed": "a7f3c9e1b2d4",
  "world_config_hash": "sha256:3fa9b2c...",
  "tick_rate_hz": 20,
  "total_ticks": 3200,
  "num_horses": 6,
  "physics_snapshot": {
    "friction_permil": 880,
    "drag_permil": 20,
    "gravity_mmps2": 9800
  },
  "horse_base_stats": [
    {"id": "horse_1", "base_vel_mmps": 12000, "base_accel_mmps2": 2500, "base_stamina_permil": 850}
  ],
  "power_inputs": [
    {"tick": 450, "power_id": "pwr_oil_01", "target": "horse_3", "caster_user_id": 2,
     "telegraph_ticks": 10, "duration_ticks": 60}
  ],
  "final_placements": [
    {"horse_id": "horse_4", "position": 1, "finish_tick": 3050}
  ],
  "final_placements_hash": "sha256:e7d1a4...",
  "final_state_hash": "sha256:b8c2f1...",
  "recorded_at": "2026-03-06T12:00:00Z"
}
```

> `final_state_hash` = hash canónico del estado completo de TODOS los caballos al último tick (pos, vel, lane, mods, lap, etc.), no solo placements.

### Almacenamiento

- MVP: Columna `replay_log JSONB` en tabla `races`.
- Futuro: `.replay.json.gz` en disco.

### Reproducción

```python
def replay_and_verify(log: ReplayLog) -> bool:
    world = generate_world(log.seed)
    assert canonical_hash(world) == log.world_config_hash
    assert world.sim_version == log.sim_version
    
    sim = Simulation(world)
    for pi in log.power_inputs:
        sim.schedule_power(pi.tick, pi.power_id, pi.target, pi.telegraph_ticks, pi.duration_ticks)
    
    result = sim.run()
    
    placements_hash = canonical_hash(result.placements)
    state_hash = canonical_hash(result.final_state)
    
    assert placements_hash == log.final_placements_hash, "PLACEMENTS MISMATCH"
    assert state_hash == log.final_state_hash, "STATE MISMATCH"
    return True
```

---

## 8) Arquitectura de Integración

### Decisión: **Opción A — asyncio task dentro del backend**

Liviano (6 caballos, 20Hz, puro math entero). Se extrae a microservicio si crece.

### Modificación a `race_engine.py`

```python
class RaceEngine:
    def __init__(self, lobby_id):
        self.lobby_id = lobby_id
        self.simulation: RaceSimulation | None = None
        self.powers_queue = asyncio.Queue()
    
    async def _handle_race(self, race, db):
        if not self.simulation:
            world = generate_world(race.race_seed)
            # Crear lap/checkpoint markets
            create_lap_markets(race.id, world, db)
            db.commit()
            self.simulation = RaceSimulation(world, self.lobby_id, self.powers_queue)
            asyncio.create_task(self.simulation.run())
        
        if self.simulation.is_finished():
            self.placements = self.simulation.get_placements()
            # Guardar replay
            race.replay_log = self.simulation.get_replay_log().to_dict()
            db.commit()
            self._transition(race, "Settling", db)
        else:
            await asyncio.sleep(0.05)
```

### Cola de Powers (thread-safe)

```python
# En POST /powers/cast handler:
engine = engines.get(lobby_id)
if engine and engine.simulation:
    await engine.powers_queue.put(PowerInput(
        power_id=power_id, target_id=target_id, caster_id=user_id,
        telegraph_ms=POWER_CATALOG[power_id].telegraph_ms,
        duration_s=effective_duration_s
    ))
```

---

## 9) Plan (10 días) + DoD

| Día | Entregable | Archivos |
|---|---|---|
| **D1** | `DetRNG`, `WorldConfig` dataclasses, `canonical_hash` | `core/world.py`, `core/rng.py` |
| **D2** | `generate_world(seed)` + sanity checks + tests (10 seeds) | `core/world.py`, `tests/test_world.py` |
| **D3** | `HorseState`, tick loop básico (pos, vel, accel, stamina) | `core/simulation.py` |
| **D4** | Lanes (cooldown+penalty), colisiones (sorted), `ActiveMod` stacks | `core/simulation.py` |
| **D5** | 8 hazards + eventos scheduled + zone geometry | `core/hazards.py` |
| **D6** | Telemetría WS: TICK_UPDATE, events, backpressure ring buffer | `core/simulation.py`, `ws/manager.py` |
| **D7** | Lap/checkpoint markets, closure zones, mini-settlement con locks | `core/race_engine.py`, `db/repository.py` |
| **D8** | `ReplayLog` + `replay_and_verify` + columna JSONB | `core/replay.py`, migration |
| **D9** | Tests determinismo (5 seeds) + perf profiling (<2ms/tick) | `tests/test_simulation.py` |
| **D10** | Demo E2E: dashboard consume TICK_UPDATE, powers mid-race, settlement | Integración |

### DoD

| Criterio | Prueba |
|---|---|
| ✅ 5 carreras con tracks distintos por seed | `test_5_unique_tracks` |
| ✅ Determinismo: seed+powers = mismo resultado | `test_determinism_with_powers` |
| ✅ Dashboard muestra posiciones (rank/progress) en vivo | Visual: barras se mueven con TICK_UPDATE |
| ✅ Markets por lap se cierran en closure zone (90%) | `test_lap_market_closure` |
| ✅ Mini-settlement liquida mid-race con locks | `test_mini_settlement_atomic` |
| ✅ Replay verifica placements_hash + state_hash | `test_replay_hash_match` |
| ✅ <2ms por tick (6 caballos, 20Hz) | `test_perf_tick_under_2ms` |
| ✅ Colisiones sorted por horse_id son deterministas | `test_collision_determinism` |
| ✅ Hazards respetan zone geometry y lane policy | `test_hazard_zone_geometry` |
| ✅ Powers: telegraph→applied→expired por tick_id | `test_power_lifecycle_ticks` |
