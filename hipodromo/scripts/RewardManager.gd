extends Node
class_name RewardManager

# Pesos de las Recompensas/Penalizaciones
@export var w_progress: float = 1.0
@export var w_off_track: float = -0.5
@export var w_stuck: float = -1.0
@export var w_collision: float = -0.2
@export var w_checkpoint: float = 5.0
@export var survival_bonus: float = 0.01

# Calcula la recompensa para un agente en el tick actual
func calculate_reward(s_delta: float, is_off_track: bool, is_stuck: bool, collisions: int, checkpoint_reached: bool) -> float:
	var r = survival_bonus
	
	# Progreso a lo largo de la spline de la pista
	if s_delta > 0:
		r += s_delta * w_progress
	else:
		r += s_delta * (w_progress * 0.5) # Penaliza un poco el ir en reversa
		
	if is_off_track:
		r += w_off_track
		
	if is_stuck:
		r += w_stuck
		
	if collisions > 0:
		r += collisions * w_collision
		
	if checkpoint_reached:
		r += w_checkpoint
		
	return r
