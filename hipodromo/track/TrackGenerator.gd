extends Node2D

@export var track_width: float = 300.0
@export var num_points: int = 15
@export var min_radius: float = 1500.0
@export var max_radius: float = 3500.0


var path: Path2D
var visual_line: Line2D
var edge_line_inner: Line2D
var edge_line_outer: Line2D
var center_line: Line2D
var static_body: StaticBody2D
var col_inner: CollisionPolygon2D
var col_outer: CollisionPolygon2D
var meta_line: Line2D
var start_line: Line2D
var waypoints: Array = []
var active_seed: int = 0

func _init():
	path = Path2D.new()
	path.curve = Curve2D.new()
	add_child(path)
	
	# --- Track surface (base layer) ---
	visual_line = Line2D.new()
	visual_line.width = track_width
	visual_line.default_color = Color(0.55, 0.55, 0.55)
	visual_line.texture = preload("res://assets/sprites/track_texture_scifi.png")
	visual_line.texture_mode = Line2D.LINE_TEXTURE_TILE
	visual_line.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	visual_line.joint_mode = Line2D.LINE_JOINT_ROUND
	visual_line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	visual_line.end_cap_mode = Line2D.LINE_CAP_ROUND
	visual_line.closed = true
	visual_line.z_index = 0
	add_child(visual_line)
	
	# --- Edge lines (border glow) ---
	edge_line_inner = Line2D.new()
	edge_line_inner.width = 3.0
	edge_line_inner.default_color = Color(0.0, 0.85, 1.0, 0.55)
	edge_line_inner.joint_mode = Line2D.LINE_JOINT_ROUND
	edge_line_inner.begin_cap_mode = Line2D.LINE_CAP_ROUND
	edge_line_inner.end_cap_mode = Line2D.LINE_CAP_ROUND
	edge_line_inner.closed = true
	edge_line_inner.antialiased = true
	edge_line_inner.z_index = 1
	add_child(edge_line_inner)
	
	edge_line_outer = Line2D.new()
	edge_line_outer.width = 3.0
	edge_line_outer.default_color = Color(0.0, 0.85, 1.0, 0.55)
	edge_line_outer.joint_mode = Line2D.LINE_JOINT_ROUND
	edge_line_outer.begin_cap_mode = Line2D.LINE_CAP_ROUND
	edge_line_outer.end_cap_mode = Line2D.LINE_CAP_ROUND
	edge_line_outer.closed = true
	edge_line_outer.antialiased = true
	edge_line_outer.z_index = 1
	add_child(edge_line_outer)
	
	# --- Center line (dashed effect via alpha) ---
	center_line = Line2D.new()
	center_line.width = 1.0
	center_line.default_color = Color(1.0, 1.0, 1.0, 0.12)
	center_line.joint_mode = Line2D.LINE_JOINT_ROUND
	center_line.closed = true
	center_line.antialiased = true
	center_line.z_index = 1
	add_child(center_line)

	# --- Meta (Finish Line) ---
	meta_line = Line2D.new()
	meta_line.width = 15.0
	meta_line.default_color = Color(1.0, 1.0, 1.0, 0.8) # Blanco semitransparente
	meta_line.z_index = 2
	add_child(meta_line)
	
	# --- Salida (Start Line) ---
	start_line = Line2D.new()
	start_line.width = 25.0
	start_line.default_color = Color(0.1, 0.1, 0.1, 1.0) # Negro sólido
	start_line.z_index = 2
	add_child(start_line)

	# --- Collision walls ---
	static_body = StaticBody2D.new()
	static_body.collision_layer = 1
	add_child(static_body)
	
	col_inner = CollisionPolygon2D.new()
	col_inner.build_mode = CollisionPolygon2D.BUILD_SEGMENTS
	static_body.add_child(col_inner)
	
	col_outer = CollisionPolygon2D.new()
	col_outer.build_mode = CollisionPolygon2D.BUILD_SEGMENTS
	static_body.add_child(col_outer)

