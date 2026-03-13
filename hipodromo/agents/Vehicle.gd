extends CharacterBody2D
class_name Vehicle

@export var max_speed: float = 1400.0
@export var acceleration: float = 1800.0
@export var turn_speed: float = 3.5
@export var lateral_grip: float = 4.0 
@export var drag: float = 1.0 
@export var braking: float = 2000.0

var throttle: float = 0.0 # 0.0 a 1.0
var brake_input: float = 0.0 # 0.0 a 1.0
var steer: float = 0.0 # -1.0 a 1.0

# --- Modificadores del Entorno (World Events) ---
var friction_modifier: float = 1.0
var control_inverted: bool = false
var sensor_noise: float = 0.0
var stun_timer: float = 0.0
var drift_impairment: float = 1.0
var _collisions_this_frame: int = 0

# --- Visual nodes (resolved in _ready) ---
@onready var visual = $Visual
@onready var particles = $EngineParticles
@onready var speed_lines = $SpeedLines
@onready var heading_indicator = $HeadingIndicator
@onready var agent_ring = $AgentRing
@onready var event_overlay = $EventOverlay

# --- Visual state ---
var _stun_flash_timer: float = 0.0

func _physics_process(delta):
	# Decrement stun timer
	if stun_timer > 0.0:
		stun_timer -= delta
		if stun_timer < 0.0:
			stun_timer = 0.0
	
	_collisions_this_frame = 0
	
	if abs(steer) > 0.01:
		rotation += steer * turn_speed * delta

	# Dirección hacia la que apunta la nave
	var forward_dir = Vector2.RIGHT.rotated(rotation)
	var right_dir = Vector2.DOWN.rotated(rotation)
	
	# Fuerzas aplicadas (considerando modificadores de RL)
	var final_acceleration = acceleration * friction_modifier
	var final_braking = braking * friction_modifier
	var final_grip = lateral_grip * drift_impairment
	var final_drag = drag * friction_modifier

	if throttle > 0:
		velocity += forward_dir * throttle * final_acceleration * delta
	
	if brake_input > 0:
		var current_speed = velocity.length()
		var brake_amount = min(final_braking * delta * brake_input, current_speed)
		if current_speed > 0:
			velocity -= (velocity / current_speed) * brake_amount

	# Fricción lateral (Drift recovery / Grip)
	var lateral_velocity = velocity.project(right_dir)
	var forward_velocity = velocity.project(forward_dir)
	
	lateral_velocity = lateral_velocity.move_toward(Vector2.ZERO, final_grip * lateral_velocity.length() * delta)
	forward_velocity = forward_velocity.move_toward(Vector2.ZERO, final_drag * forward_velocity.length() * delta)
	
	velocity = forward_velocity + lateral_velocity
	
	# Clamp speed
	if velocity.length() > max_speed:
		velocity = velocity.limit_length(max_speed)
	
	move_and_slide()
	
	for i in get_slide_collision_count():
		var col = get_slide_collision(i)
		var n = col.get_normal()
		velocity = velocity.bounce(n) * 0.7
		_collisions_this_frame += 1
		break
	
	# --- Visual feedback (purely cosmetic, no physics impact) ---
	_update_visuals(delta)

# ============================================================================
# VISUAL FEEDBACK — cosmetic only, does NOT affect simulation
# ============================================================================

func _update_visuals(delta: float):
	var speed_ratio = velocity.length() / max(1.0, max_speed)
	
	# Engine particles: scale with speed
	if particles:
		particles.emitting = throttle > 0
		particles.initial_velocity_max = lerpf(100.0, 400.0, speed_ratio)
		particles.amount = int(lerpf(5, 30, speed_ratio))
	
	# Speed lines: only at high speeds
	if speed_lines:
		speed_lines.emitting = speed_ratio > 0.7
	
	# Micro-tilt: lean visual into turns (max ±5°)
	if visual:
		var target_tilt = steer * speed_ratio * deg_to_rad(5.0)
		visual.rotation = lerpf(visual.rotation, target_tilt, 6.0 * delta)
	
	# Event overlay icons
	_update_event_overlay()
	
	# Stun flash effect
	if stun_timer > 0.0:
		_stun_flash_timer += delta
		if visual:
			if fmod(_stun_flash_timer, 0.15) < 0.075:
				visual.modulate = Color(3.0, 3.0, 3.0, 1.0)  # bright flash
			else:
				visual.modulate = Color(1.0, 1.0, 1.0, 1.0)
	else:
		_stun_flash_timer = 0.0
		if visual:
			visual.modulate = Color(1.0, 1.0, 1.0, 1.0)

func _update_event_overlay():
	if not event_overlay:
		return
	
	var icons: Array[String] = []
	if stun_timer > 0.0:
		icons.append("⚡")
	if control_inverted:
		icons.append("↕")
	if friction_modifier < 0.9:
		icons.append("⚠")
	if sensor_noise > 0.1:
		icons.append("◎")
	# Wind is transient, shown by disturbance velocity changes
	
	event_overlay.text = " ".join(icons)

# ============================================================================
# PUBLIC API — called by Controllers / AI Brains
# ============================================================================

func apply_inputs(in_throttle: float, in_brake: float, in_steer: float, in_drift: float = 0.0, in_stabilize: float = 0.0):
	if stun_timer > 0.0:
		self.throttle = 0.0
		self.brake_input = 0.0
		self.steer = 0.0
		return
		
	var final_steer = in_steer
	if control_inverted:
		final_steer = -in_steer
		
	self.throttle = clamp(in_throttle, 0.0, 1.0)
	self.brake_input = clamp(in_brake, 0.0, 1.0)
	self.steer = clamp(final_steer, -1.0, 1.0)
	
	# Drift/Stabilize modulation (only applies when non-zero)
	# drift reduces lateral grip, stabilize increases it
	if in_drift > 0.01 or in_stabilize > 0.01:
		var drift_factor = 1.0 - (clamp(in_drift, 0.0, 1.0) * 0.6)   # up to 40% less grip
		var stab_factor = 1.0 + (clamp(in_stabilize, 0.0, 1.0) * 0.3) # up to 30% more grip
		drift_impairment = clamp(drift_impairment * drift_factor * stab_factor, 0.3, 1.5)

func set_color(c: Color):
	# Color the agent ring (identification halo)
	if agent_ring:
		agent_ring.modulate = Color(c.r, c.g, c.b, 0.45)
	# Also tint heading indicator
	if heading_indicator:
		heading_indicator.default_color = Color(c.r, c.g, c.b, 0.5)

func reset_modifiers():
	friction_modifier = 1.0
	control_inverted = false
	sensor_noise = 0.0
	drift_impairment = 1.0

func set_friction_modifier(val: float):
	friction_modifier = max(0.1, val)

func set_control_inversion(inverted: bool):
	control_inverted = inverted

func apply_stun(duration: float):
	stun_timer = max(stun_timer, duration)

func set_drift_impairment(val: float):
	drift_impairment = max(0.1, val)

func set_sensor_noise(val: float):
	sensor_noise = max(0.0, val)

func apply_disturbance(force_vector: Vector2):
	velocity += force_vector

## Number of wall collisions detected this physics frame.
func get_collision_count_this_frame() -> int:
	return _collisions_this_frame
