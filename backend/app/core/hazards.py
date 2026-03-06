"""
Hazard Effects — Defines how each hazard type modifies a horse's state.

All effects are applied deterministically using the DetRNG.
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.rng import DetRNG


# ── Hazard Effect Functions ──
# Each returns a string describing the effect for telemetry.


def apply_hazard(horse, hazard_id: str, rng: "DetRNG") -> str:
    """Apply a segment-based hazard to a horse. Returns effect description."""
    if hazard_id == "sand_trap":
        horse.vel_mmps = horse.vel_mmps * 600 // 1000
        return "slowdown_60pct"

    elif hazard_id == "vine_snare":
        horse.stun_ticks_left = max(horse.stun_ticks_left, 15)
        horse.pos_mm = max(0, horse.pos_mm - 3000)  # retroceso 3m
        return "stun_15_retro_3m"

    elif hazard_id == "ice_patch":
        new_lane = rng.randint(0, 2)
        horse.lane = new_lane
        horse.lane_change_cooldown = 10
        horse.vel_mmps = horse.vel_mmps * 850 // 1000
        return f"lane_force_{new_lane}_slow_85pct"

    elif hazard_id == "oil_slick":
        horse.stun_ticks_left = max(horse.stun_ticks_left, 10)
        return "stun_10"

    elif hazard_id == "turbo_zone":
        # Only lane 1 (central) gets boost — caller checks lane
        from app.core.simulation import ActiveMod
        horse.active_mods.append(ActiveMod(
            mod_type="speed_boost",
            mult_permil=1400,
            expires_tick=horse._current_tick + 30,  # set by caller
            source_power_id="turbo_zone",
        ))
        return "boost_140pct_30t"

    else:
        return "unknown"


def apply_scheduled_event(horses: list, event_type: str, push_direction: int,
                          tick: int, rng: "DetRNG") -> str:
    """Apply a global scheduled event to all (non-finished) horses."""
    from app.core.simulation import ActiveMod

    if event_type == "crosswind":
        for h in horses:
            if h.finished:
                continue
            new_lane = h.lane + push_direction
            h.lane = max(0, min(2, new_lane))  # clamp, no wrap
            h.lane_change_cooldown = 10
        return f"push_lane_{push_direction}"

    elif event_type == "chaos_dice":
        for h in horses:
            if h.finished:
                continue
            if rng.random_permil() < 500:
                h.active_mods.append(ActiveMod("speed_boost", 1200, tick + 40, "chaos"))
            else:
                h.stun_ticks_left = max(h.stun_ticks_left, 15)
        return "chaos_boost_or_stun"

    elif event_type == "turbo_zone":
        for h in horses:
            if h.finished or h.lane != 1:
                continue
            h.active_mods.append(ActiveMod("speed_boost", 1400, tick + 30, "turbo_global"))
        return "turbo_lane1_only"

    elif event_type == "toll_gate":
        active = [h for h in horses if not h.finished]
        if active:
            ranked = sorted(active, key=lambda h: -h.pos_mm)
            ranked[0].vel_mmps = ranked[0].vel_mmps * 800 // 1000   # leader -20%
            ranked[-1].vel_mmps = ranked[-1].vel_mmps * 1300 // 1000  # last +30%
        return "toll_leader_down_last_up"

    return "unknown"
