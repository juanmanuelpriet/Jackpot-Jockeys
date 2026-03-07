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
	var canvas = CanvasLayer.new()
	canvas.layer = -10 # Behind everything
	
	var tex = preload("res://assets/sprites/track_background_grid.png")
	var tex_rect = TextureRect.new()
	tex_rect.texture = tex
	tex_rect.stretch_mode = TextureRect.STRETCH_TILE
	
	# Parallax-like infinite grid by locking it to the screen size but repeating
	tex_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	# But actually we are in a 2D scene, so ParallaxBackground is better
	
	canvas.queue_free() # Re-design logic
	var bg = ParallaxBackground.new()
	bg.layer = -10
	var bl = ParallaxLayer.new()
	bl.motion_mirroring = Vector2(2000, 2000)
	var spr = Sprite2D.new()
	spr.texture = tex
	spr.region_enabled = true
	spr.region_rect = Rect2(0, 0, 4000, 4000) # Replicates infinitely inside the mirror
	
	# Configurar el sprite centrado o relativo
	spr.centered = false
	
	bl.add_child(spr)
	bg.add_child(bl)
	add_child(bg)

# --- REQUERIMIENTOS ESTRICTOS DE RL ---

func reset_environment(config: EnvironmentConfig):
	is_running = false
	env_config = config
	current_step = 0
	time_since_last_inference = 0.0
	
	# 1. Determinismo absoluto
	seed(env_config.base_seed)
	print("[AG-RACE] Reset Environment - Seed: ", env_config.base_seed, " Config Hash: ", env_config.config_hash)
	
	# 2. Generar Pista Determinista
	track_generator.generate_track(env_config.base_seed)
	
	# Limpiar agentes viejos
	for v in vehicles: if is_instance_valid(v): v.queue_free()
	for b in brains: if is_instance_valid(b): b.queue_free()
	vehicles.clear()
	brains.clear()
	agent_progress_mem.clear()
	
	# Wait one frame for splines to build correctly
	call_deferred("_spawn_agents_and_start")

func _spawn_agents_and_start():
	var start_transform = track_generator.get_start_transform()
	
	var vehicle_scene = preload("res://agents/Vehicle.tscn")
	var brain_scene = preload("res://agents/AIBrain.tscn")
	var colors = [Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW]
	
	for i in range(env_config.num_agents):
		var v = vehicle_scene.instantiate() as Node2D
		var brain = brain_scene.instantiate()
		
		# Offset lateral estable y determinista
		var y_offset = (i - (env_config.num_agents - 1) / 2.0) * 50.0 
		var local_offset = Vector2(0, y_offset)
		var offset_pos = start_transform.basis_xform(local_offset)
		
		v.global_position = start_transform.get_origin() + offset_pos
		v.rotation = start_transform.get_rotation()
		v.set_deferred("visual.color", colors[i % colors.size()])
		
		vehicles_parent.add_child(v)
		vehicles.append(v)
		agent_progress_mem.append(0.0)
		
		v.add_child(brain)
		brains.append(brain)
		
	# Setup brains & world events
	for b in brains:
		b.vehicle = b.get_parent()
		b.setup(track_generator, world_event_manager, vehicles)
		
	world_event_manager.initialize(env_config, vehicles, track_generator.get_track_length())
	is_running = true

# Loop Desacoplado (Engine corre a 60Hz de físicas nativas)
# Llamamos a step() a la frecuencia de inferencia (ej. 15Hz o 20Hz)
func _physics_process(delta):
	if not is_running: return
	
	time_since_last_inference += delta
	var inference_dt = 1.0 / float(env_config.inference_fps)
	
	if time_since_last_inference >= inference_dt:
		# En un loop real externo, aquí pausaríamos y enviaríamos obs a Python.
		# Como es standalone, obtenemos acciones del Baseline.
		var actions: Array[Dictionary] = []
		for i in range(env_config.num_agents):
			var act = brains[i].compute_baseline_action(time_since_last_inference)
			actions.append(act)
			
		var step_data = step_environment(actions, time_since_last_inference)
		time_since_last_inference = 0.0
		
		if is_instance_valid(hud):
			hud.update_telemetry(env_config, current_step, vehicles, brains, step_data["rewards"])

# Ejecutar un paso de inferencia y devolver estado completo
func step_environment(actions: Array[Dictionary], dt: float) -> Dictionary:
	current_step += 1
	var rewards = []
	var observations = []
	
	# 1. Avance del Mundo (Eventos)
	world_event_manager.apply_events_to_agents(dt)
	
	# 2. Aplicar Acciones (Action Hold inter-frames)
	for i in range(vehicles.size()):
		var v = vehicles[i]
		var act = actions[i]
		v.apply_inputs(act["throttle"], act["brake"], act["steer"])
		
	# 3. Calcular Recompensas Basadas en Métricas Puras
	for i in range(vehicles.size()):
		var v = vehicles[i]
		var current_s = track_generator.get_progress_scalar(v.global_position)
		var ds = current_s - agent_progress_mem[i]
		
		# Manejo simple de vueltas (loop de progreso 0.99 -> 0.01)
		if ds < -0.5: ds += 1.0 
		elif ds > 0.5: ds -= 1.0
			
		agent_progress_mem[i] = current_s
		
		var off_track_dist = track_generator.get_off_track_distance(v.global_position)
		var is_off_track = off_track_dist > 5.0
		var is_stuck = brains[i].stuck_timer > 1.0
		var r = reward_manager.calculate_reward(ds * track_generator.get_track_length(), is_off_track, is_stuck, 0, false)
		rewards.append(r)
		observations.append(brains[i].get_observation_vector())
		
	var done = current_step >= env_config.max_steps_per_episode
	
	return {
		"observations": observations,
		"rewards": rewards,
		"done": done,
		"info": {"step": current_step}
	}
