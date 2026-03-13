extends Node2D

@onready var track_generator = $TrackGenerator
@onready var camera = $Camera2D

var env_config: EnvironmentConfig
var world_event_manager: WorldEventManager
var reward_manager: RewardManager
var hud: Node
var python_bridge: PythonBridge

var vehicles: Array = []
var brains: Array = []
var vehicles_parent: Node2D

var current_step: int = 0
var time_since_last_inference: float = 0.0
var is_running: bool = false

# Progress tracking (normalized [0,1])
var agent_progress_mem: Array[float] = []

# Explicit action hold
var last_actions: Array[Dictionary] = []

# Per-agent episode accumulators
var agent_total_reward: Array[float] = []
var agent_total_off_track_time: Array[float] = []
var agent_total_collisions: Array[int] = []
var agent_stuck_events: Array[int] = []

# --- Free Camera ---
var cam_zoom_level: float = 0.3
var cam_zoom_min: float = 0.05
var cam_zoom_max: float = 2.0
var cam_zoom_step: float = 0.06
var cam_pan_speed: float = 800.0  # pixels/sec at zoom 1.0
var cam_dragging: bool = false
var cam_drag_start: Vector2 = Vector2.ZERO

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

	# --- Setup Python Bridge for training ---
	python_bridge = PythonBridge.new()
	python_bridge.port = env_config.bridge_port if env_config else 9090
	python_bridge.command_received.connect(_on_bridge_command)
	add_child(python_bridge)

	# Standalone/Demo mode init
	var demo_config = EnvironmentConfig.new(42, 2, "train")
	reset_environment(demo_config)

func _setup_background():
	var bg = ParallaxBackground.new()
	bg.layer = -10
	
	# Primary layer: dark grid
	var bl = ParallaxLayer.new()
	var spr = Sprite2D.new()
	spr.texture = preload("res://assets/sprites/bg_dark_grid.png")
	spr.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	spr.region_enabled = true
	spr.region_rect = Rect2(-10000, -10000, 20000, 20000)
	spr.centered = true
	bl.add_child(spr)
	bg.add_child(bl)
	
	# Secondary layer: slight parallax for depth
	var bl2 = ParallaxLayer.new()
	bl2.motion_scale = Vector2(0.95, 0.95)
	var spr2 = Sprite2D.new()
	spr2.texture = preload("res://assets/sprites/bg_dark_grid.png")
	spr2.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	spr2.region_enabled = true
	spr2.region_rect = Rect2(-10000, -10000, 20000, 20000)
	spr2.centered = true
	spr2.modulate = Color(0.6, 0.6, 0.8, 0.3)
	bl2.add_child(spr2)
	bg.add_child(bl2)
	
	add_child(bg)

# ============================================================================
# RL API — reset() and step()
# ============================================================================

func reset_environment(config: EnvironmentConfig, custom_seed: int = -1) -> Array:
	is_running = false
	env_config = config
	
	if custom_seed != -1:
		env_config.base_seed = custom_seed
		
	current_step = 0
	time_since_last_inference = 0.0
	
	# 1. Determinismo Absoluto
	seed(env_config.base_seed)
	
	# 2. Generate track from config (sources track_width from config)
	track_generator.generate_track(env_config.base_seed, env_config.track_width)
	track_generator.build_visuals()
	
	# 3. Clean previous agents
	for v in vehicles: if is_instance_valid(v): v.queue_free()
	for b in brains: if is_instance_valid(b): b.queue_free()
	vehicles.clear()
	brains.clear()
	agent_progress_mem.clear()
	last_actions.clear()
	agent_total_reward.clear()
	agent_total_off_track_time.clear()
	agent_total_collisions.clear()
	agent_stuck_events.clear()
	
	# 4. Spawn agents
	_spawn_agents_sync()
	
	# 5. Initialize accumulators
	for i in range(env_config.num_agents):
		agent_total_reward.append(0.0)
		agent_total_off_track_time.append(0.0)
		agent_total_collisions.append(0)
		agent_stuck_events.append(0)
		last_actions.append({"throttle": 0.0, "brake": 0.0, "steer": 0.0})
	
	if env_config.debug_logging:
		print("[ag-race] Reset | Seed: %d | Config: %s | Agents: %d | Track hash: %d | Events hash: %d" % [
			env_config.base_seed, env_config.config_hash, env_config.num_agents,
			track_generator.get_track_hash(), world_event_manager.get_schedule_hash()
		])
	
	# Return initial observations
	var initial_obs = []
	for b in brains:
		initial_obs.append(b.get_observation_vector())
	return initial_obs

