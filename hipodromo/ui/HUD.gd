extends CanvasLayer
class_name HUD

@onready var info_label = $MarginContainer/VBoxContainer/InfoLabel
@onready var agents_label = $MarginContainer/VBoxContainer/AgentsLabel

func update_telemetry(config, step: int, agents: Array, brains: Array, last_rewards: Array):
	info_label.text = "AG-RACE TRAINING ENV\n"
	info_label.text += "Hash: %s | Seed: %d | Phase: %d\n" % [config.config_hash, config.base_seed, config.curriculum_phase]
	info_label.text += "Step: %d / %d\n" % [step, config.max_steps_per_episode]
	info_label.text += "Hazards Freq: %.2f | Sev: %.2f\n" % [config.hazard_frequency, config.max_hazard_severity]
	
	var txt = ""
	for i in range(agents.size()):
		var v = agents[i]
		var b = brains[i]
		
		if is_instance_valid(v):
			var speed = v.velocity.length()
			var reward = last_rewards[i] if last_rewards.size() > i else 0.0
			
			var state = ""
			if b.off_track_time > 0.0: state += "[OFF-TRACK] "
			if b.stuck_timer > 0.0: state += "[STUCK] "
			if v.stun_timer > 0.0: state += "[STUN] "
			if v.control_inverted: state += "[INV_CTRL] "
			if v.friction_modifier < 1.0: state += "[LOW_GRIP] "
			if state == "": state = "OK "
			
			txt += "Agent %d | Spd: %4d | Rwd: %+5.2f | %s\n" % [i+1, int(speed), reward, state]
			
	agents_label.text = txt
