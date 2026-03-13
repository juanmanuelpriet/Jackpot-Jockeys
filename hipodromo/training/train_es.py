import numpy as np
import time
import json
import os
import argparse
from godot_env import GodotRaceEnv
from models.policy_network import RacerPolicy

def evaluate(weights, env, policy, num_seeds=2):
    policy.set_flat_weights(weights)
    total_f = 0
    for s in range(num_seeds):
        obs, _ = env.reset(seed=s)
        done = False
        truncated = False
        steps = 0
        ep_progress = 0
        while not (done or truncated) and steps < 400:
            action = policy(obs[np.newaxis, :]).numpy()[0]
            obs, reward, done, truncated, info = env.step(action)
            ep_progress = info.get("progress", ep_progress)
            steps += 1
        
        # Simple fitness: progress
        total_f += ep_progress * 100
    return total_f / num_seeds

def train():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pop_size", type=int, default=8)
    parser.add_argument("--generations", type=int, default=20)
    parser.add_argument("--sigma", type=float, default=0.05)
    parser.add_argument("--lr", type=float, default=0.01)
    args = parser.parse_args()
    
    policy = RacerPolicy()
    dummy_obs = np.zeros((1, 59))
    _ = policy(dummy_obs)
    num_params = policy.count_parameters()
    
    current_weights = np.random.normal(0, 0.02, num_params)
    env = GodotRaceEnv()
    
    os.makedirs("results/es", exist_ok=True)
    
    for gen in range(args.generations):
        noise = np.random.normal(0, 1, (args.pop_size, num_params))
        fitnesses = []
        
        for i in range(args.pop_size):
            # Pos perturbation
            w_pos = current_weights + noise[i] * args.sigma
            f_pos = evaluate(w_pos, env, policy)
            
            # Neg perturbation (Antithetic sampling)
            w_neg = current_weights - noise[i] * args.sigma
            f_neg = evaluate(w_neg, env, policy)
            
            fitnesses.append((f_pos - f_neg))
            print(f"Gen {gen}, Ind {i}: delta_f={(f_pos - f_neg):.4f}")
            
        # Update weights (ES gradient)
        # Gradient = sum(noise_i * delta_f_i) / (pop_size * 2 * sigma)
        standardized_rewards = np.array(fitnesses)
        if np.std(standardized_rewards) > 1e-6:
            standardized_rewards = (standardized_rewards - np.mean(standardized_rewards)) / np.std(standardized_rewards)
            
        update = np.dot(noise.T, standardized_rewards) / (args.pop_size * args.sigma)
        current_weights += args.lr * update
        
        print(f"Generation {gen} complete. Mean Delta Fitness: {np.mean(fitnesses):.4f}")
        
        # Save every 5 gens
        if gen % 5 == 0:
            with open(f"results/es/weights_gen{gen}.json", "w") as f:
                json.dump(current_weights.tolist(), f)

    env.close()

if __name__ == "__main__":
    train()
