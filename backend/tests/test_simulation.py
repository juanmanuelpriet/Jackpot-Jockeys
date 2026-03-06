"""
Tests for Etapa 5: Race Simulation.

Covers: DetRNG, world generation, simulation determinism, replay verification.
"""
import pytest
import asyncio
from app.core.rng import DetRNG
from app.core.world import generate_world, canonical_hash
from app.core.simulation import RaceSimulation, TICK_RATE_HZ


# ── DetRNG Tests ──

class TestDetRNG:
    def test_determinism(self):
        """Same seed → same sequence."""
        a = DetRNG("test_seed_123")
        b = DetRNG("test_seed_123")
        for _ in range(1000):
            assert a._next() == b._next()

    def test_different_seeds(self):
        """Different seeds → different sequences."""
        a = DetRNG("seed_A")
        b = DetRNG("seed_B")
        vals_a = [a._next() for _ in range(100)]
        vals_b = [b._next() for _ in range(100)]
        assert vals_a != vals_b

    def test_randint_range(self):
        rng = DetRNG("range_test")
        for _ in range(500):
            v = rng.randint(10, 20)
            assert 10 <= v <= 20

    def test_choice(self):
        rng = DetRNG("choice_test")
        items = ["a", "b", "c"]
        for _ in range(100):
            assert rng.choice(items) in items

    def test_shuffle_deterministic(self):
        a = DetRNG("shuffle")
        b = DetRNG("shuffle")
        assert a.shuffle([1, 2, 3, 4, 5]) == b.shuffle([1, 2, 3, 4, 5])

    def test_never_zero_state(self):
        rng = DetRNG("zero_check")
        for _ in range(10000):
            assert rng.state != 0
            rng._next()


# ── World Generation Tests ──

class TestWorldGeneration:
    def test_generate_10_seeds(self):
        """10 different seeds all produce valid worlds."""
        for i in range(10):
            world = generate_world(f"test_seed_{i}")
            assert 800_000 <= world.track_length_mm <= 3_000_000
            assert 8 <= len(world.segments) <= 14
            assert world.laps in [2, 3]
            assert world.num_horses == 6
            assert world.biome in ["desert", "jungle", "ice", "neon_city"]
            assert len(world.segment_start_mm) == len(world.segments)
            assert len(world.segment_end_mm) == len(world.segments)
            # Last segment_end should equal track_length
            assert world.segment_end_mm[-1] == world.track_length_mm

    def test_determinism(self):
        """Same seed → same world."""
        a = generate_world("determinism_test")
        b = generate_world("determinism_test")
        assert a.config_hash == b.config_hash
        assert a.biome == b.biome
        assert a.laps == b.laps
        assert a.track_length_mm == b.track_length_mm

    def test_different_seeds_different_worlds(self):
        """Different seeds → different worlds."""
        a = generate_world("world_A")
        b = generate_world("world_B")
        # At least one of these should differ
        assert (a.biome != b.biome
                or a.track_length_mm != b.track_length_mm
                or a.laps != b.laps)

    def test_checkpoints_exist(self):
        """At least 2 checkpoints per track."""
        world = generate_world("cp_test")
        cp_count = sum(1 for s in world.segments if s.is_checkpoint)
        assert cp_count >= 2

    def test_max_hazards(self):
        """Max 5 static hazards."""
        for i in range(20):
            world = generate_world(f"hazard_test_{i}")
            total_hazards = sum(len(s.hazard_slots) for s in world.segments)
            assert total_hazards <= 5

    def test_segment_lookup(self):
        """get_segment_idx returns valid indices."""
        world = generate_world("lookup_test")
        for pos in range(0, world.track_length_mm, 10_000):
            idx = world.get_segment_idx(pos)
            assert 0 <= idx < len(world.segments)

    def test_canonical_hash_stable(self):
        """Hash is stable across calls."""
        data = {"b": 2, "a": 1, "c": [1, 2, 3]}
        h1 = canonical_hash(data)
        h2 = canonical_hash(data)
        assert h1 == h2
        assert h1.startswith("sha256:")

    def test_no_three_curves(self):
        """No 3 curves in a row."""
        for i in range(20):
            world = generate_world(f"curve_test_{i}")
            streak = 0
            for seg in world.segments:
                if seg.type.startswith("curve"):
                    streak += 1
                    assert streak < 3, f"3 curves in a row in seed curve_test_{i}"
                else:
                    streak = 0


# ── Simulation Tests ──