func _spawn_agents_sync():
	var start_transform = track_generator.get_start_transform()
	var vehicle_scene = preload("res://agents/Vehicle.tscn")
	var baseline_brain_scene = preload("res://agents/BaselineAgent.tscn")
	var neural_brain_scene = preload("res://agents/NeuralAgent.tscn")
	var colors = [Color.RED, Color.GREEN, Color.BLUE, Color.YELLOW]
	
	var cols = 3
	var spacing_x = 100.0
	var spacing_y = 60.0

	for i in range(env_config.num_agents):
		var v = vehicle_scene.instantiate() as Node2D
		var brain: Node
		
		# Select brain type from config
		if env_config.agent_type == "neural":
			brain = neural_brain_scene.instantiate()
		else:
			brain = baseline_brain_scene.instantiate()
		
		# Grid Spawning: col (lateral), row (longitudinal backwards)
		var col = i % cols
		var row = i / cols
		
		var x_off = -row * spacing_x
		var y_off = (col - (cols - 1) / 2.0) * spacing_y
		
		var offset_pos = start_transform.basis_xform(Vector2(x_off, y_off))
		
		v.global_position = start_transform.get_origin() + offset_pos
		v.rotation = start_transform.get_rotation()
		v.set_color(colors[i % colors.size()])
		
		# Apply Hover Parameters from Config
		v.max_speed = 600.0 # Default Tuning
		v.max_acceleration = 1200.0
		v.friction_longitudinal = env_config.friction_longitudinal
		v.friction_lateral = env_config.friction_lateral
		v.hover_damping = env_config.hover_damping
		
		vehicles_parent.add_child(v)
		vehicles.append(v)
		agent_progress_mem.append(0.0)
		
		v.add_child(brain)
		brains.append(brain)
		
	for b in brains:
		b.vehicle = b.get_parent()
		b.setup(track_generator, world_event_manager, vehicles)
		# If neural agent, optionally load weights
		if env_config.agent_type == "neural" and b is NeuralAgent:
			if env_config.neural_weights_path != "":
				b.load_weights_from_json(env_config.neural_weights_path)
	
	world_event_manager.initialize(env_config, vehicles)
	is_running = true

# ============================================================================
# FREE CAMERA — zoom (scroll), pan (WASD/arrows/middle-drag)
# ============================================================================

func _input(event):
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_adjust_zoom(1.15)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_adjust_zoom(1.0 / 1.15)
		elif event.button_index == MOUSE_BUTTON_MIDDLE:
			if event.pressed:
				cam_dragging = true
				cam_drag_start = event.position
			else:
				cam_dragging = false
				
	elif event is InputEventMagnifyGesture:
		_adjust_zoom(event.factor)
	
	elif event is InputEventPanGesture:
		camera.position += event.delta * (20.0 / cam_zoom_level)
				
	elif event is InputEventMouseMotion and cam_dragging:
		var delta_px = event.position - cam_drag_start
		cam_drag_start = event.position
		camera.position -= delta_px / cam_zoom_level

func _adjust_zoom(factor: float):
	cam_zoom_level = clampf(cam_zoom_level * factor, cam_zoom_min, cam_zoom_max)
	camera.zoom = Vector2(cam_zoom_level, cam_zoom_level)

func _process(delta):
	# WASD / Arrow key panning
	var pan_dir = Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		pan_dir.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		pan_dir.y += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		pan_dir.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		pan_dir.x += 1.0
	
	if pan_dir != Vector2.ZERO:
		camera.position += pan_dir.normalized() * cam_pan_speed * delta / cam_zoom_level
		
	# Keyboard Zoom (E to zoom in, Q to zoom out)
	if Input.is_key_pressed(KEY_E):
		_adjust_zoom(1.0 + 2.0 * delta)
	if Input.is_key_pressed(KEY_Q):
		_adjust_zoom(1.0 - 2.0 * delta)

# ============================================================================
# PHYSICS LOOP — Demo mode with action hold
# ============================================================================

