"""
World Config — Track representation, biome physics, procedural generation.

All spatial units in millimeters (int). All multipliers in permil (int, 1000 = 1.0x).
"""
from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Optional

from app.core.rng import DetRNG

# ── Constants ──

SIM_VERSION = "1.0.0"

BIOME_PHYSICS = {
    "desert":    {"friction_permil": 920, "drag_permil": 10, "gravity_mmps2": 9800},
    "jungle":    {"friction_permil": 880, "drag_permil": 20, "gravity_mmps2": 9800},
    "ice":       {"friction_permil": 780, "drag_permil":  5, "gravity_mmps2": 9800},
    "neon_city": {"friction_permil": 950, "drag_permil": 15, "gravity_mmps2": 9800},
}

BIOME_HAZARDS = {
    "desert":    ["sand_trap", "sand_trap", "turbo_zone"],
    "jungle":    ["vine_snare", "vine_snare", "turbo_zone"],
    "ice":       ["ice_patch", "ice_patch", "turbo_zone"],
    "neon_city": ["oil_slick", "oil_slick", "turbo_zone"],
}

SEGMENT_TYPES = ["straight", "straight", "curve_left", "curve_right", "chicane"]


# ── Data Classes ──

@dataclass
class HazardSlot:
    hazard_id: str
    zone_start_permil: int  # 0-1000
    zone_end_permil: int    # 0-1000
    lane: int               # -1 = all lanes

@dataclass
class ShortcutDef:
    entry_offset_mm: int
    exit_offset_mm: int
    saved_mm: int
    risk: str

@dataclass
class Segment:
    id: int
    type: str
    length_mm: int
    lanes: int = 3
    friction_mult_permil: int = 1000
    elevation_permil: int = 0
    hazard_slots: list[HazardSlot] = field(default_factory=list)
    shortcut: Optional[ShortcutDef] = None
    is_checkpoint: bool = False

@dataclass
class ScheduledHazard:
    tick: int
    type: str
    push_direction: int = 0  # -1/+1 for crosswind
    duration_ticks: int = 1

@dataclass
class Physics:
    friction_permil: int
    drag_permil: int
    gravity_mmps2: int

@dataclass
class WorldConfig:
    seed: str
    sim_version: str
    biome: str
    laps: int
    track_length_mm: int
    physics: Physics
    segments: list[Segment]
    segment_start_mm: list[int]
    segment_end_mm: list[int]
    hazard_schedule: list[ScheduledHazard]
    num_horses: int
    config_hash: str = ""

    def to_dict(self) -> dict:
        """Serializable dict (for hashing and storage)."""
        d = asdict(self)
        d.pop("config_hash", None)
        return d

    def get_segment_idx(self, pos_mm: int) -> int:
        """Get segment index for an absolute position (wraps per lap)."""
        lap_pos = pos_mm % self.track_length_mm
        for i, end in enumerate(self.segment_end_mm):
            if lap_pos < end:
                return i
        return len(self.segments) - 1


# ── Canonical Hash ──

def canonical_hash(obj: dict) -> str:
    canonical = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ── World Generator ──

MAX_RETRIES = 10


def generate_world(seed: str, num_horses: int = 6) -> WorldConfig:
    """Generate a deterministic WorldConfig from a seed string."""
    for attempt in range(MAX_RETRIES):
        actual_seed = seed if attempt == 0 else f"{seed}_r{attempt}"
        try:
            return _generate(actual_seed, num_horses)
        except AssertionError:
            continue
    # Last attempt, let it raise
    return _generate(f"{seed}_r{MAX_RETRIES}", num_horses)


