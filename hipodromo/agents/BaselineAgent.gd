extends Node
class_name BaselineAgent

# ============================================================================
# OBS_SCHEMA_V1 — 15 dimensions, fixed order, fixed normalization
# ============================================================================
#
# Block 1: Self State (4 dims)
#   [0]  speed_norm        velocity.length() / max_speed                 [0, 1]
#   [1]  vel_forward_norm  forward_projection / max_speed               [-1, 1]
#   [2]  vel_lateral_norm  lateral_projection / max_speed               [-1, 1]
#   [3]  progress_s        normalized track progress                    [0, 1]
#
# Block 2: Track Relation (4 dims)
#   [4]  heading_error     angle_to(ideal_heading) / PI                 [-1, 1]
#   [5]  lateral_dist_norm signed_lateral / (track_width / 2)  clamped  [-1, 1]
#   [6]  off_track_flag    1.0 if off_track_dist > 0 else 0.0          {0, 1}
#   [7]  curvature_ahead   curvature * 100, clamped                     [-1, 1]
#
# Block 3: World Events (7 dims) — from WorldEventManager
#   [8]  wind_gust_flag                                                 {0, 1}
#   [9]  wind_x                                                         [-1, 1]
#   [10] wind_y                                                         [-1, 1]
#   [11] friction_mod                                                   [0, 1]
#   [12] ctrl_inverted                                                  {0, 1}
#   [13] stun_timer        seconds remaining                            [0, ~6]
#   [14] noise_level                                                    [0, 1]
#
# Defaults (all zeros except friction_mod=1.0):
#   [0,0,0,0, 0,0,0,0, 0,0,0,1,0,0,0]
# ============================================================================

const OBS_SCHEMA_VERSION: String = "OBS_SCHEMA_V1"
const OBS_SIZE: int = 15
const OBS_DEFAULTS: Array[float] = [
	0.0, 0.0, 0.0, 0.0,  # self state
	0.0, 0.0, 0.0, 0.0,  # track relation
	0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0  # world events
]

@export var vehicle_path: NodePath
var vehicle: Vehicle

# References injected by Race2D via setup()
var track_generator: Node2D
var world_event_manager: Node
var rival_agents: Array = []

var is_active: bool = false
var lookahead_distance: float = 400.0

# State tracking for safety and reward support
var stuck_timer: float = 0.0
var prev_progress: float = 0.0
var off_track_time: float = 0.0
var prev_steer_action: float = 0.0

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
# OBSERVATION — structured dict and flat vector
# ============================================================================

func get_observation_dict() -> Dictionary:
	if not is_instance_valid(vehicle) or not is_instance_valid(track_generator):
		return {}
		
	var global_pos = vehicle.global_position
	var s = track_generator.get_progress_scalar(global_pos)  # [0, 1]
	var off_track_dist = track_generator.get_off_track_distance(global_pos)
	var lateral_dist = track_generator.get_lateral_distance(global_pos)
	
	var ideal_heading = track_generator.get_ideal_heading(global_pos)
	var forward = Vector2.RIGHT.rotated(vehicle.rotation)
	var right = Vector2.DOWN.rotated(vehicle.rotation)
	var heading_error = forward.angle_to(ideal_heading)
	
	var vel_forward = vehicle.velocity.dot(forward)
	var vel_lateral = vehicle.velocity.dot(right)
	
	var half_width = track_generator.track_width / 2.0
	
	var obs = {
		"self_state": {
			"speed": vehicle.velocity.length() / max(1.0, vehicle.max_speed),
			"vel_forward": vel_forward / max(1.0, vehicle.max_speed),
			"vel_lateral": vel_lateral / max(1.0, vehicle.max_speed),
			"progress": s,
		},
		"track_relation": {
			"heading_error": heading_error / PI,
			"lateral_distance": clamp(lateral_dist / half_width, -1.0, 1.0),
			"off_track_flag": 1.0 if off_track_dist > 0.0 else 0.0,
			"curvature_ahead": clamp(track_generator.get_local_curvature(s) * 100.0, -1.0, 1.0),
		},
		"world_events": []
	}
	
	if is_instance_valid(world_event_manager):
		obs["world_events"] = world_event_manager.get_events_vector_for_agent(vehicle)
		
	return obs

