"""
Race Simulator Stub — Deterministic, seed-based race outcome generator.

Given a race_seed and a list of horse IDs, produces deterministic placements
(positions + finish times). Same seed + same horses = same result, always.
"""
import hashlib
import random
from dataclasses import dataclass, asdict
from typing import List


@dataclass
class Placement:
    horse_id: str
    position: int
    finish_time_ms: int


def simulate_race(race_seed: str, horse_ids: List[str]) -> List[Placement]:
    """
    Deterministic race simulation.

    Uses the race_seed to create a seeded RNG, then assigns each horse
    a base speed + variance, sorts by finish time, and produces placements.

    Args:
        race_seed: Any string — same seed = same result.
        horse_ids: List of horse identifiers (e.g. ["h1", "h2", ..., "h6"]).

    Returns:
        List of Placement objects sorted by position (1st, 2nd, ...).
    """
    if not horse_ids:
        return []

    # Derive integer seed from string
    seed_int = int(hashlib.sha256(race_seed.encode()).hexdigest(), 16) % (2**32)
    rng = random.Random(seed_int)

    # Generate finish times: base ~60s race, +/- variance per horse
    BASE_TIME_MS = 60_000
    VARIANCE_MS = 15_000

    finish_times = {}
    for horse_id in horse_ids:
        time_ms = BASE_TIME_MS + rng.randint(-VARIANCE_MS, VARIANCE_MS)
        finish_times[horse_id] = max(time_ms, 30_000)  # floor at 30s

    # Sort by finish time (ascending = faster = better position)
    sorted_horses = sorted(finish_times.items(), key=lambda x: x[1])

    placements = []
    for position, (horse_id, time_ms) in enumerate(sorted_horses, start=1):
        placements.append(Placement(
            horse_id=horse_id,
            position=position,
            finish_time_ms=time_ms,
        ))

    return placements


def placements_to_dicts(placements: List[Placement]) -> List[dict]:
    """Convert placements to JSON-serializable dicts."""
    return [asdict(p) for p in placements]


# Default horse roster for MVP (6 horses)
DEFAULT_HORSES = [f"horse_{i}" for i in range(1, 7)]