func generate_track(seed_val: int, config_track_width: float = -1.0):
	active_seed = seed_val
	seed(active_seed)
	if config_track_width > 0.0:
		track_width = config_track_width
		visual_line.width = track_width
	
	path.curve.clear_points()
	waypoints.clear()
	
	# Detectar subfase vía nombre de la seed o parámetro externo
	# Para simplificar, si seed_val < 100, usamos currículo
	if seed_val < 10:
		_generate_phase_1a_straight()
		return
	elif seed_val < 15:
		_generate_phase_1b_oval(1.0) # CCW (Anti-horario)
		return
	elif seed_val < 20:
		_generate_phase_1b_oval(-1.0) # CW (Horario)
		return
		
	var points = []
	for i in range(num_points):
		var angle = (float(i) / num_points) * TAU
		var dist = randf_range(min_radius, max_radius)
		var final_angle = angle + randf_range(-0.15, 0.15)
		
		var p = Vector2(cos(final_angle), sin(final_angle)) * dist
		points.append(p)
		
	for p in points:
		path.curve.add_point(p)
		
	if points.size() > 0:
		path.curve.add_point(points[0]) # close loop
		
	# Calculate smooth tangents
	var point_count = path.curve.get_point_count()
	for i in range(point_count):
		var prev_idx = i - 1
		if prev_idx < 0: prev_idx = point_count - 2
		var next_idx = i + 1
		if next_idx >= point_count: next_idx = 1
		
		var p_prev = path.curve.get_point_position(prev_idx)
		var p_next = path.curve.get_point_position(next_idx)
		
		var tangent = (p_next - p_prev) * 0.2
		path.curve.set_point_in(i, -tangent)
		path.curve.set_point_out(i, tangent)
		
	# Match the closing point tangents with the first point
	if point_count > 0:
		path.curve.set_point_in(point_count - 1, path.curve.get_point_in(0))
		path.curve.set_point_out(point_count - 1, path.curve.get_point_out(0))
		
	call_deferred("build_visuals")

func build_visuals():
	var baked = path.curve.get_baked_points()
	waypoints = Array(baked)
	
	# --- Track surface ---
	visual_line.points = baked
	
	# --- Edge lines and collision ---
	var inner_pts = PackedVector2Array()
	var outer_pts = PackedVector2Array()
	var p_count = baked.size()
	
	if p_count >= 2:
		var is_closed = center_line.closed
		for i in range(p_count if is_closed else p_count - 1):
			var p_curr = baked[i]
			var next_idx = (i + 1) % p_count
			var p_next = baked[next_idx]
			
			if p_curr.distance_squared_to(p_next) < 0.1: continue
				
			var dir = (p_next - p_curr).normalized()
			var normal = Vector2(-dir.y, dir.x)
			var collision_offset = (track_width / 2.0) - 15.0
			
			inner_pts.append(p_curr + normal * collision_offset)
			outer_pts.append(p_curr - normal * collision_offset)
			
			# Para pistas abiertas, añadir el último punto
			if not is_closed and i == p_count - 2:
				inner_pts.append(p_next + normal * collision_offset)
				outer_pts.append(p_next - normal * collision_offset)
	
	# Set collision polygons
	col_inner.polygon = inner_pts
	col_outer.polygon = outer_pts
	
	# Set edge lines (at visual track edge, slightly inside collision)
	var edge_offset = (track_width / 2.0) - 5.0
	var edge_inner_pts = PackedVector2Array()
	var edge_outer_pts = PackedVector2Array()
	
	if p_count >= 2:
		var is_closed = center_line.closed
		for i in range(p_count if is_closed else p_count - 1):
			var p_curr = baked[i]
			var next_idx = (i + 1) % p_count
			var p_next = baked[next_idx]
			
			if p_curr.distance_squared_to(p_next) < 0.1: continue
			
			var dir = (p_next - p_curr).normalized()
			var normal = Vector2(-dir.y, dir.x)
			
			edge_inner_pts.append(p_curr + normal * edge_offset)
			edge_outer_pts.append(p_curr - normal * edge_offset)
			
			if not is_closed and i == p_count - 2:
				edge_inner_pts.append(p_next + normal * edge_offset)
				edge_outer_pts.append(p_next - normal * edge_offset)
	
	edge_line_inner.points = edge_inner_pts
	edge_line_outer.points = edge_outer_pts
	
	# Center line: same as baked center path
	center_line.points = baked
	
	# --- Meta and Start Line Drawing ---
	if baked.size() > 1:
		var p0 = baked[0]
		var p1 = baked[1]
		var dir = (p1 - p0).normalized()
		var normal = Vector2(-dir.y, dir.x)
		var half_w = track_width / 2.0
		
		# Línea de SALIDA (Negra) en el punto exacto de inicio (p0)
		start_line.points = PackedVector2Array([
			p0 + normal * half_w,
			p0 - normal * half_w
		])
		
		# Línea de META (Blanca) un poco ANTES de completar el circuito (vuelta completa)
		var track_len = get_track_length()
		if track_len > 100.0:
			var p_finish = path.curve.sample_baked(track_len - 40.0)
			var dir_finish = (p0 - p_finish).normalized()
			var normal_finish = Vector2(-dir_finish.y, dir_finish.x)
			
			meta_line.points = PackedVector2Array([
				p_finish + normal_finish * half_w,
				p_finish - normal_finish * half_w
			])


