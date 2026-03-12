extends CanvasLayer
class_name HUD

@onready var info_label = $PanelContainer/VBoxContainer/InfoLabel
@onready var agents_label = $PanelContainer/VBoxContainer/AgentsLabel

func update_telemetry(config, step: int, agents: Array, brains: Array, last_rewards: Array):
	if not config.debug_hud:
		info_label.text = ""
		agents_label.text = ""
		return
	
	info_label.text = "AG-RACE RL ENV\n"
	info_label.text += "Config: %s | Seed: %d | Phase: %d\n" % [config.config_hash, config.base_seed, config.curriculum_phase]
	info_label.text += "Step: %4d / %d | Inf FPS: %d | Act Repeat: %d\n" % [step, config.max_steps_per_episode, config.inference_fps, config.action_repeat]
	info_label.text += "Events: %s | Freq: %.2f | Sev: %.2f\n" % ["ON" if config.enable_events else "OFF", config.hazard_frequency, config.max_hazard_severity]
	info_label.text += "Zoom: Q/E/Scroll/Trackpad | Pan: WASD/Arrows/Drag\n"
	
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