func _physics_process(delta):
	# If logic is being driven by bridge (training), skip automatic AI processing
	if not is_running or (env_config and env_config.headless_training): return
	
	time_since_last_inference += delta
	var inference_dt = 1.0 / float(env_config.inference_fps)
	
	if time_since_last_inference >= inference_dt:
		# Compute new actions from agent policy
		var actions: Array[Dictionary] = []
		for i in range(env_config.num_agents):
			var b = brains[i]
			if b is NeuralAgent:
				actions.append(b.compute_action(time_since_last_inference))
			else:
				actions.append(b.compute_baseline_action(time_since_last_inference))
		
		# Store for action hold
		last_actions = []
		for a in actions:
			last_actions.append(a.duplicate())
		
		var step_data = await step_environment(actions, time_since_last_inference)
		time_since_last_inference -= inference_dt
		
		if is_instance_valid(hud) and env_config.debug_hud:
			hud.update_telemetry(env_config, current_step, vehicles, brains, step_data["rewards"])
			
		if step_data["terminated"] or step_data["truncated"]:
			_log_episode_stats(step_data["terminated"], step_data["truncated"])
			reset_environment(env_config)
	else:
		# Action hold: apply last actions between inference ticks
		for i in range(vehicles.size()):
			if i < last_actions.size():
				var v = vehicles[i]
				var act = last_actions[i]
				v.apply_inputs(
					act.get("throttle", 0.0),
					act.get("brake", 0.0),
					act.get("steer", 0.0)
				)

# ============================================================================
# GYMNASIUM-LIKE STEP
# ============================================================================

func step_environment(actions: Array[Dictionary], dt: float) -> Dictionary:
	current_step += 1
	var rewards: Array[float] = []
	var observations: Array[Array] = []
	var infos: Array[Dictionary] = []
	
	# 1. Step world events
	world_event_manager.step_events(dt)
	
	# 2. Inject actions into vehicles
	for i in range(vehicles.size()):
		var v = vehicles[i]
		var act = actions[i]
		v.apply_inputs(
			act.get("throttle", 0.0),
			act.get("brake", 0.0),
			act.get("steer", 0.0),
			act.get("drift", 0.0),
			act.get("stabilize", 0.0)
		)
		
	# Let Godot natively process N physics ticks
	if env_config and env_config.headless_training:
		var ticks_per_step = int(Engine.physics_ticks_per_second / float(env_config.inference_fps))
		for index in range(ticks_per_step):
			await get_tree().physics_frame
			
	# 3. Extract rewards, observations, and info
	for i in range(vehicles.size()):
		var v = vehicles[i]
		var b = brains[i]
		var current_s = track_generator.get_progress_scalar(v.global_position)  # [0, 1]
		var ds = current_s - agent_progress_mem[i]
		
		# Edge case: crossing the lap boundary (loop track)
		var lap_completed = false
		if ds < -0.5: 
			ds += 1.0 
			lap_completed = true
		elif ds > 0.5: 
			ds -= 1.0
			
		agent_progress_mem[i] = current_s
		var ds_meters = ds * track_generator.get_track_length()
		
		var off_track_dist = track_generator.get_off_track_distance(v.global_position)
		var collisions_this_tick = v.get_collision_count_this_frame()
		
		# Permadeath Check (only on wall hits and with 2.0s grace period)
		var race_time = float(current_step) / float(env_config.inference_fps)
		var wall_hits = v.get_wall_collision_count_this_frame()
		if wall_hits > 0 and not v.is_dead and race_time > 2.0:
			v.die()
			
		# Track accumulators
		if off_track_dist > 0.0:
			agent_total_off_track_time[i] += dt
		agent_total_collisions[i] += collisions_this_tick
		if b.stuck_timer > 1.5 and b.stuck_timer - dt <= 1.5:
			agent_stuck_events[i] += 1
		
		# Compute reward
		# User priority: "premise por mas distancia en menos tiempo" -> increase progress weight
		var r = reward_manager.calculate_reward(
			ds_meters, 
			off_track_dist, 
			b.stuck_timer > 1.0, 
			wall_hits, # Punishment focus on wall hits
			lap_completed,
			actions[i]["steer"] - b.prev_steer_action,
			actions[i].get("brake", 0.0),
			actions[i].get("steer", 0.0),
			actions[i].get("drift", 0.0)
		)
		b.prev_steer_action = actions[i]["steer"]
		agent_total_reward[i] += r
		
		rewards.append(r)
		observations.append(b.get_observation_vector())
		infos.append({
			"agent_id": i,
			"progress": current_s,
			"off_track_dist": off_track_dist,
			"collisions": collisions_this_tick,
			"lap_complete": lap_completed,
			"stuck_timer": b.stuck_timer,
		})
		
	var truncated = current_step >= env_config.max_steps_per_episode
	
	# Terminate if all vehicles are dead
	var terminated = true
	for v in vehicles:
		if not v.is_dead:
			terminated = false
			break
			
	return {
		"observations": observations,
		"rewards": rewards,
		"terminated": terminated,
		"truncated": truncated,
		"info": {"step": current_step, "agent_infos": infos}
	}

