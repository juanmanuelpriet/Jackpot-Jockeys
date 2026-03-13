"""
1-Hour CMA-ES Training for NeuralAgent
Logs fitness, progress, and saves checkpoints every 5 generations.
Terminates after max_time_seconds (default: 3600 = 1 hour).
"""
import numpy as np
import time
import json
import os
import sys
from cmaes import CMA
from godot_env import GodotRaceEnv
from models.policy_network import RacerPolicy

# ─── Config ───────────────────────────────────────────────────────────
MAX_TIME_SECONDS  = 3600      # 1 hour
POP_SIZE          = 4         # individuals per generation
NUM_EVAL_SEEDS    = 1         # seeds per evaluation (faster visual)
MAX_STEPS_PER_EP  = 500       # steps per episode (~30s sim time)
SIGMA_INIT        = 0.15
CHECKPOINT_EVERY  = 2
RESULTS_DIR       = "results/train_1h"
LOG_FILE          = "results/train_1h/training_log.jsonl"
# ──────────────────────────────────────────────────────────────────────

def evaluate_genome(weights, env, policy):
    """Evaluate a set of weights across multiple seeds. Returns fitness."""
    policy.set_flat_weights(weights)
    seed_fitnesses = []
    
    for seed in range(NUM_EVAL_SEEDS):
        obs, _ = env.reset(seed=seed, options={"phase": 2})
        ep_reward = 0.0
        ep_progress = 0.0
        ep_collisions = 0
        ep_off_track_steps = 0
        ep_stuck_steps = 0
        
        for step in range(MAX_STEPS_PER_EP):
            action = policy(obs.astype(np.float32)).numpy()
            obs, reward, terminated, truncated, info = env.step(action)
            
            ep_reward += reward
            ep_progress = info.get("progress", ep_progress)
            ep_collisions += info.get("collisions", 0)
            if info.get("off_track_dist", 0.0) > 0.0:
                ep_off_track_steps += 1
            if info.get("stuck_timer", 0.0) > 1.0:
                ep_stuck_steps += 1
            
            if terminated or truncated:
                break
        
        # Multi-objective fitness
        fitness = (
            ep_progress * 1000.0           # reward progress
            + ep_reward * 10.0             # reward signal
            - ep_collisions * 50.0         # penalize collisions
            - ep_off_track_steps * 1.0     # penalize off-track
            - ep_stuck_steps * 3.0         # penalize stuck
        )
        seed_fitnesses.append(fitness)
    
    mean_f = np.mean(seed_fitnesses)
    std_f  = np.std(seed_fitnesses)
    # Penalize variance across seeds (want robustness)
    return mean_f - 0.3 * std_f


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    # Build policy to get param count
    policy = RacerPolicy()
    dummy = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy)
    num_params = policy.count_parameters()
    
    print(f"╔══════════════════════════════════════╗")
    print(f"║   AG-RACE NeuralAgent Training       ║")
    print(f"║   CMA-ES  |  {num_params} params            ║")
    print(f"║   Pop: {POP_SIZE}  |  Seeds: {NUM_EVAL_SEEDS}  |  1 hour  ║")
    print(f"╚══════════════════════════════════════╝")
    
    # Init CMA-ES
    mean = np.zeros(num_params)
    optimizer = CMA(mean=mean, sigma=SIGMA_INIT, population_size=POP_SIZE)
    
    # Init Env (Visible for the user)
    env = GodotRaceEnv(headless=False)
    
    best_fitness_ever = -np.inf
    best_weights_ever = None
    start_time = time.time()
    gen = 0
    
    # Log file
    log_f = open(LOG_FILE, "w")
    
    try:
        while True:
            elapsed = time.time() - start_time
            if elapsed >= MAX_TIME_SECONDS:
                print(f"\n⏰ Time limit reached ({elapsed/60:.1f} min). Stopping.")
                break
            
            gen_start = time.time()
            
            # Ask for candidates
            solutions = [optimizer.ask() for _ in range(optimizer.population_size)]
            
            # Evaluate
            fitnesses = []
            for i, x in enumerate(solutions):
                f = evaluate_genome(x, env, policy)
                fitnesses.append(f)
            
            # Tell CMA-ES (it minimizes, so negate)
            optimizer.tell([(x, -f) for x, f in zip(solutions, fitnesses)])
            
            gen_time = time.time() - gen_start
            max_f = max(fitnesses)
            avg_f = np.mean(fitnesses)
            min_f = min(fitnesses)
            
            # Track best
            if max_f > best_fitness_ever:
                best_fitness_ever = max_f
                best_idx = np.argmax(fitnesses)
                best_weights_ever = solutions[best_idx].copy()
                # Save best
                with open(f"{RESULTS_DIR}/best_weights.json", "w") as wf:
                    json.dump(best_weights_ever.tolist(), wf)
            
            # Log
            log_entry = {
                "gen": gen,
                "elapsed_min": elapsed / 60.0,
                "gen_time_s": gen_time,
                "max_fitness": float(max_f),
                "avg_fitness": float(avg_f),
                "min_fitness": float(min_f),
                "best_ever": float(best_fitness_ever),
                "sigma": float(optimizer._sigma),
            }
            log_f.write(json.dumps(log_entry) + "\n")
            log_f.flush()
            
            remaining = (MAX_TIME_SECONDS - elapsed) / 60.0
            print(f"Gen {gen:3d} | Max: {max_f:8.2f} | Avg: {avg_f:8.2f} | Best Ever: {best_fitness_ever:8.2f} | σ={optimizer._sigma:.4f} | {gen_time:.1f}s | {remaining:.0f}min left")
            
            # Checkpoint
            if gen % CHECKPOINT_EVERY == 0 and gen > 0:
                ckpt_path = f"{RESULTS_DIR}/checkpoint_gen{gen}.json"
                with open(ckpt_path, "w") as wf:
                    json.dump(best_weights_ever.tolist(), wf)
                print(f"  💾 Checkpoint saved: {ckpt_path}")
            
            gen += 1
            
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user.")
    finally:
        log_f.close()
        env.close()
        
        # Save final best
        if best_weights_ever is not None:
            final_path = f"{RESULTS_DIR}/final_best_weights.json"
            with open(final_path, "w") as wf:
                json.dump(best_weights_ever.tolist(), wf)
            print(f"\n✅ Training complete after {gen} generations ({(time.time()-start_time)/60:.1f} min)")
            print(f"   Best fitness: {best_fitness_ever:.2f}")
            print(f"   Saved to: {final_path}")
        
        # Save full log summary
        summary = {
            "total_generations": gen,
            "total_time_min": (time.time() - start_time) / 60.0,
            "best_fitness": float(best_fitness_ever),
            "num_params": num_params,
            "pop_size": POP_SIZE,
            "num_seeds": NUM_EVAL_SEEDS,
            "sigma_init": SIGMA_INIT,
        }
        with open(f"{RESULTS_DIR}/summary.json", "w") as sf:
            json.dump(summary, sf, indent=2)

if __name__ == "__main__":
    main()
