extends Node2D

@export var track_width: float = 300.0
@export var num_points: int = 15
@export var min_radius: float = 1500.0
@export var max_radius: float = 3500.0

var path: Path2D
var visual_line: Line2D
var static_body: StaticBody2D
var col_inner: CollisionPolygon2D
var col_outer: CollisionPolygon2D
var waypoints: Array = []
var active_seed: int = 0

func _init():
	path = Path2D.new()
	path.curve = Curve2D.new()
	add_child(path)
	
	visual_line = Line2D.new()
	visual_line.width = track_width
	visual_line.default_color = Color(1.0, 1.0, 1.0)
	visual_line.texture = preload("res://assets/sprites/track_texture_scifi.png")
	visual_line.texture_mode = Line2D.LINE_TEXTURE_TILE
	visual_line.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	visual_line.joint_mode = Line2D.LINE_JOINT_ROUND
	visual_line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	visual_line.end_cap_mode = Line2D.LINE_CAP_ROUND
	visual_line.closed = true
	add_child(visual_line)

	static_body = StaticBody2D.new()
	static_body.collision_layer = 1
	add_child(static_body)
	
	col_inner = CollisionPolygon2D.new()
	col_inner.build_mode = CollisionPolygon2D.BUILD_SEGMENTS
	static_body.add_child(col_inner)
	
	col_outer = CollisionPolygon2D.new()
	col_outer.build_mode = CollisionPolygon2D.BUILD_SEGMENTS
	static_body.add_child(col_outer)

func generate_track(seed_val: int):
	active_seed = seed_val
	seed(active_seed)
	
	path.curve.clear_points()
	waypoints.clear()
	
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
	
	visual_line.points = baked
	
	var inner_pts = PackedVector2Array()
	var outer_pts = PackedVector2Array()
	var p_count = baked.size()
	
	if p_count > 2:
		for i in range(p_count):
			var p_curr = baked[i]
			var next_idx = (i + 1) % p_count
			var p_next = baked[next_idx]
			
			if p_curr.distance_squared_to(p_next) < 1.0:
				next_idx = (next_idx + 1) % p_count
				p_next = baked[next_idx]
				
			var dir = (p_next - p_curr).normalized()
			var normal = Vector2(-dir.y, dir.x)
			
			# Usamos un ancho ligeramente menor al visual para que reboten dentro de la pista
			var offset = (track_width / 2.0) - 15.0
			inner_pts.append(p_curr + normal * offset)
			outer_pts.append(p_curr - normal * offset)
			
	col_inner.polygon = inner_pts
	col_outer.polygon = outer_pts


func get_waypoints() -> Array:
	return waypoints

func get_start_transform() -> Transform2D:
	if waypoints.size() < 2: return Transform2D()
	var pos = waypoints[0]
	var dir = (waypoints[1] - waypoints[0]).normalized()
	return Transform2D(dir.angle(), pos)

# --- Métricas Espaciales para RL ---

# Devuelve la longitud total de la pista
func get_track_length() -> float:
	if is_instance_valid(path) and path.curve:
		return path.curve.get_baked_length()
	return 0.0

# Devuelve el progreso 's' en metros a lo largo de la spline central
func get_progress_scalar(global_pos: Vector2) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var local_pos = path.to_local(global_pos)
	return path.curve.get_closest_offset(local_pos)

# Devuelve qué tan fuera de los límites de la pista está un punto (0 si está dentro)
func get_off_track_distance(global_pos: Vector2) -> float:
	if not is_instance_valid(path) or not path.curve: return 0.0
	var local_pos = path.to_local(global_pos)
	var closest_pt = path.curve.get_closest_point(local_pos)
	var dist_to_center = local_pos.distance_to(closest_pt)
	
	# track_width es el ancho total, el borde visual está en track_width / 2.0
	# Usamos un margen interno de -15.0 igual que la colisión
	var edge_dist = (track_width / 2.0) - 15.0
	var off_track = dist_to_center - edge_dist
	
	return max(0.0, off_track)
