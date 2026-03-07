extends Resource
class_name EnvironmentConfig

@export var config_hash: String = "v1.0.0-AG-RACE"
@export var curriculum_phase: int = 1 # 1: sin rivales, 2: 1 rival, 3: múltiples agentes + caos
@export var train_split: String = "train" # train, val, test
@export var base_seed: int = 42

@export var max_steps_per_episode: int = 2000
@export var physics_fps: int = 60
@export var inference_fps: int = 15

@export var num_agents: int = 1
@export var hazard_frequency: float = 0.0
@export var max_hazard_severity: float = 0.0

func _init(seed_val: int = 42, phase: int = 1, split: String = "train"):
	base_seed = seed_val
	curriculum_phase = phase
	train_split = split
	
	setup_curriculum()

func setup_curriculum():
	if curriculum_phase == 1:
		num_agents = 1
		hazard_frequency = 0.0
		max_hazard_severity = 0.0
	elif curriculum_phase == 2:
		num_agents = 2
		hazard_frequency = 0.2
		max_hazard_severity = 0.5
	else:
		num_agents = 4
		hazard_frequency = 0.8
		max_hazard_severity = 1.0
