extends Node2D

var horse_id = ""
var target_progress = 0.0
var current_progress = 0.0
var speed = 0.0

@onready var sprite = $Icon
@onready var trail = $SynapseTrail
@onready var pulse = $PulseAnimation

func _process(delta):
	# Smoothly interpolate to target position
	current_progress = lerp(current_progress, target_progress, 0.1)
	
	# Update position on screen
	# We map 0-1000 progress to screen coordinates (e.g., 50 to 1200)
	position.x = 50 + (current_progress / 1000.0) * 1150
	
	# Rotate nodes slightly for "organic" feel
	rotation += delta * 0.5 * (1.0 + speed / 5000.0)

func update_telemetry(data: Dictionary):
	target_progress = data.get("progress_permil", 0.0)
	speed = data.get("vel_mmps", 0.0)
	var lane = data.get("lane", 1)
	
	# Vertical position based on lane
	var target_y = 100 + lane * 100
	position.y = lerp(position.y, target_y, 0.2)
