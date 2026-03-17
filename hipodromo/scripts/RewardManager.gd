extends Node
class_name RewardManager

@export var current_phase: int = 1

# Pesos Fase 1 (Aprendizaje de Conducción Básica)
var p1_w_progress: float = 25.0      # Muy alto para incentivar avance
var p1_w_off_track: float = -10.0
var p1_w_stuck: float = -50.0
var p1_w_collision: float = -15.0    # No tan alto para no paralizar
var p1_w_idle: float = 30.0          # Castigo por no moverse
var p1_idle_threshold: float = 40.0   # Velocidad mínima requerida

# Pesos Fase 2+ (Competencia y Refinamiento)
var p2_w_progress: float = 15.0
var p2_w_imitation: float = 0.5
var p2_w_collision: float = -40.0

func calculate_reward(data: Dictionary) -> float:
	if current_phase == 1:
		return _calculate_phase1(data)
	else:
		return _calculate_phase2(data)

func _calculate_phase1(d: Dictionary) -> float:
	# 1. Penalización base por tiempo (para incentivar terminar rápido)
	var r = -1.0 

	# 2. Recompensa por progreso neto (avance hacia la meta)
	var ds = d.get("delta_s", 0.0)
	
	if ds > 0:
		r += ds * 10.0 # Recompensa fuerte por avanzar (era 2.0)
	else:
		r += ds * 50.0 # Penalización MUY fuerte por retroceder (sentido contrario)

	# 3. Penalización por estar quieto o retroceder (Idle penalty)
	var speed = d.get("current_speed", 0.0)
	if speed < 60.0:
		r -= 30.0 # Castigo por ser lento (era 15.0)
	
	if ds < -0.05: # Movimiento sostenido hacia atrás
		r -= 100.0 # Castigo por "sentido contrario"

	# 4. Jackpot por llegar a la meta (completar vuelta)
	if d.get("lap_complete", false):
		r += 5000.0 # Gran premio por completar el circuito (era 1000.0)

	return r

func _calculate_phase2(d: Dictionary) -> float:
	# Implementación futura para Fase 2
	return _calculate_phase1(d) * 0.5 # Placeholder
