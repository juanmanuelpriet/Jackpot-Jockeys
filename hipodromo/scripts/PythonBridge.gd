extends Node
class_name PythonBridge

signal command_received(cmd_dict: Dictionary)

var server: TCPServer
var peer: StreamPeerTCP
var port: int = 9090

func is_client_connected() -> bool:
	return peer != null and peer.get_status() == StreamPeerTCP.STATUS_CONNECTED

func _ready():
	# 1. Try environment variable (most reliable for parallel runs)
	var env_port = OS.get_environment("GODOT_BRIDGE_PORT")
	if env_port != "":
		port = env_port.to_int()
	else:
		# 2. Try cmdline args
		var all_args = OS.get_cmdline_args()
		all_args.append_array(OS.get_cmdline_user_args())
		for i in range(all_args.size()):
			var arg = all_args[i]
			if arg == "--port" and i + 1 < all_args.size():
				port = all_args[i+1].to_int()
			elif arg.begins_with("--port="):
				port = arg.split("=")[1].to_int()
			
	server = TCPServer.new()
	var err = server.listen(port)
	if err != OK:
		push_error("[PythonBridge] Could not listen on port %d" % port)
	else:
		print("[PythonBridge] Listening on port %d" % port)

func _process(_delta):
	if peer:
		if peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			_check_for_messages()
		elif peer.get_status() == StreamPeerTCP.STATUS_ERROR or peer.get_status() == StreamPeerTCP.STATUS_NONE:
			print("[PythonBridge] Client disconnected")
			peer = null
	elif server.is_connection_available():
		peer = server.take_connection()
		print("[PythonBridge] Client connected from %s" % peer.get_connected_host())

var _buffer: String = ""

func _check_for_messages():
	var available = peer.get_available_bytes()
	if available > 0:
		var data = peer.get_utf8_string(available)
		print("[PythonBridge] RECV: ", data.substr(0, 50))
		_buffer += data
		
		# Process all complete messages delimited by newline
		while true:
			var newline_idx = _buffer.find("\n")
			if newline_idx == -1:
				break
			
			var msg = _buffer.substr(0, newline_idx).strip_edges()
			_buffer = _buffer.substr(newline_idx + 1)
			
			if msg == "": continue
			
			var json = JSON.new()
			var err = json.parse(msg)
			if err == OK:
				command_received.emit(json.data)
			else:
				push_error("[PythonBridge] JSON parse error: %s" % msg)

func send_response(data: Dictionary):
	if peer and peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		var json_str = JSON.stringify(data) + "\n"
		peer.put_data(json_str.to_utf8_buffer())
