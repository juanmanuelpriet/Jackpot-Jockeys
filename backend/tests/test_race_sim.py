"""
Race Sim Determinism Test — Validates that same seed = same result.
"""
import pytest
from app.core.race_sim import simulate_race, placements_to_dicts, DEFAULT_HORSES


class TestRaceSim:
    """Tests for the deterministic race sim stub."""

    def test_deterministic_output(self):
        """Same seed + same horses = identical placements every time."""
        seed = "test_seed_abc123"
        horses = DEFAULT_HORSES

        result1 = simulate_race(seed, horses)
        result2 = simulate_race(seed, horses)

        assert len(result1) == len(result2) == 6

        for p1, p2 in zip(result1, result2):
            assert p1.horse_id == p2.horse_id
            assert p1.position == p2.position
            assert p1.finish_time_ms == p2.finish_time_ms

    def test_different_seed_different_result(self):
        """Different seeds should (very likely) produce different winners."""
        horses = DEFAULT_HORSES
        
        result_a = simulate_race("seed_alpha", horses)
        result_b = simulate_race("seed_beta", horses)

        # It's theoretically possible but extremely unlikely for two different
        # seeds to produce the exact same ordering
        winners_differ = result_a[0].horse_id != result_b[0].horse_id
        # At minimum, finish times should differ
        times_differ = any(
            a.finish_time_ms != b.finish_time_ms 
            for a, b in zip(result_a, result_b)
        )
        assert winners_differ or times_differ

    def test_all_positions_assigned(self):
        """Every horse should get a unique position from 1 to N."""
        result = simulate_race("position_test", DEFAULT_HORSES)
        positions = [p.position for p in result]
        assert sorted(positions) == list(range(1, 7))

    def test_placements_to_dicts(self):
        """Serialization to dicts should work correctly."""
        result = simulate_race("dict_test", DEFAULT_HORSES)
        dicts = placements_to_dicts(result)
        
        assert len(dicts) == 6
        assert all("horse_id" in d for d in dicts)
        assert all("position" in d for d in dicts)
        assert all("finish_time_ms" in d for d in dicts)
