import json
import os
import subprocess
import sys
import time
from typing import List, Tuple
import numpy as np

# Permitir imports locales
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from cmaes import SepCMA as CMA
from godot_env import GodotRaceEnv
from models.policy_network import RacerPolicy

# ============================================================================
# CONFIGURACION FASE 1
# ============================================================================
MAX_TIME_SECONDS = 3600 * 2  # 2 horas para Fase 1 suelen bastar
POP_SIZE = 6                 # Tamaño de población CMA-ES
NUM_AGENTS = 8               # 8 CLONES paralelos por individuo
NUM_EVAL_SEEDS = 3           # Semillas por evaluación para estabilidad
CURRICULUM_PHASE = 1
SUBPHASE = "1B"              # 1B: Ovalo, 1C: Fácil
SIGMA_INIT = 0.1             # Mutación menor para ajuste fino (A pedido del usuario)

RESULTS_DIR = "results/train_phase1"
LOG_FILE = os.path.join(RESULTS_DIR, "log_phase1.jsonl")
BEST_MODEL_FILE = os.path.join(RESULTS_DIR, "mejor_modelo_f1.json")
GLOBAL_BEST_FILE = os.path.join(RESULTS_DIR, "mejor_absoluto_f1.json")
CHECKPOINT_DIR = os.path.join(RESULTS_DIR, "checkpoints")

# ============================================================================
# LÓGICA DE FITNESS FASE 1
# ============================================================================
def compute_fitness_phase1(results: List[dict]) -> dict:
    all_rewards = []
    all_progress = []
    all_collisions = []
    all_off_track = []
    all_speeds = []
    idle_count = 0
    total_steps = 0

    for res in results:
        all_rewards.extend(res['rewards'])
        all_progress.append(res['avg_progress'])
        all_collisions.append(res['total_collisions'])
        all_off_track.append(res['avg_off_track'])
        all_speeds.extend(res['avg_speeds'])
        idle_count += res['idle_steps']
        total_steps += res['total_steps']
    
    mean_r = np.mean(all_rewards)
    std_r = np.std(all_rewards)
    
    # Fitness balanceada
    fitness = mean_r - 0.2 * std_r
    
    metrics = {
        "fitness": float(fitness),
        "mean_reward": float(mean_r),
        "std_reward": float(std_r),
        "avg_progress": float(np.mean(all_progress)),
        "total_collisions": int(np.sum(all_collisions)),
        "idle_ratio": float(idle_count / max(1, total_steps)),
        "avg_speed": float(np.mean(all_speeds)),
        "dispersion_clones": float(np.std(all_rewards))
    }
    return metrics

def update_latex_report(fit_data: dict, sigma: float):
    tex_path = "/Users/juanmanuelprieto/Documents/entorno_jackpot/math/resultados.tex"
    if not os.path.exists(tex_path): 
        print(f"  [Warning] LaTeX report not found at {tex_path}")
        return
    
    try:
        with open(tex_path, "r") as f:
            content = f.read()
        
        # Formatear nueva fila
        new_row = f"{fit_data['gen']} & {fit_data['fitness']:.1f} & {fit_data['avg_progress']:.4f} & {fit_data['total_collisions']} & {fit_data['idle_ratio']*100:.1f}\\% & {fit_data['avg_speed']:.2f} & {sigma:.2f} \\\\\n% [TABLA_DINAMICA_FASE1B]"
        
        if "% [TABLA_DINAMICA_FASE1B]" in content:
            content = content.replace("% [TABLA_DINAMICA_FASE1B]", new_row)
            
            with open(tex_path, "w") as f:
                f.write(content)
            
            # Intentar compilar (silent)
            subprocess.run(["pdflatex", "-interaction=nonstopmode", "resultados.tex"], 
                           cwd="/Users/juanmanuelprieto/Documents/entorno_jackpot/math", 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"  [Report] Gen {fit_data['gen']} injected into LaTeX and PDF recompiled.")
    except Exception as e:
        print(f"  [Error] Failed to update LaTeX report: {e}")

def ensure_dirs():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)

