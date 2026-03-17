import socket
import time
import subprocess
import os

print("--- TEST CONEXION ---")
PORT = 9090

# 1. Kill everything
os.system("lsof -ti:9090 | xargs kill -9 || true")
os.system("pkill -9 Godot || true")

# 2. Start Godot
cmd = ["/Applications/Godot.app/Contents/MacOS/Godot", "--path", "../", "--windowed", "--resolution", "640x360"]
env = os.environ.copy()
env["GODOT_BRIDGE_PORT"] = str(PORT)
print("Arrancando Godot...")
proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)

# 3. Try to connect
for i in range(20):
    time.sleep(1)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        s.connect(("127.0.0.1", PORT))
        print(f"CONECTADO en intento {i+1}!")
        s.close()
        break
    except Exception as e:
        print(f"Intento {i+1} fallido: {e}")

proc.terminate()
print("Test finalizado.")
