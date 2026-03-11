extends Node
class_name RewardManager

# Pesos configurables de Recompensas y Penalizaciones
@export var w_progress: float = 1.0
@export var w_off_track: float = -0.5
@export var w_stuck: float = -1.0
@export var w_collision: float = -0.5
@export var w_lap_complete: float = 10.0
@export var w_erratic_steer: float = -0.05
@export var survival_bonus: float = 0.01

# Calcula la recompensa para un agente en el tick de inferencia actual
func calculate_reward(s_delta: float, off_track_dist: float, is_stuck: bool, collisions: int, lap_complete: bool, steer_change: float = 0.0) -> float:
	var r = survival_bonus
	
	# Avance Positivo a lo largo de la spline de la pista
	if s_delta > 0:
		r += s_delta * w_progress
	else:
		r += s_delta * (w_progress * 1.5) # Penaliza más fuerte ir en reversa
		
	# Penalización Off-Track dependiente de distancia
	if off_track_dist > 0.0:
		r += w_off_track * (1.0 + off_track_dist * 0.05)
		
	# Penalización Stuck
	if is_stuck:
		r += w_stuck
		
	# Colisiones
	if collisions > 0:
		r += collisions * w_collision
		
	# Conducción Errática / Zig-zag (diferencia brusca inter-frame del steer si se dispone)
	if abs(steer_change) > 0.1:
		r += w_erratic_steer * abs(steer_change)
		
	# Vuelta Completa / Checkpoint Mayor
	if lap_complete:
		r += w_lap_complete
		
	return r
