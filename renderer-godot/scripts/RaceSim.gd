extends Node2D

const AgentScene = preload("res://scenes/NeuralAgent.tscn")
@onready var ws_manager = $WebSocketManager
var agents = {}

func _ready():
	ws_manager.telemetry_received.connect(_on_telemetry_received)
	ws_manager.race_state_changed.connect(_on_race_state_changed)

func _on_telemetry_received(horse_list):
	for horse_data in horse_list:
		var h_id = horse_data.get("id", "")
		if not agents.has(h_id):
			_spawn_agent(h_id)
		
		agents[h_id].update_telemetry(horse_data)

func _spawn_agent(h_id):
	var new_agent = AgentScene.instantiate()
	new_agent.horse_id = h_id
	add_child(new_agent)
	agents[h_id] = new_agent
	print("Spawned Neural Agent: ", h_id)

func _on_race_state_changed(new_state):
	print("Race State: ", new_state)
	if new_state == "Lobby":
		_clear_agents()

func _clear_agents():
	for h_id in agents:
		agents[h_id].queue_free()
	agents.clear()
