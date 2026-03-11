extends Node2D

@onready var track_generator = $TrackGenerator

var env_config: EnvironmentConfig
var world_event_manager: WorldEventManager
var reward_manager: RewardManager
var hud: Node

var vehicles: Array = []
var brains: Array = []
var vehicles_parent: Node2D

var current_step: int = 0
var time_since_last_inference: float = 0.0
var is_running: bool = false

var agent_progress_mem: Array[float] = []

func _ready():
	_setup_background()
	
	vehicles_parent = Node2D.new()
	vehicles_parent.name = "Vehicles"
	add_child(vehicles_parent)
	
	world_event_manager = WorldEventManager.new()
	world_event_manager.name = "WorldEventManager"
	add_child(world_event_manager)
	
	reward_manager = RewardManager.new()
	reward_manager.name = "RewardManager"
	add_child(reward_manager)
	
	var hud_scene = preload("res://ui/HUD.tscn")
	hud = hud_scene.instantiate()
	add_child(hud)

	
	# Standalone/Demo mode init
	var demo_config = EnvironmentConfig.new(42, 2, "train")
	reset_environment(demo_config)

func _setup_background():
	var bg = ParallaxBackground.new()
	bg.layer = -10
	var bl = ParallaxLayer.new()
	
	var spr = Sprite2D.new()
	spr.texture = preload("res://assets/sprites/track_background_grid.png")
	spr.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	spr.region_enabled = true
	spr.region_rect = Rect2(-10000, -10000, 20000, 20000)
	spr.centered = true
	
	bl.add_child(spr)
	bg.add_child(bl)
	add_child(bg)

# --- REQUERIMIENTOS ESTRICTOS DE RL ---

func reset_environment(config: EnvironmentConfig, custom_seed: int = -1) -> Array:
	is_running = false
	env_config = config
	
	if custom_seed != -1:
		env_config.base_seed = custom_seed
		
	current_step = 0
	time_since_last_inference = 0.0
	
	# 1. Determinismo Absoluto
	seed(env_config.base_seed)
	print("[ag-race] Reset Env | Seed: %d | Config: %s | Agents: %d" % [env_config.base_seed, env_config.config_hash, env_config.num_agents])
	
	# 2. Reconstrucción Semilla Estricta
	track_generator.generate_track(env_config.base_seed)
	
	for v in vehicles: if is_instance_valid(v): v.queue_free()
	for b in brains: if is_instance_valid(b): b.queue_free()
	vehicles.clear()
	brains.clear()
	agent_progress_mem.clear()
	
	# Spawn síncrono para RL
	_spawn_agents_sync()
	
	# Devuelve las primeras observaciones
	var initial_obs = []
	for b in brains:
		initial_obs.append(b.get_observation_vector())
	return initial_obs

func _spawn_agents_sync():
	var start_transform = track_generator.get_start_transform()
	var vehicle_scene = preload("res://agents/Vehicle.tscn")
	var brain_scene = preload("res://agents/BaselineAgent.tscn")
	var colors = [Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW]
	
	for i in range(env_config.num_agents):
		var v = vehicle_scene.instantiate() as Node2D
		var brain = brain_scene.instantiate()
		
		# Offset lateral estable anclado a base_seed
		var y_offset = (i - (env_config.num_agents - 1) / 2.0) * 50.0 
		var offset_pos = start_transform.basis_xform(Vector2(0, y_offset))
		
		v.global_position = start_transform.get_origin() + offset_pos
		v.rotation = start_transform.get_rotation()
		v.get_node("Visual").modulate = colors[i % colors.size()]
		
		vehicles_parent.add_child(v)
		vehicles.append(v)
		agent_progress_mem.append(0.0)
		
		v.add_child(brain)
		brains.append(brain)
		
	for b in brains:
		b.vehicle = b.get_parent()
		b.setup(track_generator, world_event_manager, vehicles)
		
	world_event_manager.initialize(env_config, vehicles)
	is_running = true

# Loop Desacoplado: Llamamos internamente a step() si es Demomode,
# o esperamos comando de Python.
func _physics_process(delta):
	if not is_running: return
	
	time_since_last_inference += delta
	var inference_dt = 1.0 / float(env_config.inference_fps)
	
	if time_since_last_inference >= inference_dt:
		# Standalone Demo Loop
		var actions: Array[Dictionary] = []
		for i in range(env_config.num_agents):
			actions.append(brains[i].compute_baseline_action(time_since_last_inference))
			
		var step_data = step_environment(actions, time_since_last_inference)
		time_since_last_inference -= inference_dt
		
		if is_instance_valid(hud):
			hud.update_telemetry(env_config, current_step, vehicles, brains, step_data["rewards"])
			
		if step_data["terminated"] or step_data["truncated"]:
			_log_episode_stats()
			reset_environment(env_config)

# API GYMNASIUM STRICTA
func step_environment(actions: Array[Dictionary], dt: float) -> Dictionary:
	current_step += 1
	var rewards: Array[float] = []
	var observations: Array[Array] = []
	var infos: Array[Dictionary] = []
	
	# 1. Aplicar variables del mundo
	world_event_manager.step_events(dt)
	
	# 2. Inject Actions (Action Hold)
	for i in range(vehicles.size()):
		var v = vehicles[i]
		var act = actions[i]
		v.apply_inputs(act["throttle"], act["brake"], act["steer"])
		# Asumimos físicas auto-actualizadas por el motor durante los `action_repeat` frames
		
	# 3. Extraer Recompensas y Estado
	for i in range(vehicles.size()):
		var v = vehicles[i]
		var b = brains[i]
		var current_s = track_generator.get_progress_scalar(v.global_position)
		var ds = current_s - agent_progress_mem[i]
		
		# Edge case: Completar la vuelta (Loop track)
		var lap_completed = false
		if ds < -0.5: 
			ds += 1.0 
			lap_completed = true
		elif ds > 0.5: 
			ds -= 1.0
			
		agent_progress_mem[i] = current_s
		var ds_meters = ds * track_generator.get_track_length()
		
		var off_track_dist = track_generator.get_off_track_distance(v.global_position)
		
		# Calcular métricas puras
		var r = reward_manager.calculate_reward(
			ds_meters, 
			off_track_dist, 
			b.stuck_timer > 1.0, 
			0, # TODO: collisions tracking real
			lap_completed,
			actions[i]["steer"] - b.prev_steer_action
		)
		b.prev_steer_action = actions[i]["steer"]
		
		rewards.append(r)
		observations.append(b.get_observation_vector())
		infos.append({
			"agent_id": i,
			"progress": current_s,
			"off_track_dist": off_track_dist,
			"lap_complete": lap_completed
		})
		
	var truncated = current_step >= env_config.max_steps_per_episode
	var terminated = false # Expandible si todos mueren
	
	return {
		"observations": observations,
		"rewards": rewards,
		"terminated": terminated,
		"truncated": truncated,
		"info": {"step": current_step, "agent_infos": infos}
	}

func _log_episode_stats():
	print("--- EPISODE END ---")
	print("Seed: %d | Total Steps: %d" % [env_config.base_seed, current_step])
	for i in range(vehicles.size()):
		print("Agent %d | Final Prog: %.2f | Stuck: %.1fs" % [i, agent_progress_mem[i], brains[i].stuck_timer])
