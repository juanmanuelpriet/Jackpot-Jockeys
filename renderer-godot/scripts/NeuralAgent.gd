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

func _ready():
	rng.randomize()
	time_passed = rng.randf_range(0, 100)
	icon_label.text = icon_text
	
	# Initial random color for the node
	var base_hue = rng.randf()
	outer_glow.modulate = Color.from_hsv(base_hue, 0.8, 1.0, 0.2)
	
	# Configure particle gradient
	var grad = Gradient.new()
	grad.set_color(0, Color.from_hsv(base_hue, 0.6, 1.0, 1.0))
	grad.set_color(1, Color.from_hsv(base_hue, 0.4, 1.0, 0.0))
	synapse_trail.color_ramp = grad

func _process(delta):
	time_passed += delta
	
	# Subtle floating animation
	var float_y = sin(time_passed * 4.0) * 5.0
	var float_x = cos(time_passed * 2.0) * 2.0
	icon_label.position = Vector2(-20 + float_x, -25 + float_y)
	outer_glow.position = Vector2(-30 + float_x, -30 + float_y)
	
	# Update vertical position based on lane
	# 720px height, lanes mapped to the center area
	var target_y = lane * 85 + 60
	position.y = lerp(position.y, float(target_y), 0.1)

func update_telemetry(data: Dictionary):
	# data: { rank: int, progress_permil: int, vel_mmps: int, active_mods: array }
	var target_x = (data.get("progress_permil", 0) / 1000.0) * 1200.0
	position.x = lerp(position.x, target_x, 0.2) # Smooth x movement
	
	if data.has("lane"):
		lane = data.lane
	
	# Detect power-ups activation for visual burst
	var mods = data.get("active_mods", [])
	if mods.size() > 0:
		if not power_burst.emitting:
			power_burst.emitting = true
			# Visual pulse
			var tw = create_tween()
			tw.tween_property(outer_glow, "modulate:a", 0.6, 0.1)
			tw.tween_property(outer_glow, "modulate:a", 0.2, 0.4)