func get_observation_vector() -> Array[float]:
	var dict = get_observation_dict()
	if dict.is_empty():
		return OBS_DEFAULTS.duplicate()
		
	var vec: Array[float] = []
	
	# Block 1: Self State (4)
	vec.append(dict["self_state"]["speed"])
	vec.append(dict["self_state"]["vel_forward"])
	vec.append(dict["self_state"]["vel_lateral"])
	vec.append(dict["self_state"]["progress"])
	
	# Block 2: Track Relation (4)
	vec.append(dict["track_relation"]["heading_error"])
	vec.append(dict["track_relation"]["lateral_distance"])
	vec.append(dict["track_relation"]["off_track_flag"])
	vec.append(dict["track_relation"]["curvature_ahead"])
	
	# Block 3: World Events (7)
	var events: Array = dict["world_events"]
	if events.size() == 7:
		for e in events: vec.append(float(e))
	else:
		vec.append_array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0])
		
	assert(vec.size() == OBS_SIZE, "OBS_SCHEMA_V1 violation: expected %d dims, got %d" % [OBS_SIZE, vec.size()])
	return vec

# ============================================================================
# BASELINE POLICY — Pure Pursuit + curvature-proportional speed control
# ============================================================================

func compute_baseline_action(delta: float) -> Dictionary:
	if not is_instance_valid(vehicle) or not is_active:
		return {"throttle": 0.0, "brake": 1.0, "steer": 0.0}
		
	var pos = vehicle.global_position
	var s = track_generator.get_progress_scalar(pos)
	var off_track = track_generator.get_off_track_distance(pos)
	
	# --- Safety state tracking ---
	if vehicle.velocity.length() < 50.0 and vehicle.throttle > 0.1:
		stuck_timer += delta
	else:
		stuck_timer = 0.0
		
	if off_track > 0.0:
		off_track_time += delta
	else:
		off_track_time = 0.0

	# --- Pure Pursuit steering ---
	var target = get_lookahead_point(lookahead_distance)
	var dir_to_target = (target - pos).normalized()
	
	var forward = Vector2.RIGHT.rotated(vehicle.rotation)
	var right = Vector2.DOWN.rotated(vehicle.rotation)
	
	var forward_dot = forward.dot(dir_to_target)
	var right_dot = right.dot(dir_to_target)
	
	# P-control steering (Kp = 2.5)
	var steer = clamp(right_dot * 2.5, -1.0, 1.0)
	
	# --- Curvature-proportional speed control ---
	var curvature_ahead = track_generator.get_local_curvature(s)
	var abs_curv = abs(curvature_ahead)
	
	var throttle: float = 1.0
	var brake: float = 0.0
	
	if abs_curv > 0.015:          # Sharp curve
		throttle = 0.3
		brake = 0.5
	elif abs_curv > 0.005:        # Medium curve
		throttle = 0.6
		brake = 0.1
	elif forward_dot < 0.5:       # Severely misaligned
		throttle = 0.2
		brake = 0.4
	elif vehicle.velocity.length() > vehicle.max_speed * 0.95:
		throttle = 0.8             # Lift-and-coast near top speed
		
	# --- SAFETY FALLBACK LAYER ---
	
	# Stuck recovery: reverse steering direction
	if stuck_timer > 1.5:
		throttle = 0.0
		brake = 1.0
		steer = -sign(steer) if abs(steer) > 0.01 else 1.0
		
	# Off-track emergency: brake hard and steer toward center
	if off_track > 50.0:
		throttle = 0.2
		brake = 0.8
		steer = clamp(sign(right_dot) * 1.5, -1.0, 1.0)
		
	return {
		"throttle": clamp(throttle, 0.0, 1.0),
		"brake": clamp(brake, 0.0, 1.0),
		"steer": clamp(steer, -1.0, 1.0)
	}

func get_lookahead_point(distance: float) -> Vector2:
	if not is_instance_valid(track_generator) or track_generator.get_track_length() == 0:
		return vehicle.global_position
		
	var s_local = track_generator.get_progress_scalar(vehicle.global_position)
	var total_length = track_generator.get_track_length()
	
	var current_offset = s_local * total_length
	var target_offset = fmod(current_offset + distance, total_length)
	
	return track_generator.path.curve.sample_baked(target_offset)

# NOTE: This agent does NOT have its own _physics_process.
# In the Gymnasium-like design, Race2D.step_environment() calls
# compute_baseline_action() and then injects actions via vehicle.apply_inputs().
