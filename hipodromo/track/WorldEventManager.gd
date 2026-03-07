extends Node
class_name WorldEventManager

enum EventType { WIND_GUST, LOW_GRIP, CONTROL_INVERTED, SHORT_STUN, SENSOR_NOISE }

# Configuración y Estado Diario
var rng: RandomNumberGenerator
var global_config: EnvironmentConfig
var active_events: Array[Dictionary] = []

# Referencias
var agents: Array = []
var track_length: float = 0.0

@export var max_active_events: int = 2

# Inicializa el RNG y el Schedule
func initialize(config: EnvironmentConfig, vehicles: Array, total_track_length: float):
	global_config = config
	agents = vehicles
	track_length = total_track_length
	
	rng = RandomNumberGenerator.new()
	rng.seed = global_config.base_seed + 100 # Offset semilla events
	
	active_events.clear()
	reset_agents_modifiers()

func _physics_process(delta):
	# Decrementar timers y remover expirados
	var to_remove = []
	for e in active_events:
		e["time_left"] -= delta
		if e["time_left"] <= 0.0:
			to_remove.append(e)
			
	for e in to_remove:
		active_events.erase(e)
		
	# Probabilidad de nuevo evento por fase de currículo
	if global_config and global_config.hazard_frequency > 0.0:
		if active_events.size() < max_active_events:
			# Un roll simple por segundo (aproximado ajustado por dt)
			if rng.randf() < global_config.hazard_frequency * delta * 0.5:
				spawn_event()
				
	apply_events_to_agents(delta)

func spawn_event():
	if agents.is_empty(): return
	var type_idx = rng.randi() % EventType.size()
	var ev_type = type_idx as EventType
	
	var severity = rng.randf_range(0.2, global_config.max_hazard_severity)
	var target_agent = agents[rng.randi() % agents.size()]
	
	var duration = 0.0
	match ev_type:
		EventType.WIND_GUST: duration = rng.randf_range(1.0, 3.0)
		EventType.LOW_GRIP: duration = rng.randf_range(2.0, 5.0)
		EventType.CONTROL_INVERTED: duration = rng.randf_range(1.0, 2.5)
		EventType.SHORT_STUN: duration = rng.randf_range(0.3, 1.0)
		EventType.SENSOR_NOISE: duration = rng.randf_range(3.0, 6.0)
	
	active_events.append({
		"type": ev_type,
		"severity": severity,
		"time_left": duration,
		"target": target_agent
	})

func reset_agents_modifiers():
	for a in agents:
		if is_instance_valid(a):
			a.set_friction_modifier(1.0)
			a.set_control_inversion(false)
			a.set_drift_impairment(1.0)
			a.set_sensor_noise(0.0)

func apply_events_to_agents(delta: float):
	reset_agents_modifiers() # Reset base config cada frame, luego acumulamos
	
	for e in active_events:
		var a = e["target"]
		if not is_instance_valid(a): continue
		
		# Decaimiento y aplicación
		match e["type"]:
			EventType.WIND_GUST:
				# Vector viento empujando a la derecha local
				var push = Vector2.RIGHT.rotated(a.rotation + PI/2) * 500.0 * e["severity"] * delta
				a.apply_disturbance(push)
			EventType.LOW_GRIP:
				a.set_friction_modifier(1.0 - (0.5 * e["severity"]))
				a.set_drift_impairment(1.0 - (0.5 * e["severity"]))
			EventType.CONTROL_INVERTED:
				if e["severity"] > 0.5: # Hard switch boolean
					a.set_control_inversion(true)
			EventType.SHORT_STUN:
				a.apply_stun(e["time_left"]) 
			EventType.SENSOR_NOISE:
				a.set_sensor_noise(e["severity"])

# Expone el estado a las observaciones de RL (Vector estructurado)
func get_events_vector_for_agent(agent: Vehicle) -> Array[float]:
	# Para la matriz fija, representamos si sufro algo:
	# [is_windy, wind_x, wind_y, fri_mod, ctrl_inv, is_stunned, noise_lvl]
	var v: Array[float] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0]
	
	for e in active_events:
		if e["target"] == agent:
			match e["type"]:
				EventType.WIND_GUST:
					v[0] = 1.0
					v[1] = 1.0 * e["severity"] # Simplificado
					v[2] = 0.0
				EventType.LOW_GRIP:
					v[3] = 1.0 - (0.5 * e["severity"])
				EventType.CONTROL_INVERTED:
					v[4] = 1.0 if e["severity"] > 0.5 else 0.0
				EventType.SHORT_STUN:
					v[5] = e["time_left"]
				EventType.SENSOR_NOISE:
					v[6] = e["severity"]
	return v