# ============================================================================
# STRUCTURED EPISODE LOGGING
# ============================================================================

func _log_episode_stats(terminated: bool, truncated: bool):
	if not env_config.debug_logging: return
	
	var terminated_cause = "none"
	if terminated: terminated_cause = "all_agents_done"
	var truncated_cause = "none"
	if truncated: truncated_cause = "max_steps_%d" % env_config.max_steps_per_episode
	
	print("=== EPISODE END ===")
	print("  seed:                %d" % env_config.base_seed)
	print("  config_hash:         %s" % env_config.config_hash)
	print("  track_hash:          %d" % track_generator.get_track_hash())
	print("  event_schedule_hash: %d" % world_event_manager.get_schedule_hash())
	print("  total_steps:         %d" % current_step)
	print("  terminated_cause:    %s" % terminated_cause)
	print("  truncated_cause:     %s" % truncated_cause)
	
	for i in range(vehicles.size()):
		print("  --- Agent %d ---" % i)
		print("    reward_total:     %+.3f" % agent_total_reward[i])
		print("    final_progress:   %.4f" % agent_progress_mem[i])
		print("    off_track_time:   %.2fs" % agent_total_off_track_time[i])
		print("    collisions:       %d" % agent_total_collisions[i])
		print("    stuck_events:     %d" % agent_stuck_events[i])
# ============================================================================
# BRIDGE COMMAND HANDLER
# ============================================================================

func _on_bridge_command(cmd: Dictionary):
	var type = cmd.get("type", cmd.get("cmd", ""))
	
	match type:
		"reset":
			var seed_val = cmd.get("seed", 42)
			var phase = cmd.get("phase", 1)
			var cfg = EnvironmentConfig.new(seed_val, phase)
			cfg.num_agents = cmd.get("num_agents", cfg.num_agents)
			cfg.agent_type = cmd.get("agent_type", "neural")
			# Only set headless_training if we are actually headless
			cfg.headless_training = DisplayServer.get_name() == "headless"
			cfg._compute_hash()
			
			var obs = reset_environment(cfg)
			python_bridge.send_response({"type": "reset_result", "obs": obs})
			
		"step":
			if not is_running:
				python_bridge.send_response({"error": "Environment not running. Call reset first."})
				return
				
			var action_arrays = cmd.get("actions", [])
			var actions_dicts: Array[Dictionary] = []
			
			for i in range(env_config.num_agents):
				var b = brains[i]
				# If baseline, use internal AI. If neural, use provided actions if any.
				if env_config.agent_type != "baseline" and action_arrays.size() > i:
					var raw = action_arrays[i]
					actions_dicts.append({
						"throttle": raw[0],
						"brake": raw[1],
						"steer": raw[2],
						"drift": raw[3] if raw.size() > 3 else 0.0,
						"stabilize": raw[4] if raw.size() > 4 else 0.0
					})
				else:
					# Fallback to internal AI
					if b is NeuralAgent:
						actions_dicts.append(b.compute_action(1.0/60.0))
					else:
						actions_dicts.append(b.compute_baseline_action(1.0/60.0))
			
			# Step the environment for one inference tick (covers N physics steps)
			var result = await step_environment(actions_dicts, 1.0 / float(env_config.inference_fps))
			
			# Prepare response (convert observations to serializable format)
			var response = {
				"type": "step_result",
				"obs": result["observations"],
				"rewards": result["rewards"],
				"terminated": result["terminated"],
				"truncated": result["truncated"],
				"info": result["info"]
			}
			python_bridge.send_response(response)
			
		"close":
			get_tree().quit()
