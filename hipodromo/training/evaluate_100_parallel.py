"""
Parallel 100-Agent Evaluation
Runs 3 Godot windows simultaneously on different ports and seeds.
"""

import threading
import numpy as np
import time
import json
import os
from godot_env import GodotRaceEnv
from models.policy_network import RacerPolicy

def evaluate_seed(seed, port, weights_path, agents=100, max_time=60):
    print(f"[Thread-{port}] Starting evaluation for Seed {seed} on Port {port}...")
    
    # Init Policy
    policy = RacerPolicy()
    dummy = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy)
    
    if os.path.exists(weights_path):
        with open(weights_path, "r") as f:
            weights = np.array(json.load(f))
        policy.set_flat_weights(weights)
        print(f"[Thread-{port}] Weights loaded.")
    else:
        print(f"[Thread-{port}] Weights NOT found. Using random.")

    # Start Env
    try:
        env = GodotRaceEnv(headless=False, port=port)
    except Exception as e:
        print(f"[Thread-{port}] Failed to start Godot: {e}")
        return

    options = {"phase": 2, "num_agents": agents, "agent_type": "baseline"}
    agent_type = options.get("agent_type", "neural")
    obs, _ = env.reset(seed=seed, options=options)
    
    start_time = time.time()
    alive_mask = np.ones(agents, dtype=bool)
    
    # Run loop
    for step in range(max_time * 15):
        if agent_type == "neural" and np.any(alive_mask):
            actions = np.zeros((agents, 5), dtype=np.float32)
            alive_obs = obs[alive_mask]
            alive_actions = policy(alive_obs.astype(np.float32)).numpy()
            actions[alive_mask] = alive_actions
        else:
            # Baseline uses internal Godot logic, send empty action list
            actions = []
            
        obs, reward, terminated, truncated, info = env.step(actions)
        
        # Dead detection (stop if speed ~0 while throttling)
        if step > 10:
            for i in range(agents):
                if alive_mask[i] and obs[i][0] < 0.05 and actions[i][0] > 0.1:
                    alive_mask[i] = False
        
        if terminated or not np.any(alive_mask):
            print(f"[Thread-{port}] Seed {seed}: All agents dead.")
            break
            
        if time.time() - start_time > max_time:
            print(f"[Thread-{port}] Seed {seed}: Time limit reached.")
            break
            
        if step % 45 == 0:
            count = np.sum(alive_mask)
            print(f"[Thread-{port}] Seed {seed} | T: {time.time()-start_time:.1f}s | Alive: {count:3d}")

    print(f"[Thread-{port}] Seed {seed} Finished.")
    env.close()

def main():
    weights = "results/train_1h/best_weights.json"
    seeds = [42, 999, 1234]
    ports = [9093, 9094, 9095]
    num_agents = 5
    
    threads = []
    for s, p in zip(seeds, ports):
        t = threading.Thread(target=evaluate_seed, args=(s, p, weights, num_agents))
        t.start()
        threads.append(t)
        time.sleep(2) # Stagger starts to avoid disk IO bottleneck
        
    for t in threads:
        t.join()
        
    print("\nAll evaluations complete!")

if __name__ == "__main__":
    main()
