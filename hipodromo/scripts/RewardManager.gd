extends Node
class_name RewardManager

# Configurable reward weights (can be tuned per curriculum phase via set_weights)
@export var w_progress: float = 1.0
@export var w_reverse: float = 1.5       ## Multiplier on w_progress when going backward
@export var w_off_track: float = -0.5
@export var w_stuck: float = -1.0
@export var w_collision: float = -0.5
@export var w_lap_complete: float = 10.0
@export var w_erratic_steer: float = -0.05
@export var w_zigzag_no_progress: float = -0.2  ## Extra penalty for zigzag without forward movement
@export var survival_bonus: float = 0.01

## Calculate reward for one agent at one inference tick.
## delta_s: meters advanced along track center this tick (can be negative).
## off_track_dist: 0 if on track, positive meters beyond edge.
## is_stuck: true if agent velocity is near zero despite throttle.
## collisions: number of wall collisions this tick.
## lap_complete: true if agent crossed the lap boundary.
## steer_change: absolute change in steer input since last tick.
## delta_s_raw_positive: true if delta_s > 0 (used for zigzag detection).
func calculate_reward(
	delta_s: float,
	off_track_dist: float,
	is_stuck: bool,
	collisions: int,
	lap_complete: bool,
	steer_change: float = 0.0
) -> float:
	var r = survival_bonus
	
	# Forward progress (positive) / reverse penalty (heavier)
	if delta_s > 0:
		r += delta_s * w_progress
	else:
		r += delta_s * (w_progress * w_reverse)
		
	# Off-track distance-dependent penalty
	if off_track_dist > 0.0:
		r += w_off_track * (1.0 + off_track_dist * 0.05)
		
	# Stuck penalty
	if is_stuck:
		r += w_stuck
		
	# Collision penalty (now using real counts)
	if collisions > 0:
		r += collisions * w_collision
		
	# Erratic steering penalty
	if abs(steer_change) > 0.1:
		r += w_erratic_steer * abs(steer_change)
		# Extra: zigzag without forward progress
		if delta_s <= 0.0:
			r += w_zigzag_no_progress
		
	# Lap completion bonus
	if lap_complete:
		r += w_lap_complete
		
	return r

## Override weights from a dictionary (e.g. for curriculum tuning).
func set_weights(weights: Dictionary):
	if weights.has("progress"): w_progress = weights["progress"]
	if weights.has("reverse"): w_reverse = weights["reverse"]
	if weights.has("off_track"): w_off_track = weights["off_track"]
	if weights.has("stuck"): w_stuck = weights["stuck"]
	if weights.has("collision"): w_collision = weights["collision"]
	if weights.has("lap_complete"): w_lap_complete = weights["lap_complete"]
	if weights.has("erratic_steer"): w_erratic_steer = weights["erratic_steer"]
	if weights.has("zigzag_no_progress"): w_zigzag_no_progress = weights["zigzag_no_progress"]
	if weights.has("survival"): survival_bonus = weights["survival"]

