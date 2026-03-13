extends CharacterBody2D
class_name Vehicle

@export var max_speed: float = 600.0
@export var max_acceleration: float = 1200.0
@export var turn_speed: float = 2.8
@export var friction_longitudinal: float = 0.98
@export var friction_lateral: float = 0.92
@export var hover_damping: float = 0.99

var throttle: float = 0.0 # 0.0 a 1.0
var brake_input: float = 0.0 # 0.0 a 1.0
var steer: float = 0.0 # -1.0 a 1.0
var drift_input: float = 0.0 # 0.0 a 1.0
var stabilize_input: float = 0.0 # 0.0 a 1.0

# Internal velocity components (Hover physics)
var velocity_forward: float = 0.0
var velocity_lateral: float = 0.0
var angular_velocity: float = 0.0

# --- Modificadores del Entorno (World Events) ---
var friction_modifier: float = 1.0
var control_inverted: bool = false
var sensor_noise: float = 0.0
var stun_timer: float = 0.0
var drift_impairment: float = 1.0
var _collisions_this_frame: int = 0
var _wall_collisions_this_frame: int = 0
var is_dead: bool = false

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
	if is_dead:
		velocity = velocity.move_toward(Vector2.ZERO, 3000.0 * delta)
		move_and_slide()
		return

	# Decrement stun timer
	if stun_timer > 0.0:
		stun_timer -= delta
		if stun_timer < 0.0:
			stun_timer = 0.0
	
	_collisions_this_frame = 0
	_wall_collisions_this_frame = 0
	
	if abs(steer) > 0.01:
		# 4. Dirección: steer produce cambio de heading proporcional a velocidad.
		var speed_norm = clamp(abs(velocity_forward) / max_speed, 0.0, 1.0)
		var turn_rate = steer * turn_speed * speed_norm
		rotation += turn_rate * delta
		
		# 5. Inercia lateral (Drift antigravity)
		# Cuando el vehículo gira a velocidad, genera velocidad lateral proporcional al cambio de heading.
		velocity_lateral -= turn_rate * velocity_forward * 0.02

	var forward_dir = Vector2.RIGHT.rotated(rotation)
	var right_dir = Vector2.DOWN.rotated(rotation)
	
	# Fuerzas aplicadas (considerando modificadores de RL)
	var final_acceleration = max_acceleration * friction_modifier
	var final_fric_long = friction_longitudinal
	var final_fric_lat = friction_lateral * drift_impairment

	# 1. Propulsión
	if throttle > 0:
		velocity_forward += throttle * final_acceleration * delta
	
	if brake_input > 0:
		velocity_forward = move_toward(velocity_forward, 0.0, max_acceleration * 1.5 * brake_input * delta)

	# 2. Fricción longitudinal
	velocity_forward *= final_fric_long

	# 3. Fricción lateral (hover drift)
	# Si drift_input > 0, reducir fricción lateral para permitir derrape.
	var mod_fric_lat = final_fric_lat
	if drift_input > 0.0:
		# Reduce friction closer to 1.0 (less friction because it multiplies velocity reducing it less)
		# Wait, multiplier is 0.92 (92% retained). To slide more, multiplier should be closer to 1.0.
		mod_fric_lat = lerp(final_fric_lat, 0.99, drift_input)
		
	# 6. Estabilización
	# stabilize_input aumenta la fricción lateral y reduce drift.
	if stabilize_input > 0.0:
		# Increase friction (multiplier closer to 0.0 means it stops faster laterally)
		mod_fric_lat = lerp(mod_fric_lat, 0.80, stabilize_input)

	velocity_lateral *= mod_fric_lat

	# 7. Hover damping
	velocity_forward *= hover_damping
	velocity_lateral *= hover_damping
	
	# Clamp speed
	var current_speed = sqrt(velocity_forward**2 + velocity_lateral**2)
	if current_speed > max_speed:
		var scale_f = max_speed / current_speed
		velocity_forward *= scale_f
		velocity_lateral *= scale_f
	
	# Actualizar posición
	velocity = forward_dir * velocity_forward + right_dir * velocity_lateral
	move_and_slide()
	
	# Handle Collisions (Bounce & Push)
	for i in get_slide_collision_count():
		var col = get_slide_collision(i)
		var collider = col.get_collider()
		var n = col.get_normal()
		
		_collisions_this_frame += 1
		
		if collider is Vehicle:
			# Agent-to-agent: high elasticity (0.9) to "push" them
			velocity = velocity.bounce(n) * 0.9
			# Apply physical impulse to the other vehicle
			var push_force = (forward_dir * velocity_forward).length() * 0.3
			collider.apply_disturbance(-n * push_force)
		else:
			# Wall/Obstacle: low elasticity (0.5), triggers death in Race2D
			velocity = velocity.bounce(n) * 0.5
			_wall_collisions_this_frame += 1
			
		# Re-project to internal local velocities
		velocity_forward = velocity.dot(forward_dir)
		velocity_lateral = velocity.dot(right_dir)
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
	if is_dead or stun_timer > 0.0:
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
	self.drift_input = clamp(in_drift, 0.0, 1.0)
	self.stabilize_input = clamp(in_stabilize, 0.0, 1.0)

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
	var forward_dir = Vector2.RIGHT.rotated(rotation)
	var right_dir = Vector2.DOWN.rotated(rotation)
	velocity_forward += force_vector.dot(forward_dir)
	velocity_lateral += force_vector.dot(right_dir)


## Number of wall collisions detected this physics frame.
func get_collision_count_this_frame() -> int:
	return _collisions_this_frame

## Number of wall/track collisions detected this physics frame.
func get_wall_collision_count_this_frame() -> int:
	return _wall_collisions_this_frame

func die():
	is_dead = true
	throttle = 0.0
	brake_input = 1.0
	steer = 0.0
	
	if visual:
		visual.modulate = Color(0.3, 0.3, 0.3, 0.5) # Darker and transparent
	
	if particles:
		particles.emitting = false
		
	if heading_indicator:
		heading_indicator.visible = false
		
	if agent_ring:
		agent_ring.visible = false
		
	if event_overlay:
		event_overlay.visible = false
		
	# Disable collisions so other agents don't get stuck on corpses
	var coll_shape = get_node_or_null("CollisionShape2D")
	if coll_shape:
		coll_shape.set_deferred("disabled", true)
