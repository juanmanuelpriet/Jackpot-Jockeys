import numpy as np
import time
import json
import os
import argparse
from cmaes import CMA
from godot_env import GodotRaceEnv
from models.policy_network import RacerPolicy

def evaluate_genome(weights, env, policy, num_seeds=3):
    total_fitness = 0.0
    all_metrics = []
    
    policy.set_flat_weights(weights)
    
    seeds_to_test = [42, 999, 1234]
    for seed in seeds_to_test:
        obs, _ = env.reset(seed=seed, options={"phase": 2, "num_agents": 5}) # Multi-agent to test bumping
        terminated = False
        truncated = False
        
        ep_reward = 0.0
        ep_progress = 0.0
        ep_collisions = 0
        ep_off_track = 0.0
        ep_stuck = 0
        steps = 0
        
        while not (terminated or truncated):
            action = policy(obs).numpy()
            obs, reward, terminated, truncated, info = env.step(action)
            
            ep_reward += reward
            ep_progress = info.get("progress", ep_progress)
            ep_collisions += info.get("collisions", 0)
            if info.get("off_track_dist", 0.0) > 0.0:
                ep_off_track += 1.0 # count off-track steps
            if info.get("stuck_timer", 0.0) > 1.0:
                ep_stuck += 1
            
            steps += 1
            if steps > 500: # Limit steps during training for speed
                truncated = True
                
        # Calculate fitness for this seed
        # Multi-objective: 
        #   + progress * 1000
        #   - collisions * 100
        #   - off_track * 2
        #   - stuck * 5
        seed_fitness = (ep_progress * 1000.0) - (ep_collisions * 100.0) - (ep_off_track * 2.0) - (ep_stuck * 5.0)
        total_fitness += seed_fitness
        all_metrics.append(seed_fitness)
        
    mean_fitness = total_fitness / num_seeds
    # Penalize variance (inter-seed reliability)
    variance_penalty = np.std(all_metrics) * 0.5
    
    return mean_fitness - variance_penalty

def train():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pop_size", type=int, default=12)
    parser.add_argument("--generations", type=int, default=50)
    parser.add_argument("--seeds", type=int, default=3)
    parser.add_argument("--visual", action="store_true", help="Run with Godot window visible")
    parser.add_argument("--port", type=int, default=9090)
    args = parser.parse_args()
    
    # Initialize policy to get parameter count
    policy = RacerPolicy()
    dummy_obs = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy_obs) # Build
    num_params = policy.count_parameters()
    print(f"Training RacerPolicy with {num_params} parameters")
    
    # Initialize CMA-ES
    mean = np.zeros(num_params)
    optimizer = CMA(mean=mean, sigma=0.1, population_size=args.pop_size)
    
    # Initialize Env
    env = GodotRaceEnv(headless=not args.visual, port=args.port)
    
    best_fitness = -np.inf
    
    os.makedirs("results", exist_ok=True)
    
    for gen in range(args.generations):
        solutions = []
        for _ in range(optimizer.population_size):
            x = optimizer.ask()
            solutions.append(x)
            
        fitnesses = []
        for i, x in enumerate(solutions):
            f = evaluate_genome(x, env, policy, num_seeds=args.seeds)
            fitnesses.append(f)
            print(f"Gen {gen}, Ind {i}: Fitness={f:.2f}")
            
        optimizer.tell([(x, -f) for x, f in zip(solutions, fitnesses)]) # CMA minimizes, so -f
        
        max_f = max(fitnesses)
        avg_f = sum(fitnesses) / len(fitnesses)
        print(f"--- Generation {gen} Summary: Max={max_f:.2f}, Avg={avg_f:.2f} ---")
        
        if max_f > best_fitness:
            best_fitness = max_f
            best_idx = np.argmax(fitnesses)
            best_weights = solutions[best_idx]
            
            # Save best weights
            save_path = f"results/best_weights_gen{gen}.json"
            with open(save_path, "w") as f:
                json.dump(best_weights.tolist(), f)
            print(f"New best fitness! Saved to {save_path}")

    env.close()
    print("Training complete.")

if __name__ == "__main__":
    train()