def _generate(seed: str, num_horses: int) -> WorldConfig:
    rng = DetRNG(seed)

    # 1. Biome
    biome = rng.choice(["desert", "jungle", "ice", "neon_city"])
    phys_dict = BIOME_PHYSICS[biome]
    physics = Physics(**phys_dict)

    # 2. Track params
    num_segments = rng.randint(8, 14)
    laps = rng.choice([2, 2, 3])

    # 3. Generate segments
    segments: list[Segment] = []
    segment_start_mm: list[int] = []
    segment_end_mm: list[int] = []
    total_mm = 0
    checkpoint_interval = max(2, num_segments // 3)
    curve_streak = 0
    shortcut_count = 0
    hazard_count = 0

    for i in range(num_segments):
        seg_type = rng.choice(SEGMENT_TYPES)

        # No 3 curves in a row
        if seg_type.startswith("curve"):
            curve_streak += 1
            if curve_streak >= 3:
                seg_type = "straight"
                curve_streak = 0
        else:
            curve_streak = 0

        length_ranges = {
            "straight": (100_000, 250_000),
            "curve_left": (60_000, 120_000),
            "curve_right": (60_000, 120_000),
            "chicane": (40_000, 80_000),
        }
        lo, hi = length_ranges[seg_type]
        length_mm = rng.randint(lo, hi)
        elevation = rng.randint(-300, 300)
        friction_mult = 1000 + rng.randint(-150, 50)

        # Hazards: max 1 per segment, max 5 total
        hazard_slots: list[HazardSlot] = []
        if hazard_count < 5 and rng.random_permil() < 350 and seg_type != "chicane":
            haz_id = rng.choice(BIOME_HAZARDS[biome])
            zone_start = rng.randint(200, 500)
            zone_end = min(zone_start + rng.randint(150, 250), 950)
            lane = rng.choice([-1, -1, 0, 1, 2])
            hazard_slots.append(HazardSlot(haz_id, zone_start, zone_end, lane))
            hazard_count += 1

        # Shortcuts: max 2, only long straights
        shortcut: Optional[ShortcutDef] = None
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

        segments.append(Segment(
            id=i, type=seg_type, length_mm=length_mm,
            friction_mult_permil=friction_mult, elevation_permil=elevation,
            hazard_slots=hazard_slots, shortcut=shortcut,
            is_checkpoint=is_checkpoint,
        ))

    # 4. Scheduled global events (2–4)
    avg_speed_mmps = 15_000  # ~15 m/s average
    estimated_total_ticks = (total_mm * laps) // avg_speed_mmps * 20  # 20Hz
    hazard_schedule: list[ScheduledHazard] = []
    chaos_placed = False
    for _ in range(rng.randint(2, 4)):
        tick = rng.randint(300, max(301, estimated_total_ticks - 200))
        candidates = ["crosswind", "turbo_zone", "toll_gate"]
        if not chaos_placed:
            candidates.append("chaos_dice")
        etype = rng.choice(candidates)
        if etype == "chaos_dice":
            chaos_placed = True
        dur = rng.randint(40, 120) if etype != "chaos_dice" else 1
        push_dir = rng.choice([-1, 1]) if etype == "crosswind" else 0
        hazard_schedule.append(ScheduledHazard(tick, etype, push_dir, dur))

    # Sort schedule by tick for deterministic processing
    hazard_schedule.sort(key=lambda h: h.tick)

    # 5. Sanity checks
    cp_count = sum(1 for s in segments if s.is_checkpoint)
    assert 800_000 <= total_mm <= 3_000_000, f"Track {total_mm}mm out of range"
    assert 8 <= len(segments) <= 14
    assert hazard_count <= 5
    assert shortcut_count <= 2
    assert cp_count >= 2, f"Only {cp_count} checkpoints"

    config = WorldConfig(
        seed=seed, sim_version=SIM_VERSION, biome=biome, laps=laps,
        track_length_mm=total_mm, physics=physics, segments=segments,
        segment_start_mm=segment_start_mm, segment_end_mm=segment_end_mm,
        hazard_schedule=hazard_schedule, num_horses=num_horses,
    )
    config.config_hash = canonical_hash(config.to_dict())
    return config
