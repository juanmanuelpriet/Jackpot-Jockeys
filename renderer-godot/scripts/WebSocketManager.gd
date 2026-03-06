extends Node

var socket = WebSocketPeer.new()
var url = "ws://localhost:8000/ws"
var lobby_id = ""
var token = ""
var is_connected = false

signal telemetry_received(data)
signal race_state_changed(new_state)

func _ready():
	# In a real build, we'd get these from JavaScriptBridge
	# For dev, we can use hardcoded values or command line args
	_check_js_params()
	connect_to_server()

func _check_js_params():
	if OS.has_feature("web"):
		var js_url = JavaScriptBridge.eval("window.location.search")
		if js_url:
			# Parse query params manually or via simple regex
			# Example: ?token=...&lobby=...
			pass

func connect_to_server():
	var full_url = url
	if token != "":
		full_url += "?token=" + token
	
	print("Connecting to: ", full_url)
	var err = socket.connect_to_url(full_url)
	if err != OK:
		print("Connection failed!")
		set_process(false)

func _process(_delta):
	socket.poll()
	var state = socket.get_ready_state()
	
	if state == WebSocketPeer.STATE_OPEN:
		if not is_connected:
			print("WebSocket Connected!")
			is_connected = true
			# Request initial state
			_send_message({"type": "GET_STATE_SNAPSHOT"})
			
		while socket.get_available_packet_count() > 0:
			var packet = socket.get_packet()
			var data = JSON.parse_string(packet.get_string_from_utf8())
			if data:
				_handle_message(data)
				
	elif state == WebSocketPeer.STATE_CLOSED:
		if is_connected:
			print("WebSocket Closed!")
			is_connected = false
			# Try reconnecting after a delay
			await get_tree().create_timer(2.0).timeout
			connect_to_server()

func _send_message(data):
	var json_str = JSON.stringify(data)
	socket.send_text(json_str)

func _handle_message(data):
	var event = data.get("event_name", "")
	
	if event == "HORSE_TELEMETRY":
		emit_signal("telemetry_received", data.get("horses", []))
	elif event == "RACE_STATE_CHANGED":
		emit_signal("race_state_changed", data.get("new_state", ""))
	elif event == "STATE_SNAPSHOT":
		emit_signal("race_state_changed", data.get("current_state", ""))
