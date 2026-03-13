extends Node
class_name NeuralAgent

# ============================================================================
# OBS_SCHEMA_V2 — 59 dimensions, fixed order, fixed normalization
# ============================================================================
#
# Block 1: Self State (6 dims)
#   [0]  speed_norm           velocity.length() / max_speed              [0, 1]
#   [1]  vel_forward_norm     forward_projection / max_speed            [-1, 1]
#   [2]  vel_lateral_norm     lateral_projection / max_speed            [-1, 1]
#   [3]  progress_s           normalized track progress                  [0, 1]
#   [4]  angular_vel_norm     steer * turn_speed / max_turn_speed       [-1, 1]
#   [5]  drift_angle_norm     angle(velocity, forward) / PI            [-1, 1]
#
# Block 2: Track Relation (4 dims)
#   [6]  heading_error        angle_to(ideal_heading) / PI              [-1, 1]
#   [7]  lateral_dist_norm    signed_lateral / (track_width / 2)        [-1, 1]
#   [8]  off_track_flag       1.0 if off_track_dist > 0 else 0.0       {0, 1}
#   [9]  curvature_ahead      curvature * 100, clamped                  [-1, 1]
#
# Block 3: Track Sensors (20 dims) — 5 lookahead points
#   For each lookahead at [100, 200, 400, 700, 1000] px:
#     [10+i*4]  curvature_at_point   clamped [-1, 1]
#     [11+i*4]  dist_left_norm       distance to left edge / half_width  [0, 2]
#     [12+i*4]  dist_right_norm      distance to right edge / half_width [0, 2]
#     [13+i*4]  heading_delta        angle change to that point / PI    [-1, 1]
#
# Block 4: Rivals (18 dims) — up to 3 rivals, padded with zeros
#   For each rival slot i (0..2):
#     [30+i*6]  rel_dist_norm        distance / 2000.0, clamped [0, 1]
#     [31+i*6]  rel_angle_norm       angle_to_rival / PI               [-1, 1]
#     [32+i*6]  rel_speed_norm       (rival_speed - my_speed) / max_spd [-1, 1]
#     [33+i*6]  gap_front_norm       signed front gap / 500, clamped   [-1, 1]
#     [34+i*6]  gap_lateral_norm     signed lateral gap / half_width   [-1, 1]
#     [35+i*6]  same_side_flag       1.0 if same side of track         {0, 1}
#
# Block 5: World Events (7 dims) — from WorldEventManager
#   [48]  wind_gust_flag                                                {0, 1}
#   [49]  wind_x                                                       [-1, 1]
#   [50]  wind_y                                                       [-1, 1]
#   [51]  friction_mod                                                  [0, 1]
#   [52]  ctrl_inverted                                                 {0, 1}
#   [53]  stun_timer           seconds remaining                        [0, ~6]
#   [54]  noise_level                                                   [0, 1]
#
# Block 6: World Params (4 dims)
#   [55]  track_width_norm     track_width / 500.0                      [0, 2]
#   [56]  friction_base_norm   base_friction                             [0, 2]
#   [57]  phase_norm           curriculum_phase / 3.0                    [0, 1]
#   [58]  speed_ratio          max_speed / 2000.0                       [0, 1]
#
# Total: 6 + 4 + 20 + 18 + 7 + 4 = 59
# ============================================================================

const OBS_SCHEMA_VERSION: String = "OBS_SCHEMA_V2"
const OBS_SIZE: int = 59
const MAX_RIVALS: int = 3
const LOOKAHEAD_DISTANCES: Array[float] = [100.0, 200.0, 400.0, 700.0, 1000.0]

# Defaults: zeros everywhere except friction_mod=1.0 (index 51)
static func _build_defaults() -> Array[float]:
	var d: Array[float] = []
	d.resize(OBS_SIZE)
	d.fill(0.0)
	d[51] = 1.0  # friction_mod default
	return d

@export var vehicle_path: NodePath
var vehicle: Vehicle

# References injected by Race2D via setup()
var track_generator: Node2D
var world_event_manager: Node
var rival_agents: Array = []

var is_active: bool = false

# State tracking for safety and reward support
var stuck_timer: float = 0.0
var prev_progress: float = 0.0
var off_track_time: float = 0.0
var prev_steer_action: float = 0.0

# --- Neural weights (flat array, loaded from JSON or injected by trainer) ---
var weights: Array[float] = []
var _use_dummy_policy: bool = true  # true until real weights are loaded

func _ready():
	if has_node(vehicle_path):
		var node = get_node(vehicle_path)
		if node is Vehicle:
			vehicle = node

