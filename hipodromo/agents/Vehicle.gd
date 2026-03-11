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

@onready var visual = $Visual
@onready var particles = $EngineParticles

func _physics_process(delta):
	# Decrement stun timer
	if stun_timer > 0.0:
		stun_timer -= delta
		if stun_timer < 0.0:
			stun_timer = 0.0
	
	_collisions_this_frame = 0
	# Girar la nave dependiente de la velocidad a veces ayuda a sentirse bien, pero en hovercrafts se puede rotar sobre el propio eje.
	# Añadiremos rotación libre sobre el eje z.
	if abs(steer) > 0.01:
		# Optionally, make turn speed slightly dependent on current velocity to avoid completely stationary turns, but hovercrafts can do stationary turns
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
	
	# Aplicamos el agarre reduciendo la velocidad lateral
	lateral_velocity = lateral_velocity.move_toward(Vector2.ZERO, final_grip * lateral_velocity.length() * delta)
	
	# Aplicamos drag a la velocidad frontal
	forward_velocity = forward_velocity.move_toward(Vector2.ZERO, final_drag * forward_velocity.length() * delta)
	
	# Reconstruimos la velocidad
	velocity = forward_velocity + lateral_velocity
	
	# Clamp speed
	if velocity.length() > max_speed:
		velocity = velocity.limit_length(max_speed)
		
	if throttle > 0:
		particles.emitting = true
	else:
		particles.emitting = false
		
	move_and_slide()
	
	for i in get_slide_collision_count():
		var col = get_slide_collision(i)
		var n = col.get_normal()
		velocity = velocity.bounce(n) * 0.7
		_collisions_this_frame += 1
		break

# Funciones públicas para ser llamadas por un Controller o un AI Brain
func apply_inputs(in_throttle: float, in_brake: float, in_steer: float):
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

# Personalizar el color de la nave
func set_color(c: Color):
	if visual:
		visual.color = c

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

# Lógica pública para inyectar fuerzas externas (viento, choques forzados)
func apply_disturbance(force_vector: Vector2):
	velocity += force_vector

## Number of wall collisions detected this physics frame.
func get_collision_count_this_frame() -> int:
	return _collisions_this_frame
