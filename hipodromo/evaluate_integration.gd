extends SceneTree

func _init():
	print("--- INICIANDO INTEGRATION TEST ---")
	var root = get_root()
	var race = preload("res://scenes/Race2D.tscn").instantiate()
	root.add_child(race)
	
	var config = EnvironmentConfig.new(1234, 2, "test")
	config.max_steps_per_episode = 150 # Prueba corta
	
	var obs = race.reset_environment(config)
	print("Initial Obs Size: ", obs.size(), " | Dim: ", obs[0].size())
	
	var steps = 0
	var done = false
	while not done and steps < 200:
		# Dummy step simulación de FPS
		race._physics_process(1.0/15.0)
		done = race.current_step >= config.max_steps_per_episode
		steps += 1
		if steps % 50 == 0:
			print("Step ", steps, " reached.")
			
	print("--- TEST FINALIZADO CON ÉXITO ---")
	quit()