func setup(p_track, p_wem, p_rivals):
	track_generator = p_track
	world_event_manager = p_wem
	
	rival_agents.clear()
	for r in p_rivals:
		if r != vehicle:
			rival_agents.append(r)
			
	is_active = true

# ============================================================================
# OBSERVATION — OBS_SCHEMA_V2, structured dict and flat vector
# ============================================================================

func get_observation_dict() -> Dictionary:
	if not is_instance_valid(vehicle) or not is_instance_valid(track_generator):
		return {}
		
	var global_pos = vehicle.global_position
	var s = track_generator.get_progress_scalar(global_pos)
	var off_track_dist = track_generator.get_off_track_distance(global_pos)
	var lateral_dist = track_generator.get_lateral_distance(global_pos)
	
	var ideal_heading = track_generator.get_ideal_heading(global_pos)
	var forward = Vector2.RIGHT.rotated(vehicle.rotation)
	var right = Vector2.DOWN.rotated(vehicle.rotation)
	var heading_error = forward.angle_to(ideal_heading)
	
	var vel_forward = vehicle.velocity.dot(forward)
	var vel_lateral = vehicle.velocity.dot(right)
	
	var half_width = track_generator.track_width / 2.0
	var max_spd = max(1.0, vehicle.max_speed)
	
	# Drift angle: angle between velocity direction and forward
	var drift_angle = 0.0
	if vehicle.velocity.length() > 10.0:
		drift_angle = forward.angle_to(vehicle.velocity.normalized())
	
	var obs = {
		"self_state": {
			"speed": vehicle.velocity.length() / max_spd,
			"vel_forward": vel_forward / max_spd,
			"vel_lateral": vel_lateral / max_spd,
			"progress": s,
			"angular_vel": clamp(vehicle.steer * vehicle.turn_speed / 5.0, -1.0, 1.0),
			"drift_angle": clamp(drift_angle / PI, -1.0, 1.0),
		},
		"track_relation": {
			"heading_error": heading_error / PI,
			"lateral_distance": clamp(lateral_dist / half_width, -1.0, 1.0),
			"off_track_flag": 1.0 if off_track_dist > 0.0 else 0.0,
			"curvature_ahead": clamp(track_generator.get_local_curvature(s) * 100.0, -1.0, 1.0),
		},
		"track_sensors": _build_track_sensors(global_pos, forward, s, half_width),
		"rivals": _build_rival_observations(global_pos, forward, right, max_spd, half_width),
		"world_events": [],
		"world_params": _build_world_params(),
	}
	
	if is_instance_valid(world_event_manager):
		obs["world_events"] = world_event_manager.get_events_vector_for_agent(vehicle)
		
	return obs

func _build_track_sensors(global_pos: Vector2, forward: Vector2, s_current: float, half_width: float) -> Array:
	var sensors: Array = []
	var total_length = track_generator.get_track_length()
	if total_length <= 0.0:
		sensors.resize(20)
		sensors.fill(0.0)
		return sensors
	
	var current_offset = s_current * total_length
	
	for dist in LOOKAHEAD_DISTANCES:
		var target_offset = fmod(current_offset + dist, total_length)
		var target_s = target_offset / total_length
		
		# Curvature at lookahead point
		var curv = track_generator.get_local_curvature(target_s)
		sensors.append(clamp(curv * 100.0, -1.0, 1.0))
		
		# Distance to edges at lookahead point
		var lookahead_pos = track_generator.path.curve.sample_baked(target_offset)
		var lat_at_point = track_generator.get_lateral_distance(track_generator.path.to_global(lookahead_pos))
		sensors.append(clamp((half_width - lat_at_point) / half_width, 0.0, 2.0))  # left
		sensors.append(clamp((half_width + lat_at_point) / half_width, 0.0, 2.0))  # right
		
		# Heading delta to that point
		var tangent_at_point = track_generator.get_ideal_heading(track_generator.path.to_global(lookahead_pos))
		var heading_delta = forward.angle_to(tangent_at_point)
		sensors.append(clamp(heading_delta / PI, -1.0, 1.0))
		
	return sensors

