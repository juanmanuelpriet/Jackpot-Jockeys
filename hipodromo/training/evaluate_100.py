"""
100-Agent Deathmatch Evaluation
Loads the best trained weights and spawns 100 agents in a non-headless environment.
Agents die (stop moving) upon their first collision. Runs over 3 different seeds.
"""

import numpy as np
import time
import json
import os
import argparse
from godot_env import GodotRaceEnv
from models.policy_network import RacerPolicy

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=str, default="results/train_1h/best_weights.json", help="Path to best weights")
    parser.add_argument("--seeds", type=int, default=3, help="Number of seeds to test")
    parser.add_argument("--agents", type=int, default=100, help="Number of agents to spawn")
    parser.add_argument("--time", type=int, default=60, help="Max time per seed (seconds)")
    args = parser.parse_args()
    
    # 1. Load Policy
    policy = RacerPolicy()
    dummy = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy)
    
    if os.path.exists(args.weights):
        with open(args.weights, "r") as f:
            weights = np.array(json.load(f))
        policy.set_flat_weights(weights)
        print(f"Loaded weights from {args.weights}")
    else:
        print(f"Warning: {args.weights} not found. Running with random weights.")
        
    # 2. Init Environment (Headless=False means we will see the UI window!)
    env = GodotRaceEnv(headless=False)
    
    # Seeds to evaluate against
    base_seeds = [42, 999, 1234, 5555, 7777][:args.seeds]
    
    for run, seed in enumerate(base_seeds):
        print(f"\n=======================================================")
        print(f" Race {run+1}/{args.seeds} | SEED: {seed} | AGENTS: {args.agents} ")
        print(f"=======================================================")
        
        # Reset requests num_agents
        obs, _ = env.reset(seed=seed, options={"phase": 2, "num_agents": args.agents})
        
        alive_mask = np.ones(args.agents, dtype=bool)
        start_time = time.time()
        
        # Max loop iterations (assuming inference is ~15Hz)
        max_steps = args.time * 15
        
        for step in range(max_steps):
            # Only infer for alive agents to save time, zero out dead ones
            actions = np.zeros((args.agents, 5), dtype=np.float32)
            
            if np.any(alive_mask):
                # We can batch infer all alive agents at once
                alive_obs = obs[alive_mask]
                alive_actions = policy(alive_obs.astype(np.float32)).numpy()
                actions[alive_mask] = alive_actions
                
            # Send to Godot
            obs, reward, terminated, truncated, info = env.step(actions)
            
            # Update alive mask from Godot state
            # Godot's obs[i][0] is forward speed. We also check if info gives collisions.
            # But since agents stop entirely when dead, speed ~ 0 is a good proxy after frame 10.
            if step > 10:
                for i in range(args.agents):
                    if alive_mask[i] and obs[i][0] < 0.01 and actions[i][0] > 0.1:
                        # Agent is trying to throttle but speed is zero -> stopped/dead
                        alive_mask[i] = False
            
            current_time = time.time()
            elapsed = current_time - start_time
            
            if elapsed > args.time:
                print(f"Time limit reached for Race {run+1}")
                break
                
            if terminated or not np.any(alive_mask):
                print(f"All agents died in Race {run+1}!")
                break
                
            if step % 30 == 0:
                # Progress update every ~2 seconds
                alive_count = np.sum(alive_mask)
                print(f"Time: {elapsed:04.1f}s | Alive: {alive_count:3d}/{args.agents} | Avg Progress: {info['progress']:.3f} | Total Collisions: {info['collisions']:.0f}")
                
        print(f"--- RACE {run+1} FINISHED | Survivors: {np.sum(alive_mask)}/{args.agents} | Max Progress: {info['progress']:.3f} ---")
        
        # Small delay between races to see the result
        time.sleep(3.0)

    env.close()
    print("\nEvaluation complete.")

if __name__ == "__main__":
    main()
