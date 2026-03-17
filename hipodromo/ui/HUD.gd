extends CanvasLayer
class_name HUD

@onready var info_label = $PanelContainer/VBoxContainer/InfoLabel
@onready var agents_label = $PanelContainer/VBoxContainer/AgentsLabel

func update_telemetry(config, step: int, agents: Array, brains: Array, last_rewards: Array, gen: int = 0):
	if not config.debug_hud:
		info_label.text = ""
		agents_label.text = ""
		return
	
	info_label.text = "AG-RACE RL ENV | GEN: %d\n" % gen
	var status = "ESPERANDO CEREBRO (PYTHON)..."
	if agents.size() > 0:
		status = "ENTRENANDO: %d AGENTES EN PISTA" % agents.size()
	
	# Monitoreo de Conexión
	var bridge = get_parent().python_bridge
	var conn_info = "[ SIN CONEXIÓN ]"
	var conn_color = "red"
	if bridge.is_client_connected():
		var dt = bridge.time_since_last_message()
		if dt < 0.2:
			conn_info = "[ CONECTADO | Latencia: %sms ]" % str(int(dt * 1000))
			conn_color = "lime"
		elif dt < 1.0:
			conn_info = "[ LENTO | Latencia: %sms ]" % str(int(dt * 1000))
			conn_color = "yellow"
		else:
			conn_info = "[ DESCONECTADO (Timeout: %s s) ]" % str(int(dt))
			conn_color = "orange"

	info_label.text += "LINK: [ %s ]\n" % conn_info
	info_label.text += "STATUS: [ %s ]\n" % status
	info_label.text += "Config: %s | Seed: %d | Phase: %d\n" % [config.config_hash, config.base_seed, config.curriculum_phase]
	info_label.text += "Step: %4d / %d | Inf FPS: %d | Act Repeat: %d\n" % [step, config.max_steps_per_episode, config.inference_fps, config.action_repeat]
	info_label.text += "Events: %s | Freq: %.2f | Sev: %.2f\n" % ["ON" if config.enable_events else "OFF", config.hazard_frequency, config.max_hazard_severity]
	info_label.text += "Zoom: Q/E/Scroll/Pinch | Pan: WASD/Arrows/Drag/Scroll\n"
	info_label.text += "\n--- CICLO DE ENTRENAMIENTO ---\n"
	info_label.text += "1. Python calcula cerebros (Pesos)\n"
	info_label.text += "2. Godot corre pistas (Semillas: %d)\n" % config.base_seed
	info_label.text += "3. Godot devuelve Recompensas (Fitness)\n"
	info_label.text += "4. Python evoluciona a la siguiente GEN\n"
	info_label.text += "------------------------------\n"
	
	var txt = ""
	for i in range(agents.size()):
		var v = agents[i]
		var b = brains[i]
		
		if is_instance_valid(v):
			var speed = v.velocity.length()
			var reward = last_rewards[i] if last_rewards.size() > i else 0.0
			
			var flags = ""
			if b.off_track_time > 0.0: flags += "[OFF] "
			if b.stuck_timer > 0.0: flags += "[STUCK] "
			if v.stun_timer > 0.0: flags += "[STUN] "
			if v.control_inverted: flags += "[INV] "
			if v.friction_modifier < 1.0: flags += "[GRIP] "
			if flags == "": flags = "OK"
			
			txt += "A%d  Spd:%4d  R:%+8.2f  Col:%d  %s\n" % [i, int(speed), reward, v.get_collision_count_this_frame(), flags]
			
	agents_label.text = txt