func _build_rival_observations(global_pos: Vector2, forward: Vector2, right: Vector2, max_spd: float, half_width: float) -> Array:
	var rivals_data: Array = []
	
	# Sort rivals by distance (closest first)
	var rival_dists: Array = []
	for r in rival_agents:
		if is_instance_valid(r):
			rival_dists.append({"vehicle": r, "dist": global_pos.distance_to(r.global_position)})
	rival_dists.sort_custom(func(a, b): return a["dist"] < b["dist"])
	
	for i in range(MAX_RIVALS):
		if i < rival_dists.size():
			var r: Vehicle = rival_dists[i]["vehicle"]
			var rel_pos = r.global_position - global_pos
			var dist = rel_pos.length()
			
			rivals_data.append(clamp(dist / 2000.0, 0.0, 1.0))              # rel_dist
			rivals_data.append(clamp(forward.angle_to(rel_pos.normalized()) / PI, -1.0, 1.0))  # rel_angle
			rivals_data.append(clamp((r.velocity.length() - vehicle.velocity.length()) / max_spd, -1.0, 1.0))  # rel_speed
			
			# Front gap (positive = rival is ahead)
			var front_gap = rel_pos.dot(forward)
			rivals_data.append(clamp(front_gap / 500.0, -1.0, 1.0))
			
			# Lateral gap
			var lat_gap = rel_pos.dot(right)
			rivals_data.append(clamp(lat_gap / half_width, -1.0, 1.0))
			
			# Same side of track
			var my_lat = track_generator.get_lateral_distance(global_pos)
			var rival_lat = track_generator.get_lateral_distance(r.global_position)
			rivals_data.append(1.0 if (my_lat * rival_lat > 0) else 0.0)
		else:
			# Pad with zeros for missing rivals
			rivals_data.append_array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
	
	return rivals_data

func _build_world_params() -> Array[float]:
	var params: Array[float] = [0.5, 1.0, 0.33, 0.7]  # defaults
	
	if is_instance_valid(track_generator):
		params[0] = track_generator.track_width / 500.0
	if is_instance_valid(vehicle):
		params[3] = vehicle.max_speed / 2000.0
	
	# These would come from EnvironmentConfig if injected
	# params[1] = config.base_friction
	# params[2] = config.curriculum_phase / 3.0
	
	return params

func get_observation_vector() -> Array[float]:
	var dict = get_observation_dict()
	if dict.is_empty():
		return _build_defaults()
		
	var vec: Array[float] = []
	
	# Block 1: Self State (6)
	vec.append(dict["self_state"]["speed"])
	vec.append(dict["self_state"]["vel_forward"])
	vec.append(dict["self_state"]["vel_lateral"])
	vec.append(dict["self_state"]["progress"])
	vec.append(dict["self_state"]["angular_vel"])
	vec.append(dict["self_state"]["drift_angle"])
	
	# Block 2: Track Relation (4)
	vec.append(dict["track_relation"]["heading_error"])
	vec.append(dict["track_relation"]["lateral_distance"])
	vec.append(dict["track_relation"]["off_track_flag"])
	vec.append(dict["track_relation"]["curvature_ahead"])
	
	# Block 3: Track Sensors (20)
	var sensors: Array = dict["track_sensors"]
	for s_val in sensors:
		vec.append(float(s_val))
	# Pad if needed
	while vec.size() < 30:
		vec.append(0.0)
	
	# Block 4: Rivals (18)
	var rivals: Array = dict["rivals"]
	for r_val in rivals:
		vec.append(float(r_val))
	# Pad if needed
	while vec.size() < 48:
		vec.append(0.0)
	
	# Block 5: World Events (7)
	var events: Array = dict["world_events"]
	if events.size() == 7:
		for e in events: vec.append(float(e))
	else:
		vec.append_array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0])
	
	# Block 6: World Params (4)
	var params: Array[float] = dict["world_params"]
	for p in params:
		vec.append(p)
	
	assert(vec.size() == OBS_SIZE, "OBS_SCHEMA_V2 violation: expected %d dims, got %d" % [OBS_SIZE, vec.size()])
	return vec

# ============================================================================
# POLICY — Dummy local (random/zero) until real weights are loaded
# ============================================================================

func compute_action(delta: float) -> Dictionary:
	if not is_instance_valid(vehicle) or not is_active:
		return {"throttle": 0.0, "brake": 1.0, "steer": 0.0, "drift": 0.0, "stabilize": 0.0}
	
	# --- Safety state tracking (same as BaselineAgent for compatibility) ---
	var pos = vehicle.global_position
	var off_track = track_generator.get_off_track_distance(pos)
	
	if vehicle.velocity.length() < 50.0 and vehicle.throttle > 0.1:
		stuck_timer += delta
	else:
		stuck_timer = 0.0
		
	if off_track > 0.0:
		off_track_time += delta
	else:
		off_track_time = 0.0
	
	# --- Get observation ---
	var obs = get_observation_vector()
	
	# --- Forward pass ---
	var raw_action: Dictionary
	if _use_dummy_policy:
		raw_action = _dummy_policy(obs)
	else:
		raw_action = _neural_forward(obs)
	
	# --- Safety layer (Phase 2 will expand this) ---
	var safe_action = _apply_safety_layer(raw_action, obs)
	
	prev_steer_action = safe_action["steer"]
	return safe_action