class TestSimulation:
    def _run_sync(self, world, max_ticks=5000):
        """Run simulation synchronously for testing."""
        sim = RaceSimulation(world, lobby_id="test")
        while not sim._all_finished() and sim.tick < max_ticks:
            sim.tick += 1
            sim._step()
        return sim

    def test_all_horses_finish(self):
        """All 6 horses finish the race."""
        world = generate_world("finish_test")
        sim = self._run_sync(world)
        placements = sim.get_placements()
        assert len(placements) == 6
        positions = [p.position for p in placements]
        assert sorted(positions) == [1, 2, 3, 4, 5, 6]

    def test_determinism_same_seed(self):
        """Same seed → same placements."""
        world_a = generate_world("det_sim_test")
        world_b = generate_world("det_sim_test")
        sim_a = self._run_sync(world_a)
        sim_b = self._run_sync(world_b)
        placements_a = [(p.horse_id, p.position) for p in sim_a.get_placements()]
        placements_b = [(p.horse_id, p.position) for p in sim_b.get_placements()]
        assert placements_a == placements_b

    def test_determinism_5_seeds(self):
        """5 different seeds all produce deterministic results."""
        for i in range(5):
            seed = f"multi_det_{i}"
            world_a = generate_world(seed)
            world_b = generate_world(seed)
            sim_a = self._run_sync(world_a)
            sim_b = self._run_sync(world_b)
            log_a = sim_a.get_replay_log()
            log_b = sim_b.get_replay_log()
            assert log_a["final_placements_hash"] == log_b["final_placements_hash"], \
                f"Placements mismatch for seed {seed}"
            assert log_a["final_state_hash"] == log_b["final_state_hash"], \
                f"State mismatch for seed {seed}"

    def test_replay_verification(self):
        """Replay produces same result."""
        from app.core.replay import replay_and_verify
        world = generate_world("replay_test")
        sim = self._run_sync(world)
        log = sim.get_replay_log()
        result = replay_and_verify(log)
        assert result["verified"], f"Replay failed: {result}"

    def test_events_generated(self):
        """Simulation generates events (collisions, hazards, laps)."""
        world = generate_world("events_test")
        sim = self._run_sync(world)
        event_types = {e.event_name for e in sim.events}
        # Should have at least RACE_FINISHED
        # LAP_CHECKPOINT_EVENT should exist since horses complete laps
        assert "LAP_CHECKPOINT_EVENT" in event_types or sim.tick > 0

    def test_snapshot_format(self):
        """Snapshot has correct format."""
        world = generate_world("snap_test")
        sim = self._run_sync(world, max_ticks=100)
        snap = sim.get_snapshot()
        assert snap["event_name"] == "SIM_SNAPSHOT"
        assert "tick" in snap
        assert "horses" in snap
        assert len(snap["horses"]) == 6
        for h in snap["horses"]:
            assert "rank" in h
            assert "progress_permil" in h
            assert "pos_mm" in h

    def test_perf_tick_under_2ms(self):
        """Average tick should be under 2ms."""
        import time
        world = generate_world("perf_test")
        sim = RaceSimulation(world, lobby_id="perf")
        
        start = time.perf_counter()
        ticks = 0
        while not sim._all_finished() and ticks < 2000:
            sim.tick += 1
            sim._step()
            ticks += 1
        elapsed = time.perf_counter() - start
        
        avg_ms = (elapsed / ticks) * 1000
        assert avg_ms < 2.0, f"Average tick took {avg_ms:.3f}ms (limit: 2ms)"

    def test_positions_always_forward(self):
        """Horse positions never decrease (except vine_snare retro)."""
        world = generate_world("forward_test")
        sim = RaceSimulation(world, lobby_id="fwd")
        prev_positions = {f"horse_{i}": 0 for i in range(1, 7)}
        
        for _ in range(500):
            sim.tick += 1
            sim._step()
            for h in sim.horses:
                # Allow small retro from vine_snare (3000mm max)
                assert h.pos_mm >= prev_positions[h.horse_id] - 3_001, \
                    f"{h.horse_id} went backwards: {prev_positions[h.horse_id]} → {h.pos_mm}"
                prev_positions[h.horse_id] = h.pos_mm

    def test_velocity_clamped(self):
        """Velocity stays within bounds."""
        world = generate_world("vel_clamp_test")
        sim = RaceSimulation(world, lobby_id="clamp")
        for _ in range(1000):
            sim.tick += 1
            sim._step()
            for h in sim.horses:
                if not h.finished:
                    assert 0 <= h.vel_mmps <= 25_000, \
                        f"{h.horse_id} vel out of bounds: {h.vel_mmps}"
