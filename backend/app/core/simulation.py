"""
Race Simulation — Tick-based deterministic race engine.

All units: mm (position), mm/s (velocity), mm/s² (acceleration), permil (multipliers).
Tick rate: 20 Hz (DT = 50ms).
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field, asdict
from typing import Optional

from app.core.rng import DetRNG
from app.core.world import WorldConfig, canonical_hash
from app.core.hazards import apply_hazard, apply_scheduled_event

# ── Constants ──

TICK_RATE_HZ = 20
DT_MS = 50  # 1000 / 20
MAX_VEL_MMPS = 25_000  # 25 m/s
MIN_VEL_MMPS = 500     # 0.5 m/s
COLLISION_RADIUS_MM = 2_000  # 2m
LANE_CHANGE_COOLDOWN = 10   # ticks (0.5s)
LANE_CHANGE_PENALTY_PERMIL = 900  # -10% velocity
STAMINA_DRAIN_PER_TICK = 2   # permil
STAMINA_REGEN_PER_TICK = 1   # permil
SPRINT_THRESHOLD_MMPS2 = 3_000
BROADCAST_INTERVAL = 3  # ticks


# ── Data Classes ──

@dataclass
class ActiveMod:
    mod_type: str           # "speed_boost", "speed_slow", "stun"
    mult_permil: int        # 1000 = neutral
    expires_tick: int
    source_power_id: str

@dataclass
class HorseState:
    horse_id: str
    pos_mm: int = 0
    lane: int = 1            # start center
    vel_mmps: int = 0
    accel_mmps2: int = 0
    stamina_permil: int = 850
    active_mods: list[ActiveMod] = field(default_factory=list)
    stun_ticks_left: int = 0
    lane_change_cooldown: int = 0
    lap: int = 0
    segment_idx: int = 0
    finished: bool = False
    finish_tick: int = -1
    _current_tick: int = 0   # internal, for hazards

    # Base stats (set at init, used by AI)
    base_vel_mmps: int = 12_000
    base_accel_mmps2: int = 2_500

@dataclass
class SimEvent:
    event_name: str
    tick: int
    data: dict

@dataclass
class TickSnapshot:
    tick: int
    horses: list[dict]

@dataclass
class PowerInput:
    power_id: str
    target_id: str
    caster_user_id: int
    telegraph_ms: int
    duration_s: float

@dataclass
class ScheduledPower:
    power_id: str
    target_id: str
    caster_user_id: int
    telegraph_tick: int
    apply_tick: int
    expire_tick: int
    mult_permil: int

@dataclass
class Placement:
    horse_id: str
    position: int
    finish_tick: int


# ── Power Effects Catalog ──

POWER_EFFECTS = {
    "pwr_boost_01":    {"mod_type": "speed_boost", "mult_permil": 1150},
    "pwr_oil_01":      {"mod_type": "speed_slow",  "mult_permil": 750},
    "pwr_scramble_01": {"mod_type": "speed_slow",  "mult_permil": 600},
}


# ── Helper Functions ──

def compute_speed_multiplier(mods: list[ActiveMod], tick: int) -> int:
    """Multiplicative stack of all active speed mods. Returns permil."""
    result = 1000
    for mod in mods:
        if mod.expires_tick > tick and mod.mod_type != "stun":
            result = result * mod.mult_permil // 1000
    return max(result, 100)  # floor at 10% to prevent zero


def init_horses(num_horses: int, rng: DetRNG) -> list[HorseState]:
    """Initialize horses with seeded base stats."""
    horses = []
    for i in range(1, num_horses + 1):
        base_vel = 11_000 + rng.randint(0, 3_000)   # 11-14 m/s
        base_accel = 2_000 + rng.randint(0, 1_500)   # 2-3.5 m/s²
        stamina = 700 + rng.randint(0, 300)           # 700-1000 permil
        lane = rng.randint(0, 2)
        horses.append(HorseState(
            horse_id=f"horse_{i}",
            vel_mmps=base_vel,
            lane=lane,
            stamina_permil=stamina,
            base_vel_mmps=base_vel,
            base_accel_mmps2=base_accel,
        ))
    return horses


def build_tick_snapshot(tick: int, horses: list[HorseState], world: WorldConfig) -> TickSnapshot:
    """Build a snapshot with rank and progress."""
    total_dist_mm = world.track_length_mm * world.laps
    # Sort by position descending for rank
    ranked = sorted(horses, key=lambda h: -h.pos_mm)
    rank_map = {h.horse_id: rank + 1 for rank, h in enumerate(ranked)}

    horse_data = []
    for h in horses:
        progress = h.pos_mm * 1000 // total_dist_mm if total_dist_mm > 0 else 0
        mod_names = [m.source_power_id for m in h.active_mods if m.expires_tick > tick]
        horse_data.append({
            "id": h.horse_id,
            "pos_mm": h.pos_mm,
            "lane": h.lane,
            "vel_mmps": h.vel_mmps,
            "lap": h.lap,
            "segment_idx": h.segment_idx,
            "rank": rank_map[h.horse_id],
            "progress_permil": min(progress, 1000),
            "stamina_permil": h.stamina_permil,
            "active_mods": mod_names,
            "finished": h.finished,
        })
    return TickSnapshot(tick=tick, horses=horse_data)


def ai_decide(horse: HorseState, world: WorldConfig, rng: DetRNG, tick: int):
    """Simple deterministic AI: adjust acceleration and optionally change lane."""
    # Base acceleration with some variance per tick
    horse.accel_mmps2 = horse.base_accel_mmps2 + rng.randint(-500, 500)

    # Lane change: occasionally, with cooldown
    if horse.lane_change_cooldown <= 0 and rng.random_permil() < 30:  # 3% chance per tick
        direction = rng.choice([-1, 1])
        new_lane = horse.lane + direction
        if 0 <= new_lane <= 2:
            horse.lane = new_lane
            horse.lane_change_cooldown = LANE_CHANGE_COOLDOWN
            horse.vel_mmps = horse.vel_mmps * LANE_CHANGE_PENALTY_PERMIL // 1000

    # Speed management: slow down if stamina low
    if horse.stamina_permil < 200:
        horse.accel_mmps2 = horse.accel_mmps2 * 500 // 1000  # half effort


# ── Main Simulation ──

class RaceSimulation:
    """Tick-based deterministic race simulation."""

    def __init__(self, world: WorldConfig, lobby_id: str,
                 powers_queue: Optional[asyncio.Queue] = None,
                 broadcast_fn=None):
        self.world = world
        self.lobby_id = lobby_id
        self.powers_queue = powers_queue
        self.broadcast_fn = broadcast_fn  # async fn(lobby_id, event_dict)
        self.rng = DetRNG(world.seed + "_sim")
        self.horses = init_horses(world.num_horses, self.rng)
        self.tick = 0
        self.events: list[SimEvent] = []
        self.tick_snapshots: list[TickSnapshot] = []
        self.scheduled_powers: list[ScheduledPower] = []
        self.power_inputs_log: list[dict] = []  # for replay
        self._finished = False
        self._hazard_cooldowns: dict[str, int] = {}  # "horse_id:hazard_id" → cooldown_tick

    def is_finished(self) -> bool:
        return self._finished

    @property
    def current_tick(self) -> int:
        return self.tick

    async def run(self):
        """Main simulation loop. Runs at ~20Hz wall-clock."""
        while not self._all_finished():
            self.tick += 1
            self._step()

            # Broadcast every N ticks
            if self.tick % BROADCAST_INTERVAL == 0 and self.broadcast_fn:
                snap = self.tick_snapshots[-1] if self.tick_snapshots else None
                if snap:
                    await self.broadcast_fn(self.lobby_id, {
                        "event_name": "TICK_UPDATE",
                        "tick": snap.tick,
                        "horses": snap.horses,
                    })

            # Broadcast events immediately
            pending = [e for e in self.events if e.tick == self.tick]
            if pending and self.broadcast_fn:
                for ev in pending:
                    await self.broadcast_fn(self.lobby_id, {
                        "event_name": ev.event_name,
                        **ev.data,
                        "tick": ev.tick,
                    })

            # Pace to ~20Hz wall clock
            await asyncio.sleep(DT_MS / 1000.0)

        # Emit RACE_FINISHED
        placements = self.get_placements()
        finish_event = {
            "event_name": "RACE_FINISHED",
            "tick": self.tick,
            "placements": [asdict(p) for p in placements],
            "total_ticks": self.tick,
            "seed": self.world.seed,
            "config_hash": self.world.config_hash,
        }
        self.events.append(SimEvent("RACE_FINISHED", self.tick, finish_event))
        if self.broadcast_fn:
            await self.broadcast_fn(self.lobby_id, finish_event)
        self._finished = True

    def _step(self):
        """Execute one simulation tick."""
        tick = self.tick

        # Set _current_tick on all horses for hazard effects
        for h in self.horses:
            h._current_tick = tick

        # 0. Ingest powers from queue
        self._ingest_powers()

        # 0b. Apply/Expire scheduled powers
        self._process_scheduled_powers()

        # 1. AI decisions (sorted by horse_id)
        for h in sorted(self.horses, key=lambda h: h.horse_id):
            if h.finished or h.stun_ticks_left > 0:
                continue
            ai_decide(h, self.world, self.rng, tick)

        # 2. Physics
        for h in sorted(self.horses, key=lambda h: h.horse_id):
            if h.finished:
                continue
            self._apply_physics(h)

        # 3. Collisions (sorted for determinism)
        self._resolve_collisions()

        # 4. Segment hazards
        self._check_segment_hazards()

        # 5. Scheduled events
        self._check_scheduled_events()

        # 6. Checkpoint/Lap detection
        self._check_laps_checkpoints()

        # 7. Tick snapshot
        snap = build_tick_snapshot(tick, self.horses, self.world)
        self.tick_snapshots.append(snap)

    def _apply_physics(self, h: HorseState):
        tick = self.tick
        seg_idx = self.world.get_segment_idx(h.pos_mm)
        seg = self.world.segments[seg_idx]

        # Friction: biome × segment
        friction = self.world.physics.friction_permil * seg.friction_mult_permil // 1000

        # Elevation
        elev_force = -seg.elevation_permil * 2

        # Drag: -drag × vel² / 1000000
        drag = -(self.world.physics.drag_permil * h.vel_mmps * abs(h.vel_mmps)) // 1_000_000

        # Stamina
        if h.accel_mmps2 > SPRINT_THRESHOLD_MMPS2 and h.stamina_permil > 0:
            h.stamina_permil = max(0, h.stamina_permil - STAMINA_DRAIN_PER_TICK)
        else:
            h.stamina_permil = min(1000, h.stamina_permil + STAMINA_REGEN_PER_TICK)

        stamina_mult = 600 + (400 * h.stamina_permil // 1000)

        # Net acceleration
        base_accel = h.accel_mmps2 * stamina_mult // 1000 * friction // 1000
        net_accel = base_accel + elev_force + drag

        # Integrate velocity
        h.vel_mmps = h.vel_mmps + net_accel * DT_MS // 1000
        h.vel_mmps = max(MIN_VEL_MMPS, min(h.vel_mmps, MAX_VEL_MMPS))

        # Apply active modifier stack
        speed_mult = compute_speed_multiplier(h.active_mods, tick)
        effective_vel = h.vel_mmps * speed_mult // 1000

        # Stun override
        if h.stun_ticks_left > 0:
            effective_vel = 0
            h.stun_ticks_left -= 1

        # Update position
        h.pos_mm += effective_vel * DT_MS // 1000

        # Lane cooldown
        if h.lane_change_cooldown > 0:
            h.lane_change_cooldown -= 1

        # Expire old mods
        h.active_mods = [m for m in h.active_mods if m.expires_tick > tick]

    def _resolve_collisions(self):
        sorted_h = sorted(self.horses, key=lambda h: h.horse_id)
        for i in range(len(sorted_h)):
            a = sorted_h[i]
            if a.finished:
                continue
            for j in range(i + 1, len(sorted_h)):
                b = sorted_h[j]
                if b.finished:
                    continue
                if a.lane == b.lane and abs(a.pos_mm - b.pos_mm) < COLLISION_RADIUS_MM:
                    avg_vel = (a.vel_mmps + b.vel_mmps) // 2
                    a.vel_mmps = avg_vel * 850 // 1000
                    b.vel_mmps = avg_vel * 850 // 1000
                    behind = a if a.pos_mm < b.pos_mm else b
                    direction = self.rng.choice([-1, 1])
                    behind.lane = max(0, min(2, behind.lane + direction))
                    behind.lane_change_cooldown = LANE_CHANGE_COOLDOWN
                    self.events.append(SimEvent("COLLISION_EVENT", self.tick, {
                        "horse_a": a.horse_id, "horse_b": b.horse_id,
                        "pos_mm": a.pos_mm, "lane": a.lane,
                    }))

    def _check_segment_hazards(self):
        for h in sorted(self.horses, key=lambda h: h.horse_id):
            if h.finished:
                continue
            seg_idx = self.world.get_segment_idx(h.pos_mm)
            seg = self.world.segments[seg_idx]
            local_mm = (h.pos_mm % self.world.track_length_mm) - self.world.segment_start_mm[seg_idx]
            local_permil = local_mm * 1000 // seg.length_mm if seg.length_mm > 0 else 0

            for slot in seg.hazard_slots:
                if slot.zone_start_permil <= local_permil <= slot.zone_end_permil:
                    if slot.lane == -1 or slot.lane == h.lane:
                        cooldown_key = f"{h.horse_id}:{slot.hazard_id}:{seg_idx}"
                        if self._hazard_cooldowns.get(cooldown_key, 0) <= self.tick:
                            # Turbo zone only for lane 1
                            if slot.hazard_id == "turbo_zone" and h.lane != 1:
                                continue
                            effect = apply_hazard(h, slot.hazard_id, self.rng)
                            self._hazard_cooldowns[cooldown_key] = self.tick + 40
                            self.events.append(SimEvent("HAZARD_EVENT", self.tick, {
                                "horse_id": h.horse_id, "hazard_id": slot.hazard_id,
                                "effect": effect, "segment_idx": seg_idx,
                                "local_permil": local_permil,
                            }))

    def _check_scheduled_events(self):
        for sched in self.world.hazard_schedule:
            if sched.tick == self.tick:
                active_horses = sorted(
                    [h for h in self.horses if not h.finished],
                    key=lambda h: h.horse_id
                )
                effect = apply_scheduled_event(
                    active_horses, sched.type, sched.push_direction,
                    self.tick, self.rng
                )
                self.events.append(SimEvent("GLOBAL_EVENT", self.tick, {
                    "type": sched.type, "effect": effect,
                }))

    def _check_laps_checkpoints(self):
        for h in self.horses:
            if h.finished:
                continue
            new_seg = self.world.get_segment_idx(h.pos_mm)
            if new_seg != h.segment_idx:
                h.segment_idx = new_seg
                actual_seg = self.world.segments[new_seg % len(self.world.segments)]
                if actual_seg.is_checkpoint:
                    self.events.append(SimEvent("LAP_CHECKPOINT_EVENT", self.tick, {
                        "horse_id": h.horse_id,
                        "checkpoint_segment_idx": new_seg,
                        "lap": h.lap, "pos_mm": h.pos_mm,
                        "is_lap_complete": False,
                    }))

            new_lap = h.pos_mm // self.world.track_length_mm
            if new_lap > h.lap:
                h.lap = new_lap
                self.events.append(SimEvent("LAP_CHECKPOINT_EVENT", self.tick, {
                    "horse_id": h.horse_id,
                    "checkpoint_segment_idx": 0,
                    "lap": h.lap, "pos_mm": h.pos_mm,
                    "is_lap_complete": True,
                }))
                if h.lap >= self.world.laps:
                    h.finished = True
                    h.finish_tick = self.tick

    def _ingest_powers(self):
        if not self.powers_queue:
            return
        while True:
            try:
                pwr: PowerInput = self.powers_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            telegraph_ticks = pwr.telegraph_ms // DT_MS
            apply_tick = self.tick + telegraph_ticks
            duration_ticks = int(pwr.duration_s * 1000) // DT_MS
            expire_tick = apply_tick + duration_ticks

            effect = POWER_EFFECTS.get(pwr.power_id, {"mod_type": "speed_slow", "mult_permil": 800})

            sp = ScheduledPower(
                power_id=pwr.power_id, target_id=pwr.target_id,
                caster_user_id=pwr.caster_user_id,
                telegraph_tick=self.tick, apply_tick=apply_tick,
                expire_tick=expire_tick, mult_permil=effect["mult_permil"],
            )
            self.scheduled_powers.append(sp)
            self.power_inputs_log.append({
                "tick": self.tick, "power_id": pwr.power_id,
                "target": pwr.target_id, "caster_user_id": pwr.caster_user_id,
                "telegraph_ticks": telegraph_ticks, "duration_ticks": duration_ticks,
            })

            self.events.append(SimEvent("POWER_TELEGRAPH", self.tick, {
                "power_id": pwr.power_id, "target_id": pwr.target_id,
                "apply_tick": apply_tick,
            }))

    def _process_scheduled_powers(self):
        for sp in self.scheduled_powers:
            if sp.apply_tick == self.tick:
                target = next((h for h in self.horses if h.horse_id == sp.target_id), None)
                if target and not target.finished:
                    effect = POWER_EFFECTS.get(sp.power_id, {"mod_type": "speed_slow", "mult_permil": 800})
                    target.active_mods.append(ActiveMod(
                        effect["mod_type"], sp.mult_permil, sp.expire_tick, sp.power_id,
                    ))
                    self.events.append(SimEvent("POWER_APPLIED", self.tick, {
                        "power_id": sp.power_id, "target_id": sp.target_id,
                        "expires_tick": sp.expire_tick,
                    }))

            if sp.expire_tick == self.tick:
                target = next((h for h in self.horses if h.horse_id == sp.target_id), None)
                if target:
                    target.active_mods = [
                        m for m in target.active_mods
                        if not (m.source_power_id == sp.power_id and m.expires_tick == self.tick)
                    ]
                    self.events.append(SimEvent("POWER_EXPIRED", self.tick, {
                        "power_id": sp.power_id, "target_id": sp.target_id,
                    }))

    def _all_finished(self) -> bool:
        return all(h.finished for h in self.horses)

    # ── Public API ──

    def apply_power(self, power_id: str, target_id: str,
                    caster_user_id: int, telegraph_ms: int,
                    duration_s: float):
        """Enqueue a power application (called from API handler)."""
        if self.powers_queue:
            self.powers_queue.put_nowait(PowerInput(
                power_id, target_id, caster_user_id, telegraph_ms, duration_s
            ))

    def get_placements(self) -> list[Placement]:
        """Return final placements sorted by finish tick."""
        finished = sorted(
            [h for h in self.horses if h.finished],
            key=lambda h: h.finish_tick
        )
        return [
            Placement(h.horse_id, pos + 1, h.finish_tick)
            for pos, h in enumerate(finished)
        ]

    def get_snapshot(self) -> dict:
        """Full state snapshot for client resync."""
        snap = build_tick_snapshot(self.tick, self.horses, self.world)
        active_powers = [
            {"power_id": sp.power_id, "target": sp.target_id,
             "apply_tick": sp.apply_tick, "expires_tick": sp.expire_tick}
            for sp in self.scheduled_powers
            if sp.expire_tick > self.tick
        ]
        return {
            "event_name": "SIM_SNAPSHOT",
            "tick": self.tick,
            "seed": self.world.seed,
            "world_config_hash": self.world.config_hash,
            "horses": snap.horses,
            "active_powers": active_powers,
        }

    def get_replay_log(self) -> dict:
        """Build complete replay log for storage."""
        placements = self.get_placements()
        # Final state hash
        final_state = {h.horse_id: {
            "pos_mm": h.pos_mm, "vel_mmps": h.vel_mmps,
            "lane": h.lane, "lap": h.lap, "finish_tick": h.finish_tick,
        } for h in self.horses}

        return {
            "version": "1.0",
            "sim_version": self.world.sim_version,
            "seed": self.world.seed,
            "world_config_hash": self.world.config_hash,
            "tick_rate_hz": TICK_RATE_HZ,
            "total_ticks": self.tick,
            "num_horses": self.world.num_horses,
            "physics_snapshot": asdict(self.world.physics),
            "horse_base_stats": [
                {"id": h.horse_id, "base_vel_mmps": h.base_vel_mmps,
                 "base_accel_mmps2": h.base_accel_mmps2,
                 "base_stamina_permil": h.stamina_permil}
                for h in self.horses
            ],
            "power_inputs": self.power_inputs_log,
            "final_placements": [asdict(p) for p in placements],
            "final_placements_hash": canonical_hash(
                [asdict(p) for p in placements]
            ),
            "final_state_hash": canonical_hash(final_state),
        }
