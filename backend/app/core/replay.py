"""
Replay — Deterministic replay verification.

Replays a race from a ReplayLog, re-running the simulation with the same
seed + power inputs, then verifies that the final state hash matches.
"""
from __future__ import annotations

from app.core.world import generate_world, canonical_hash
from app.core.simulation import RaceSimulation, PowerInput, TICK_RATE_HZ

import asyncio


def replay_and_verify(log: dict) -> dict:
    """
    Synchronously replay a race and verify determinism.
    
    Returns:
        {"verified": bool, "expected_hash": str, "actual_hash": str}
    """
    # Regenerate world
    world = generate_world(log["seed"], log["num_horses"])
    
    # Verify world config hash
    assert world.config_hash == log["world_config_hash"], (
        f"World hash mismatch: {world.config_hash} != {log['world_config_hash']}"
    )
    assert world.sim_version == log["sim_version"], (
        f"Sim version mismatch: {world.sim_version} != {log['sim_version']}"
    )
    
    # Create simulation (no broadcast, no async)
    powers_queue = asyncio.Queue()
    sim = RaceSimulation(world, lobby_id="replay", powers_queue=powers_queue)
    
    # Schedule all power inputs at their correct ticks
    power_schedule = {}
    for pi in log.get("power_inputs", []):
        tick = pi["tick"]
        if tick not in power_schedule:
            power_schedule[tick] = []
        power_schedule[tick].append(pi)
    
    # Run synchronously (no await, just step)
    while not sim._all_finished():
        sim.tick += 1
        
        # Inject powers at correct ticks
        if sim.tick in power_schedule:
            for pi in power_schedule[sim.tick]:
                powers_queue.put_nowait(PowerInput(
                    power_id=pi["power_id"],
                    target_id=pi["target"],
                    caster_user_id=pi.get("caster_user_id", 0),
                    telegraph_ms=pi.get("telegraph_ticks", 10) * (1000 // TICK_RATE_HZ),
                    duration_s=pi.get("duration_ticks", 60) * (1000 // TICK_RATE_HZ) / 1000.0,
                ))
        
        sim._step()
        
        # Safety: max 10000 ticks (~8 min)
        if sim.tick > 10_000:
            break
    
    # Verify
    replay_log = sim.get_replay_log()
    actual_placements_hash = replay_log["final_placements_hash"]
    actual_state_hash = replay_log["final_state_hash"]
    
    return {
        "verified": (
            actual_placements_hash == log["final_placements_hash"]
            and actual_state_hash == log["final_state_hash"]
        ),
        "expected_placements_hash": log["final_placements_hash"],
        "actual_placements_hash": actual_placements_hash,
        "expected_state_hash": log["final_state_hash"],
        "actual_state_hash": actual_state_hash,
        "total_ticks": sim.tick,
    }
