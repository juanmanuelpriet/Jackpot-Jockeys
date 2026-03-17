from godot_env import GodotRaceEnv
import time

print("TEST ENV RESET")
env = GodotRaceEnv(headless=False, port=9090)
print("Calling reset...")
obs, _ = env.reset(seed=42, options={"num_agents": 6})
print("Reset Done!")
print("Obs shape:", obs.shape)
env.close()