func get_waypoints() -> Array:
	return waypoints

func get_start_transform() -> Transform2D:
	if waypoints.size() < 2: return Transform2D()
	var pos = waypoints[0]
	var dir = (waypoints[1] - waypoints[0]).normalized()
	return Transform2D(dir.angle(), pos)

# --- Métricas Espaciales Avanzadas para RL ---

func get_track_length() -> float:
	if is_instance_valid(path) and path.curve:
		return path.curve.get_baked_length()
	return 0.0

## Returns progress as a scalar in [0, 1] along the closed spline.
func get_progress_scalar(global_pos: Vector2) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var total = get_track_length()
	if total <= 0.0: return 0.0
	var local_pos = path.to_local(global_pos)
	var raw_offset = path.curve.get_closest_offset(local_pos)
	return clamp(raw_offset / total, 0.0, 1.0)

## Returns the raw baked offset in meters (for internal sampling).
func _get_raw_offset(global_pos: Vector2) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var local_pos = path.to_local(global_pos)
	return path.curve.get_closest_offset(local_pos)

func get_off_track_distance(global_pos: Vector2) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var local_pos = path.to_local(global_pos)
	var closest_pt = path.curve.get_closest_point(local_pos)
	var dist_to_center = local_pos.distance_to(closest_pt)
	var edge_dist = (track_width / 2.0) - 15.0
	return max(0.0, dist_to_center - edge_dist)

## Signed lateral distance from track center. Negative = left, Positive = right.
func get_lateral_distance(global_pos: Vector2) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var local_pos = path.to_local(global_pos)
	var raw_offset = path.curve.get_closest_offset(local_pos)
	var closest_pt = path.curve.sample_baked(raw_offset)
	var tangent = path.curve.sample_baked_with_rotation(raw_offset).x.normalized()
	var normal = Vector2(-tangent.y, tangent.x) # left-pointing normal
	var diff = local_pos - closest_pt
	return diff.dot(normal)

func get_ideal_heading(global_pos: Vector2) -> Vector2:
	if not is_instance_valid(path) or not path.curve: return Vector2.RIGHT
	var raw_offset = _get_raw_offset(global_pos)
	var tangent = path.curve.sample_baked_with_rotation(raw_offset).x.normalized()
	return path.to_global(tangent) - path.global_position

## Curvature at normalized progress s ∈ [0,1]. Returns radians/meter.
func get_local_curvature(s: float) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var total = get_track_length()
	if total <= 0.0: return 0.0
	var sample_dist = 20.0
	var offset = s * total
	var offset_next = fmod(offset + sample_dist, total)
	
	var t1 = path.curve.sample_baked_with_rotation(offset).x
	var t2 = path.curve.sample_baked_with_rotation(offset_next).x
	
	var angle_diff = t1.angle_to(t2)
	return angle_diff / sample_dist

## Deterministic hash of the generated track geometry for logging.
func get_track_hash() -> int:
	var h: int = 0
	for p in waypoints:
		h = hash(str(h) + str(snapped(p.x, 0.01)) + str(snapped(p.y, 0.01)))
	return h
func _generate_phase_1a_straight():
	var length = 5000.0
	track_width = 1200.0 # Mucho más ancha para Phase 1A
	visual_line.width = track_width
	path.curve.add_point(Vector2(0, 0))
	path.curve.add_point(Vector2(length, 0))
	# No es cerrado
	center_line.closed = false
	call_deferred("build_visuals")

func _generate_phase_1b_oval(dir_mult: float = 1.0):
	var radius = 800.0
	track_width = 600.0
	visual_line.width = track_width
	for i in range(8):
		var a = (float(i)/8.0) * -TAU * dir_mult
		path.curve.add_point(Vector2(cos(a), sin(a)) * radius)
	path.curve.add_point(path.curve.get_point_position(0))
	center_line.closed = true
	_smooth_tangents()
	call_deferred("build_visuals")

func _smooth_tangents():
	var point_count = path.curve.get_point_count()
	for i in range(point_count):
		var prev_idx = i - 1
		if prev_idx < 0: prev_idx = point_count - 2
		var next_idx = i + 1
		if next_idx >= point_count: next_idx = 1
		var p_prev = path.curve.get_point_position(prev_idx)
		var p_next = path.curve.get_point_position(next_idx)
		var tangent = (p_next - p_prev) * 0.2
		path.curve.set_point_in(i, -tangent)
		path.curve.set_point_out(i, tangent)
