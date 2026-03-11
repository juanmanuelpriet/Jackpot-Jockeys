extends Node
class_name BaselineAgent

const OBS_SCHEMA_V1 = "15_dims: [speed, v_x, v_y, s, off_track, stuck, error_h, error_l, w_gust_flag, w_x, w_y, f_mod, ctrl_inv, stun_t, noise_t]"

@export var vehicle_path: NodePath
var vehicle: Vehicle

# Referencias inyectadas por el Entorno
var track_generator: Node2D
var world_event_manager: Node
var rival_agents: Array = []

var is_active: bool = false
var lookahead_distance: float = 400.0

# Estado interno para fallback y recompensas
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
	
	# Filtrar para no incluirse a sí mismo
	rival_agents.clear()
	for r in p_rivals:
		if r != vehicle:
			rival_agents.append(r)
			
	is_active = true

# --- OBSERVACIÓN ESTRUCTURADA ---

func get_observation_dict() -> Dictionary:
	if not is_instance_valid(vehicle) or not is_instance_valid(track_generator):
		return {}
		
	var global_pos = vehicle.global_position
	var s = track_generator.get_progress_scalar(global_pos)
	var off_track_dist = track_generator.get_off_track_distance(global_pos)
	
	var ideal_heading = track_generator.get_ideal_heading(global_pos)
	var forward = Vector2.RIGHT.rotated(vehicle.rotation)
	var heading_error = forward.angle_to(ideal_heading)
	
	var obs = {
		"self_state": {
			"speed": vehicle.velocity.length() / max(1.0, vehicle.max_speed),
			"vel_x": vehicle.velocity.x / max(1.0, vehicle.max_speed),
			"vel_y": vehicle.velocity.y / max(1.0, vehicle.max_speed),
			"progress": s,
			"off_track": off_track_dist,
			"stuck_timer": stuck_timer
		},
		"track": {
			"heading_error": heading_error / PI,
			"lateral_error": off_track_dist / 100.0,
			"curvature_ahead": track_generator.get_local_curvature(s)
		},
		"world_events": []
	}
	
	if is_instance_valid(world_event_manager):
		obs["world_events"] = world_event_manager.get_events_vector_for_agent(vehicle)
		
	return obs

func get_observation_vector() -> Array[float]:
	var dict = get_observation_dict()
	if dict.is_empty():
		var empty: Array[float] = []
		empty.resize(15) 
		empty.fill(0.0)
		return empty
		
	var vec: Array[float] = []
	# 1. Self state (6)
	vec.append(dict["self_state"]["speed"])
	vec.append(dict["self_state"]["vel_x"])
	vec.append(dict["self_state"]["vel_y"])
	vec.append(dict["self_state"]["progress"])
	vec.append(dict["self_state"]["off_track"])
	vec.append(dict["self_state"]["stuck_timer"])
	
	# 2. Track errors (2) (Normalizamos el array de Tracksensors asumiendo sin raycasts)
	vec.append(dict["track"]["heading_error"])
	vec.append(dict["track"]["lateral_error"])
	
	# 3. World Events (7)
	var events: Array = dict["world_events"]
	if events.size() == 7:
		for e in events: vec.append(float(e))
	else:
		vec.append_array([0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0])
		
	# Tamaño total base garantizado = 6 + 2 + 7 = 15 dims (V1)
	return vec

# --- CONTROL BASELINE / POLICY ---

# Devuelve las acciones recomendadas por la heurística oficial
func compute_baseline_action(delta: float) -> Dictionary:
	if not is_instance_valid(vehicle) or not is_active:
		return {"throttle": 0.0, "brake": 1.0, "steer": 0.0}
		
	var pos = vehicle.global_position
	var s = track_generator.get_progress_scalar(pos)
	var off_track = track_generator.get_off_track_distance(pos)
	
	# Actualizar variables de safety (stuck handling real)
	if vehicle.velocity.length() < 50.0 and vehicle.throttle > 0.1:
		stuck_timer += delta
	else:
		stuck_timer = 0.0
		
	if off_track > 0.0:
		off_track_time += delta
	else:
		off_track_time = 0.0

	var target = get_lookahead_point(lookahead_distance)
	var dir_to_target = (target - pos).normalized()
	
	var forward = Vector2.RIGHT.rotated(vehicle.rotation)
	var right = Vector2.DOWN.rotated(vehicle.rotation)
	
	var forward_dot = forward.dot(dir_to_target)
	var right_dot = right.dot(dir_to_target)
	
	# P-Control / Pure Pursuit Steering
	var steer = right_dot * 2.5 # Ganancia Kp simple
	steer = clamp(steer, -1.0, 1.0)
	
	# Modulación de aceleración predictiva por curvatura local
	var curvature_ahead = track_generator.get_local_curvature(s)
	
	var throttle = 1.0
	var brake = 0.0
	
	if abs(curvature_ahead) > 0.015: # Curva fuerte
		throttle = 0.3
		brake = 0.5
	elif abs(curvature_ahead) > 0.005: # Curva media
		throttle = 0.6
		brake = 0.1
	elif forward_dot < 0.5: # Vehículo mal orientado
		throttle = 0.2
		brake = 0.4
	elif vehicle.velocity.length() > vehicle.max_speed * 0.95:
		throttle = 0.8 # Lift and coast near topspeed
		
	# --- CAPA DE SEGURIDAD (FALLBACK) ---
	
	# Si está atrapado
	if stuck_timer > 1.5:
		throttle = 0.0
		brake = 1.0
		steer = -sign(steer) # Intentar reversa opuesta
		
	# Si va directo a la pared (off-track crítico)
	if off_track > 50.0:
		throttle = 0.2
		brake = 0.8
		# Emergency Steer hacia el centro asumiendo path cercano
		steer = sign(right_dot) * 1.5 
		
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

# IMPORTANTE: Eliminamos _physics_process interno de este script.
# En este diseño Gymnasium-Like, es el Entorno (Race2D.step_environment)
# el que obtiene 'compute_baseline_action()' y luego inyecta las variables a 'v.apply_inputs()'.
