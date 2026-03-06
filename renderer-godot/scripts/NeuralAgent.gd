extends Node2D

var horse_id = ""
var lane = 1
var icon_text = "🧠"
var time_passed = 0.0
var rng = RandomNumberGenerator.new()

@onready var icon_label = $Icon
@onready var synapse_trail = $SynapseTrail
@onready var power_burst = $PowerBurst
@onready var outer_glow = $GlowSprite

var perception_line: Line2D
var current_hazard_dist = 999_999
var base_color: Color

func _ready():
	rng.randomize()
	time_passed = rng.randf_range(0, 100)
	icon_label.text = icon_text
	
	# Initial random color for the node
	var base_hue = rng.randf()
	base_color = Color.from_hsv(base_hue, 0.8, 1.0, 1.0)
	outer_glow.modulate = Color(base_color.r, base_color.g, base_color.b, 0.2)
	
	# Configure particle gradient
	var grad = Gradient.new()
	grad.set_color(0, Color(base_color.r, base_color.g, base_color.b, 1.0))
	grad.set_color(1, Color(base_color.r, base_color.g, base_color.b, 0.0))
	synapse_trail.color_ramp = grad

	# Create perception ray line
	perception_line = Line2D.new()
	perception_line.width = 2.0
	perception_line.default_color = Color(0, 1, 1, 0.4)
	perception_line.add_point(Vector2(0, 0))
	perception_line.add_point(Vector2(0, 0))
	add_child(perception_line)

func _process(delta):
	time_passed += delta
	
	# Subtle floating animation
	var float_y = sin(time_passed * 4.0) * 5.0
	var float_x = cos(time_passed * 2.0) * 2.0
	icon_label.position = Vector2(-20 + float_x, -25 + float_y)
	outer_glow.position = Vector2(-30 + float_x, -30 + float_y)
	
	# Update vertical position based on lane
	var target_y = lane * 85 + 60
	position.y = lerp(position.y, float(target_y), 0.1)

	# Update perception ray visualization
	if current_hazard_dist < 300_000:
		# Map 300,000 unit distance to screen pixels (scaled)
		var visual_dist = (current_hazard_dist / 1000.0) * 2.0 
		perception_line.set_point_position(1, Vector2(visual_dist, 0))
		perception_line.visible = true
		
		# Pulsing intensity based on distance
		var pulse = (sin(time_passed * 10.0) + 1.0) * 0.5
		perception_line.default_color.a = 0.2 + pulse * 0.4
	else:
		perception_line.visible = false

func update_telemetry(data: Dictionary):
	# data: { rank: int, progress_permil: int, vel_mmps: int, active_mods: array, neural_perception: dict }
	var target_x = (data.get("progress_permil", 0) / 1000.0) * 1200.0
	position.x = lerp(position.x, target_x, 0.2) 
	
	if data.has("lane"):
		lane = data.lane
	
	# Neural Perception Data
	var np = data.get("neural_perception", {})
	current_hazard_dist = np.get("hazard_dist", 999_999)
	
	# Visual state based on perception
	if np.get("stamina_low", false):
		outer_glow.modulate = Color(1, 0.2, 0.2, 0.3) # Warning Red
	elif current_hazard_dist < 100_000:
		outer_glow.modulate = Color(1, 1, 0, 0.4) # Evasion Yellow
	else:
		outer_glow.modulate = Color(base_color.r, base_color.g, base_color.b, 0.2)

	# Detect power-ups activation for visual burst
	var mods = data.get("active_mods", [])
	if mods.size() > 0:
		if not power_burst.emitting:
			power_burst.emitting = true
			var tw = create_tween()
			tw.tween_property(outer_glow, "modulate:a", 0.6, 0.1)
			tw.tween_property(outer_glow, "modulate:a", 0.2, 0.4)