def main():
    ensure_dirs()
    # console_log = open(os.path.join(RESULTS_DIR, "console.log"), "a", encoding="utf-8")
    # sys.stdout = console_log
    # sys.stderr = console_log

    print(f"\n>>> INICIANDO FASE 1 ({SUBPHASE}) - {time.ctime()}")
    
    policy = RacerPolicy()
    dummy_obs = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy_obs) # Build model
    num_params = policy.count_parameters()
    
    best_global_fitness = -1e12
    if os.path.exists(GLOBAL_BEST_FILE):
        print(f"  [Load] Cargando mejores pesos ABSOLUTOS de {GLOBAL_BEST_FILE}...")
        with open(GLOBAL_BEST_FILE, "r") as f:
            data = json.load(f)
            policy.set_flat_weights(np.array(data["weights"]))
            best_global_fitness = data.get("fitness", -1e12)
    elif os.path.exists(BEST_MODEL_FILE):
        print(f"  [Load] Cargando mejores pesos previos de {BEST_MODEL_FILE} para continuar...")
        with open(BEST_MODEL_FILE, "r") as f:
            weights = json.load(f)
            policy.set_flat_weights(np.array(weights))

    optimizer = CMA(mean=policy.get_flat_weights(), sigma=SIGMA_INIT, population_size=POP_SIZE)
    env = GodotRaceEnv(headless=False, port=9090, launch_godot=False)
    time.sleep(2.0) # Retardo inicial para evitar race conditions con Godot

    for gen in range(1000):
        gen_start_t = time.time()
        
        # Obtener candidatos
        solutions = [optimizer.ask() for _ in range(POP_SIZE)]
        fitness_values = []
        
        best_gen_fitness = -1e9
        best_gen_metrics = None
        
        for i, x in enumerate(solutions):
            policy.set_flat_weights(x)
            eval_results = []
            # Subfases: 1A usa seeds 0-9 (rectas). 1B usa 10-14 (CCW) y 15-19 (CW)
            seeds = [0, 1] if SUBPHASE == "1A" else [11, 16] # Una de cada sentido
            
            for s in seeds:
                # Reintentar reset si falla
                obs = None
                for _r in range(3):
                    try:
                        obs, _ = env.reset(seed=s, options={"phase": CURRICULUM_PHASE, "num_agents": NUM_AGENTS})
                        break
                    except Exception as e:
                        print(f"  [Warning] Reset failed for seed {s}, attempt {_r+1}. Error: {e}")
                        time.sleep(2.0)
                
                if obs is None:
                    print(f"  [Error] Failed to reset environment for seed {s} after multiple attempts. Skipping individual.")
                    continue # Skip this seed/individual if reset consistently fails
                
                done = False
                ep_rewards = [0.0] * NUM_AGENTS
                total_collisions = 0
                total_progress = 0
                total_off_track = 0
                total_speed = 0
                idle_steps = 0
                steps = 0
                
                for _ in range(400):
                    actions = []
                    for a_idx in range(NUM_AGENTS):
                        act = policy(np.array([obs[a_idx]]))
                        actions.append(act[0].numpy().tolist())
                    
                    if steps == 1:
                        print(f"  [Debug] Gen {gen} Ind {i} Step 1 | Action[0]: {actions[0]}")
                    
                    obs, rewards, term, trunc, info = env.step(actions)
                    done = term or trunc or ("error" in info)
                    steps += 1
                    
                    if "error" in info:
                        print(f"  [Error] Skipping partial episode for seed {s}")
                        break

                    # Extraer métricas de info
                    total_collisions += info.get("collisions", 0)
                    total_progress = max(total_progress, info.get("progress", 0))
                    total_off_track += info.get("off_track_dist", 0)
                    
                    for a_idx in range(NUM_AGENTS):
                        ep_rewards[a_idx] += info['raw_rewards'][a_idx]
                        speed = np.linalg.norm(obs[a_idx][:2]) # Aproximación velocidad
                        total_speed += speed
                        if speed < 0.1: idle_steps += 1
                        
                    if done: break
                
                eval_results.append({
                    "rewards": ep_rewards,
                    "avg_progress": total_progress,
                    "total_collisions": total_collisions,
                    "avg_off_track": total_off_track / steps,
                    "avg_speeds": [total_speed / (steps * NUM_AGENTS)],
                    "idle_steps": idle_steps,
                    "total_steps": steps * NUM_AGENTS
                })
            
            fit_data = compute_fitness_phase1(eval_results)
            fitness_values.append(fit_data["fitness"])
            
            # Tracking del mejor de la generación
            if fit_data["fitness"] > best_gen_fitness:
                best_gen_fitness = fit_data["fitness"]
                best_gen_metrics = fit_data
                best_gen_metrics["gen"] = gen
            
            # Log gen summary
            with open(LOG_FILE, "a") as f:
                log_entry = {
                    "gen": gen,
                    "ind": i,
                    "time": time.time(),
                    "gen_time": time.time() - gen_start_t,
                    **fit_data
                }
                f.write(json.dumps(log_entry) + "\n")

            print(f"Gen {gen} | Ind {i} | Fit: {fit_data['fitness']:.2f} | Prog: {fit_data['avg_progress']:.4f}")

        optimizer.tell(list(zip(solutions, fitness_values)))
        
        # Guardar mejor y actualizar reporte
        if fitness_values and best_gen_metrics:
            best_idx = np.argmax(fitness_values)
            best_w = solutions[best_idx]
            
            # 1. Guardar el mejor de ESTA generación
            with open(BEST_MODEL_FILE, "w") as f:
                json.dump(best_w.tolist(), f)
            
            # 2. Guardar el mejor ABSOLUTO si se supera el récord
            if best_gen_metrics["fitness"] > best_global_fitness:
                best_global_fitness = best_gen_metrics["fitness"]
                with open(GLOBAL_BEST_FILE, "w") as f:
                    json.dump({"fitness": best_global_fitness, "gen": gen, "weights": best_w.tolist()}, f)
                print(f"  [Record] Nuevo mejor absoluto en Gen {gen}: {best_global_fitness:.2f}")

            # 3. Guardar checkpoint cada 5 generaciones
            if gen % 5 == 0:
                cp_file = os.path.join(CHECKPOINT_DIR, f"weights_gen_{gen}.json")
                with open(cp_file, "w") as f:
                    json.dump(best_w.tolist(), f)
            
            # Exportar datos al PDF
            update_latex_report(best_gen_metrics, optimizer._sigma)

if __name__ == "__main__":
    main()
