extends Resource
class_name EnvironmentConfig

## Computed at runtime — do NOT set manually.
var config_hash: String = ""

@export var curriculum_phase: int = 1
@export var train_split: String = "train"
@export var base_seed: int = 42

# --- Timing ---
@export var max_steps_per_episode: int = 2000
@export var physics_fps: int = 60
@export var inference_fps: int = 15
## Derived: how many physics frames per inference tick.
var action_repeat: int:
	get: return max(1, physics_fps / inference_fps)

# --- Physics ---
@export var base_friction: float = 1.0
@export var track_width: float = 300.0

# --- Agents ---
@export var num_agents: int = 1
@export var agent_type: String = "baseline"  ## "baseline" | "neural"
@export var neural_weights_path: String = "" ## Path to weights JSON (empty = dummy policy)
@export var bridge_port: int = 9090
@export var headless_training: bool = false

# --- World Events ---
@export var enable_events: bool = false
@export var hazard_frequency: float = 0.0
@export var max_hazard_severity: float = 0.0

# --- Debug ---
@export var debug_logging: bool = true
@export var debug_hud: bool = true

func _init(seed_val: int = 42, phase: int = 1, split: String = "train"):
	base_seed = seed_val
	curriculum_phase = phase
	train_split = split
	setup_curriculum()
	_compute_hash()

func setup_curriculum():
	if curriculum_phase == 1:
		num_agents = 1
		enable_events = false
		hazard_frequency = 0.0
		max_hazard_severity = 0.0
	elif curriculum_phase == 2:
		num_agents = 2
		enable_events = true
		hazard_frequency = 0.2
		max_hazard_severity = 0.5
	else:
		num_agents = 4
		enable_events = true
		hazard_frequency = 0.8
		max_hazard_severity = 1.0
	_compute_hash()

func _compute_hash():
	var raw = "%d_%d_%d_%d_%d_%.2f_%.2f_%.1f_%s" % [
		base_seed, curriculum_phase, num_agents,
		physics_fps, inference_fps,
		hazard_frequency, max_hazard_severity, track_width,
		agent_type
	]
	config_hash = "AG-RACE-v1-%d" % hash(raw)


