extends SceneTree

## AG-RACE Integration Test — Determinism Smoke Test
## Runs two episodes with identical seed and verifies bitwise-identical results.
## Then runs a third episode with a different seed and verifies divergence.

func _init():
	print("=== AG-RACE INTEGRATION TEST ===")
	var root = get_root()
	var race = preload("res://scenes/Race2D.tscn").instantiate()
	root.add_child(race)
	
	# --- Test 1: Determinism (same seed → same result) ---
	print("\n--- TEST 1: Determinism ---")
	var config_a = EnvironmentConfig.new(1234, 2, "test")
	config_a.max_steps_per_episode = 100
	config_a.debug_logging = false
	
	var obs_a = race.reset_environment(config_a)
	var hash_a = race.track_generator.get_track_hash()
	var evt_hash_a = race.world_event_manager.get_schedule_hash()
	print("Run A | Obs dims: %d | Track hash: %d | Event hash: %d" % [obs_a[0].size(), hash_a, evt_hash_a])
	
	# Simulate steps
	for step in range(config_a.max_steps_per_episode):
		race._physics_process(1.0 / 15.0)
	var progress_a = race.agent_progress_mem.duplicate()
	var reward_a = race.agent_total_reward.duplicate()
	
	# --- Run B: Same seed ---
	var config_b = EnvironmentConfig.new(1234, 2, "test")
	config_b.max_steps_per_episode = 100
	config_b.debug_logging = false
	
	var obs_b = race.reset_environment(config_b)
	var hash_b = race.track_generator.get_track_hash()
	var evt_hash_b = race.world_event_manager.get_schedule_hash()
	print("Run B | Obs dims: %d | Track hash: %d | Event hash: %d" % [obs_b[0].size(), hash_b, evt_hash_b])
	
	for step in range(config_b.max_steps_per_episode):
		race._physics_process(1.0 / 15.0)
	var progress_b = race.agent_progress_mem.duplicate()
	var reward_b = race.agent_total_reward.duplicate()
	
	# Assert determinism
	var determinism_ok = true
	if hash_a != hash_b:
		print("FAIL: Track hash mismatch: %d vs %d" % [hash_a, hash_b])
		determinism_ok = false
	if evt_hash_a != evt_hash_b:
		print("FAIL: Event hash mismatch: %d vs %d" % [evt_hash_a, evt_hash_b])
		determinism_ok = false
	for i in range(progress_a.size()):
		if abs(progress_a[i] - progress_b[i]) > 0.0001:
			print("FAIL: Agent %d progress diverged: %.6f vs %.6f" % [i, progress_a[i], progress_b[i]])
			determinism_ok = false
		if abs(reward_a[i] - reward_b[i]) > 0.001:
			print("FAIL: Agent %d reward diverged: %.4f vs %.4f" % [i, reward_a[i], reward_b[i]])
			determinism_ok = false
	
	if determinism_ok:
		print("PASS: Determinism verified (seed=1234, 100 steps)")
	
	# --- Test 2: Different seed → different result ---
	print("\n--- TEST 2: Divergence ---")
	var config_c = EnvironmentConfig.new(9999, 2, "test")
	config_c.max_steps_per_episode = 100
	config_c.debug_logging = false
	
	race.reset_environment(config_c)
	var hash_c = race.track_generator.get_track_hash()
	
	if hash_c == hash_a:
		print("FAIL: Different seed produced same track hash")
	else:
		print("PASS: Different seed produces different track (hash: %d vs %d)" % [hash_c, hash_a])
	
	# --- Test 3: OBS_SCHEMA_V1 size ---
	print("\n--- TEST 3: OBS Schema ---")
	var obs_size = obs_a[0].size()
	if obs_size == 15:
		print("PASS: OBS_SCHEMA_V1 = 15 dims")
	else:
		print("FAIL: Expected 15 dims, got %d" % obs_size)
	
	print("\n=== TESTS COMPLETE ===")
	quit()
