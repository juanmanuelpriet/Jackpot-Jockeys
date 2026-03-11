extends Resource
class_name EnvironmentConfig

@export var config_hash: String = "v1.0.0-AG-RACE"
@export var curriculum_phase: int = 1
@export var train_split: String = "train"
@export var base_seed: int = 42

@export var max_steps_per_episode: int = 2000
@export var physics_fps: int = 60
@export var inference_fps: int = 15
@export var action_repeat: int = 4 # (physics_fps / inference_fps) esperado

# Parámetros físicos configurables desde fuera
@export var base_friction: float = 1.0
@export var track_width: float = 300.0

@export var num_agents: int = 1
@export var hazard_frequency: float = 0.0
@export var max_hazard_severity: float = 0.0

@export var enable_events: bool = false

func _init(seed_val: int = 42, phase: int = 1, split: String = "train"):
	base_seed = seed_val
	curriculum_phase = phase
	train_split = split
	
	setup_curriculum()

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

