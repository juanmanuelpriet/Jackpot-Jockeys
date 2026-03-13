import gymnasium as gym
from gymnasium import spaces
import socket
import json
import numpy as np
import subprocess
import time

class GodotRaceEnv(gym.Env):
    def __init__(self, godot_binary="godot", headless=True, port=9090):
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
        project_path = os.path.abspath("../") # The 'hipodromo' folder is in ../
        if not os.path.exists(os.path.join(project_path, "project.godot")):
            # Try current directory if not in ../ hipodromo
            project_path = os.path.abspath(".")
            
        cmd = [self.godot_binary, "--path", project_path]
        if self.headless:
            cmd.append("--headless")
        
        # Prepare environment with the port (more reliable than args)
        env = os.environ.copy()
        env["GODOT_BRIDGE_PORT"] = str(self.port)
        
        # Unique log file per port to avoid conflicts
        log_name = f"godot_{self.port}.log"
        print(f"[GodotEnv] Starting Godot on port {self.port} (env: {env['GODOT_BRIDGE_PORT']})")
        log_file = open(log_name, "w")
        self.proc = subprocess.Popen(cmd, stdout=log_file, stderr=log_file, env=env)
        
        # Wait for Godot to start and listen (be generous on Mac with multiple windows)
        time.sleep(15.0)
        
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(10.0)
            self.sock.connect(("127.0.0.1", self.port))
        except Exception as e:
            print(f"[GodotEnv] Failed to connect to Godot: {e}")
            if os.path.exists("godot_output.log"):
                with open("godot_output.log", "r") as f:
                    print("[GodotEnv] Godot output:\n" + f.read())
            raise e

    def reset(self, seed=None, options=None):
        if self.sock is None:
            self._start_godot()
            
        cmd = {
            "cmd": "reset",
            "seed": seed if seed is not None else 42,
            "phase": options.get("phase", 1) if options else 1,
            "agent_type": "neural"
        }
        
        if options and "num_agents" in options:
            cmd["num_agents"] = options["num_agents"]
            
        self._send(cmd)
        resp = self._receive()
        
        # Return all agents' observations as a batch
        obs = np.array(resp["obs"], dtype=np.float32)
        return obs, {}

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
        self._send(cmd)
        resp = self._receive()
        
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