func _dummy_policy(_obs: Array[float]) -> Dictionary:
	# Minimal driving: go forward with gentle corrections
	# This is intentionally trivial — just proves the pipeline works
	return {
		"throttle": 0.5,
		"brake": 0.0,
		"steer": 0.0,
		"drift": 0.0,
		"stabilize": 0.0,
	}

func _neural_forward(obs: Array[float]) -> Dictionary:
	# TODO Phase 3: Real TF forward pass or GDScript matrix multiply
	# For now, fallback to dummy
	return _dummy_policy(obs)

func _apply_safety_layer(action: Dictionary, obs: Array[float]) -> Dictionary:
	var safe = action.duplicate()
	
	# Clamp all outputs to valid ranges first
	safe["throttle"] = clamp(safe["throttle"], 0.0, 1.0)
	safe["brake"] = clamp(safe["brake"], 0.0, 1.0)
	safe["steer"] = clamp(safe["steer"], -1.0, 1.0)
	safe["drift"] = clamp(safe["drift"], 0.0, 1.0)
	safe["stabilize"] = clamp(safe["stabilize"], 0.0, 1.0)
	
	# --- Rule 1: Frontal collision avoidance ---
	# obs[33] = gap_front_norm for closest rival (slot 0), clamped [-1, 1]
	# Positive = rival ahead. If very close ahead, brake hard.
	var front_gap_closest = obs[33] if obs.size() > 33 else 0.0
	var rival_dist_closest = obs[30] if obs.size() > 30 else 1.0  # 0=touching, 1=far
	if front_gap_closest > 0.0 and rival_dist_closest < 0.08:
		safe["brake"] = max(safe["brake"], 0.7)
		safe["throttle"] *= 0.3
	
	# --- Rule 2: Off-track recovery ---
	# obs[8] = off_track_flag, obs[7] = lateral_distance_norm
	var off_track_flag = obs[8] if obs.size() > 8 else 0.0
	var lateral_norm = obs[7] if obs.size() > 7 else 0.0
	if off_track_flag > 0.5:
		# Steer toward center: if lateral > 0 (right side), steer left (negative)
		var correction = -sign(lateral_norm) * 0.6
		safe["steer"] = clamp(safe["steer"] + correction, -1.0, 1.0)
		safe["throttle"] = min(safe["throttle"], 0.4)
		safe["brake"] = max(safe["brake"], 0.3)
		safe["stabilize"] = max(safe["stabilize"], 0.5)  # increase grip during recovery
	
	# --- Rule 3: Stuck recovery ---
	# If stuck for over 1.5 seconds, reverse steer and brake
	if stuck_timer > 1.5:
		safe["throttle"] = 0.0
		safe["brake"] = 1.0
		# Try reversing steer direction to unstick
		if abs(prev_steer_action) > 0.01:
			safe["steer"] = -sign(prev_steer_action)
		else:
			safe["steer"] = 1.0
	
	# --- Rule 4: Over-speed governor ---
	# obs[0] = speed_norm (0 to 1, where 1 = max_speed)
	var speed_norm = obs[0] if obs.size() > 0 else 0.0
	if speed_norm > 0.95:
		safe["throttle"] = min(safe["throttle"], 0.5)
	
	return safe

# ============================================================================
# WEIGHT MANAGEMENT — for neuroevolution
# ============================================================================

func load_weights_from_json(path: String) -> bool:
	var file = FileAccess.open(path, FileAccess.READ)
	if not file:
		push_warning("[NeuralAgent] Cannot open weights file: %s" % path)
		return false
	
	var json = JSON.new()
	var result = json.parse(file.get_as_text())
	file.close()
	
	if result != OK:
		push_warning("[NeuralAgent] Cannot parse weights JSON: %s" % path)
		return false
	
	var data = json.data
	if data is Array:
		weights.clear()
		for w in data:
			weights.append(float(w))
		_use_dummy_policy = false
		print("[NeuralAgent] Loaded %d weights from %s" % [weights.size(), path])
		return true
	
	return false

func set_weights_flat(w: Array[float]):
	weights = w.duplicate()
	_use_dummy_policy = false

func get_weights_flat() -> Array[float]:
	return weights.duplicate()

# NOTE: This agent does NOT have its own _physics_process.
# Race2D.step_environment() calls compute_action() and injects via vehicle.apply_inputs().
