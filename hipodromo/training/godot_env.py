import gymnasium as gym
from gymnasium import spaces
import socket
import json
import numpy as np
import subprocess
import time

class GodotRaceEnv(gym.Env):
    def __init__(self, godot_binary="/Applications/Godot.app/Contents/MacOS/Godot", headless=True, port=9090):
        super(GodotRaceEnv, self).__init__()
        self.godot_binary = godot_binary
        self.headless = headless
        self.port = port
        self.sock = None
        self.proc = None
        
        # Action space: [steer, throttle, brake, drift, stabilize]
        # steer is [-1, 1], others are [0, 1]
        self.action_space = spaces.Box(
            low=np.array([-1, 0, 0, 0, 0], dtype=np.float32),
            high=np.array([1, 1, 1, 1, 1], dtype=np.float32),
            dtype=np.float32
        )
        
        # Observation space: 59 dims
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(59,), dtype=np.float32
        )

    def _start_godot(self):
        import os
        import sys
        project_path = os.path.abspath("../") # The 'hipodromo' folder is in ../
        if not os.path.exists(os.path.join(project_path, "project.godot")):
            project_path = os.path.abspath(".")
            
        # En Mac, 'open' es más fiable para que la ventana aparezca al frente
        if sys.platform == "darwin" and not self.headless:
            cmd = ["open", "-a", self.godot_binary, "--args", "--path", project_path, "--windowed", "--resolution", "1280x720"]
            print(f"[GodotEnv] Lanzando Godot visualmente con 'open'...")
            subprocess.run(cmd)
        else:
            cmd = [self.godot_binary, "--path", project_path]
            if self.headless:
                cmd.append("--headless")
            else:
                cmd.extend(["--windowed", "--always-on-top", "--resolution", "1280x720"])
            
            # Prepare environment with the port (more reliable than args)
            env = os.environ.copy()
            env["GODOT_BRIDGE_PORT"] = str(self.port)
            
            # Unique log file per port to avoid conflicts
            log_name = f"godot_{self.port}.log"
            print(f"[GodotEnv] Starting Godot on port {self.port}")
            log_file = open(log_name, "w")
            self.proc = subprocess.Popen(cmd, stdout=log_file, stderr=log_file, env=env)
        
        # Esperar a que el servidor de Godot esté listo
        for i in range(15):
            time.sleep(1.0)
            try:
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.settimeout(5.0)
                self.sock.connect(("127.0.0.1", self.port))
                print(f"[GodotEnv] ¡Conectado con éxito!")
                return
            except:
                continue
        raise Exception("No se pudo conectar a Godot después de varios intentos.")

    def reset(self, seed=None, options=None):
        if self.sock is None:
            # 1. Intentar conectar a una instancia que el usuario ya tenga abierta
            try:
                print(f"[GodotEnv] Buscando instancia de Godot en puerto {self.port}...")
                self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.sock.settimeout(10.0)  # Timeout generoso para x16
                self.sock.connect(("127.0.0.1", self.port))
                print(f"[GodotEnv] ¡Instancia encontrada!")
            except:
                # 2. Si no hay nada, lanzar una nueva
                print(f"[GodotEnv] No se encontró instancia. Lanzando una nueva...")
                self.sock = None
                self._start_godot()
            
        cmd = {
            "cmd": "reset",
            "seed": seed if seed is not None else 42,
            "phase": options.get("phase", 1) if options else 1,
            "agent_type": "neural"
        }
        
        if options and "num_agents" in options:
            cmd["num_agents"] = options["num_agents"]
        if options and "gen" in options:
            cmd["gen"] = options["gen"]
            
        for attempt in range(3):
            try:
                self._send(cmd)
                resp = self._receive()
                
                obs = np.array(resp["obs"], dtype=np.float32)
                return obs, {}
            except socket.timeout:
                print(f"⚠️ Timeout en reset (intento {attempt+1}/3). Reintentando...")
                time.sleep(2.0)
        
        raise socket.timeout("Godot no respondió al reset tras 3 intentos.")

    def step(self, actions):
        # Format actions as a list of lists (one per agent)
        if hasattr(actions, "tolist"):
            if actions.ndim == 1:
                actions_to_send = [actions.tolist()]
            else:
                actions_to_send = actions.tolist()
        else:
            actions_to_send = actions
            
        cmd = {
            "cmd": "step",
            "actions": actions_to_send
        }
        start_t = time.time()
        self._send(cmd)
        resp = self._receive()
        latency = time.time() - start_t
        if latency > 2.0:
            print(f"⚠️ Latencia alta en step: {latency:.2f}s")
        
        obs = np.array(resp["obs"], dtype=np.float32)
        # Avg reward across all agents for simplicity, or return list
        reward = np.mean(resp["rewards"])
        terminated = resp["terminated"]
        truncated = resp["truncated"]
        # Info contains sum of collisions, etc.
        agent_infos = resp["info"]["agent_infos"]
        
        info = {
            "step": resp["info"]["step"],
            "progress": np.mean([i.get("progress", 0) for i in agent_infos]),
            "collisions": np.sum([i.get("collisions", 0) for i in agent_infos]),
            "off_track_dist": np.mean([i.get("off_track_dist", 0) for i in agent_infos]),
            "stuck_timer": np.max([i.get("stuck_timer", 0) for i in agent_infos]),
            "raw_rewards": resp["rewards"], # Added raw rewards for filtering
            "agent_collisions": np.sum([i.get("agent_collisions", 0) for i in agent_infos]),
        }
        
        return obs, reward, terminated, truncated, info

    def close(self):
        if self.sock:
            try:
                self._send({"cmd": "close"})
            except:
                pass
            self.sock.close()
            self.sock = None
        if self.proc:
            self.proc.terminate()
            self.proc = None

    def _send(self, data):
        msg = json.dumps(data) + "\n"
        self.sock.sendall(msg.encode("utf-8"))

    def _receive(self):
        data = b""
        while True:
            chunk = self.sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"\n" in data:
                break
        return json.loads(data.decode("utf-8"))

if __name__ == "__main__":
    # Test script
    env = GodotRaceEnv()
    obs, _ = env.reset(seed=42)
    print(f"Connected! Initial obs shape: {obs.shape}")
    
    for i in range(10):
        action = env.action_space.sample()
        obs, reward, term, trunc, info = env.step(action)
        print(f"Step {i}: Reward={reward:.4f}, Speed={obs[0]:.4f}")
        if term or trunc:
            break
            
    env.close()
    print("Test finished.")
