extends Node
class_name WorldEventManager

enum EventType { WIND_GUST, LOW_GRIP, CONTROL_INVERTED, SHORT_STUN, SENSOR_NOISE }

# Configuración y Estado
var rng: RandomNumberGenerator
var global_config: EnvironmentConfig
var active_events: Array[Dictionary] = []
var _rng_init_hash: int = 0

# Referencias
var agents: Array = []
var active_allowed: bool = false
@export var max_active_events: int = 2

func initialize(config: EnvironmentConfig, vehicles: Array):
	global_config = config
	agents = vehicles
	
	rng = RandomNumberGenerator.new()
	rng.seed = hash(str(global_config.base_seed) + "_world_events")
	_rng_init_hash = rng.seed
	
	active_events.clear()
	active_allowed = global_config.enable_events
	reset_agents_modifiers()

# Debería ser llamado manualmente en el step_environment desde Race2D.gd
func step_events(delta: float):
	if not active_allowed: return
	
	# Decrementar timers y remover expirados
	var to_remove = []
	for e in active_events:
		e["time_left"] -= delta
		if e["time_left"] <= 0.0:
			to_remove.append(e)
			
	for e in to_remove:
		active_events.erase(e)
		
	# Probabilidad de nuevo evento por fase de currículo
	if global_config.hazard_frequency > 0.0:
		if active_events.size() < max_active_events:
			# Aproximación probabilística Poisson determinista
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
		"total_duration": duration,
		"time_left": duration,
		"target": target_agent
	})

func reset_agents_modifiers():
	for a in agents:
		if is_instance_valid(a) and a.has_method("reset_modifiers"):
			a.reset_modifiers()

func apply_events_to_agents(delta: float):
	reset_agents_modifiers()
	
	for e in active_events:
		var a = e["target"]
		if not is_instance_valid(a): continue
		
		# Smooth decay: severity ramps down over final 30% of duration
		var effective_severity: float = e["severity"]
		var decay_threshold = e.get("total_duration", e["time_left"]) * 0.3
		if e["time_left"] < decay_threshold and decay_threshold > 0.0:
			effective_severity *= (e["time_left"] / decay_threshold)
		
		match e["type"]:
			EventType.WIND_GUST:
				var push = Vector2.RIGHT.rotated(a.rotation + PI/2) * 500.0 * effective_severity * delta
				a.apply_disturbance(push)
			EventType.LOW_GRIP:
				a.set_friction_modifier(1.0 - (0.5 * effective_severity))
				a.set_drift_impairment(1.0 - (0.5 * effective_severity))
			EventType.CONTROL_INVERTED:
				if effective_severity > 0.5: 
					a.set_control_inversion(true)
			EventType.SHORT_STUN:
				a.apply_stun(e["time_left"]) 
			EventType.SENSOR_NOISE:
				a.set_sensor_noise(effective_severity)

# Expone el estado a las observaciones de RL (Vector estructurado 7 dims)
func get_events_vector_for_agent(agent: Node) -> Array[float]:
	var v: Array[float] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0]
	if not active_allowed:
		return v
		
	for e in active_events:
		if e["target"] == agent:
			match e["type"]:
				EventType.WIND_GUST:
					v[0] = 1.0
					v[1] = 1.0 * e["severity"]
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

## Hash of the RNG init state for determinism verification.
func get_schedule_hash() -> int:
	return _rng_init_hash
