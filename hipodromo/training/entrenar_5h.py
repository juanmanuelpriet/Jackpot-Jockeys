"""
Entrenamiento de 5 HORAS CMA-ES para NeuralAgent AG-RACE.
Configuración: 5 NN + 1 Baseline.
Fitness: Drift x100, Colisiones agentes +, Colisiones paredes -.
"""
import numpy as np
import time
import json
import os
import subprocess
import sys

# Asegurar que podamos importar GodotRaceEnv y RacerPolicy
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from cmaes import SepCMA as CMA
    from godot_env import GodotRaceEnv
    from models.policy_network import RacerPolicy
except ImportError as e:
    print(f"Error al importar dependencias: {e}")
    sys.exit(1)

# ─── Configuración ──────────────────────────────────────────────────────────
MAX_TIME_SECONDS  = 18000     # 5 Horas
POP_SIZE          = 4         # Genomas por generación
NUM_AGENTS        = 6         # 5 NN + 1 Baseline (gestionado en Godot)
NUM_EVAL_SEEDS    = 2         
MAX_STEPS_PER_EP  = 200       # Mucho más corto para ver cambios ya
SIGMA_INIT        = 0.5       # Exploración agresiva
CHECKPOINT_EVERY  = 1
RESULTS_DIR       = "results/train_5h"
LOG_FILE          = "results/train_5h/log_5h.jsonl"
BASE_DIR          = "/Users/juanmanuelprieto/Documents/entorno_jackpot"
MATH_DIR          = os.path.join(BASE_DIR, "math")
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_genome(weights, env, policy, gen):
    """Evalúa un genoma. Retorna el fitness."""
    policy.set_flat_weights(weights)
    seed_fitnesses = []
    
    for i in range(NUM_EVAL_SEEDS):
        eval_seed = np.random.randint(0, 1000000)
        print(f"\n  [Gen {gen}] Evaluando Seed {i+1}/{NUM_EVAL_SEEDS} (Pista: {eval_seed})... ", end="", flush=True)
        obs, _ = env.reset(seed=eval_seed, options={"phase": 3, "num_agents": NUM_AGENTS, "gen": gen})
        
        ep_total_reward = 0.0
        # Métricas agregadas (el env devuelve la media en info)
        ep_progress = 0.0
        ep_wall_collisions = 0
        ep_agent_collisions = 0
        
        for step in range(MAX_STEPS_PER_EP):
            action = policy(obs.astype(np.float32)).numpy()
            obs, reward, terminated, truncated, info = env.step(action)
            
            # Solo sumar las recompensas de los primeros 5 agentes (los NN)
            # El 6to es el Baseline y no debe influir en el fitness de los NN.
            nn_rewards = info.get("raw_rewards", [reward])[:5]
            ep_total_reward += np.mean(nn_rewards)
            
            ep_progress = info.get("progress", ep_progress)
            ep_wall_collisions += info.get("collisions", 0)
            ep_agent_collisions += info.get("agent_collisions", 0)
            
            if terminated or truncated:
                break
        
        # El fitness ya viene influenciado por la recompensa de Godot (donde drift es x100 y agentes+).
        # Aquí podemos añadir un bono extra por superar al promedio o simplemente usar la recompensa acumulada.
        fitness = ep_total_reward
        seed_fitnesses.append(fitness)
    
    return np.mean(seed_fitnesses)


def generate_pdf_report(summary, log_entries):
    """Genera un reporte LaTeX y lo compila a PDF."""
    os.makedirs(MATH_DIR, exist_ok=True)
    tex_path = os.path.join(MATH_DIR, "resultados.tex")
    
    tex_content = r"""
\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{geometry}
\usepackage{booktabs}
\usepackage{xcolor}
\geometry{a4paper, margin=1in}

\title{\color{red}Reporte de Entrenamiento 5 Horas \\ \huge AG-RACE}
\author{Antigravity AI Assistant}
\date{\today}

\begin{document}

\maketitle

\section{Configuración de la Sesión}
Esta sesión de entrenamiento se diseñó para optimizar el comportamiento de derrape (drift) y la interacción competitiva.

\begin{itemize}
    \item \textbf{Unidades en pista:} 5 Agentes Neuronales + 1 Baseline (Referencia).
    \item \textbf{Modificadores de Fitness:}
        \begin{itemize}
            \item Drift: x100 de recompensa para incentivar curvas agresivas.
            \item Colisiones entre agentes: Bonificadas (puntos por contacto).
            \item Colisiones con paredes: Penalizadas (supervivencia).
        \end{itemize}
    \item \textbf{Algoritmo:} CMA-ES.
\end{itemize}

\section{Métricas Finales}
\begin{itemize}
    \item \textbf{Generaciones totales:} """ + str(summary['total_generations']) + r"""
    \item \textbf{Tiempo total:} """ + f"{summary['total_time_min']:.2f}" + r""" minutos
    \item \textbf{Mejor Fitness alcanzado:} """ + f"{summary['best_fitness']:.2f}" + r"""
    \item \textbf{Peso de parámetros:} """ + str(summary['num_params']) + r"""
\end{itemize}

\section{Evolución Histórica}
Se muestran las últimas generaciones del proceso:

\begin{table}[h!]
\centering
\begin{tabular}{@{}ccccc@{}}
\toprule
\textbf{Gen} & \textbf{Máx Fitness} & \textbf{Promedio} & \textbf{Sigma} & \textbf{Tiempo (s)} \\ \midrule
"""
    # Mostrar las últimas 30 generaciones
    relevant_entries = log_entries[-30:]
    for entry in relevant_entries:
        tex_content += f"{entry['gen']} & {entry['max_fitness']:.2f} & {entry['avg_fitness']:.2f} & {entry['sigma']:.4f} & {entry['gen_time_s']:.1f} \\\\\n"

    tex_content += r"""
\bottomrule
\end{tabular}
\end{table}

\section{Análisis de Comportamiento}
Con el multiplicador de drift x100, se espera que los agentes hayan aprendido a iniciar derrapes laterales para mantener la velocidad en las curvas. La presencia de un agente Baseline sirve como objetivo constante de superación para la población evolucionada.

\end{document}
"""
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(tex_content)
    
    try:
        subprocess.run(["pdflatex", "-interaction=nonstopmode", "resultados.tex"], cwd=MATH_DIR, capture_output=True)
        print(f"✅ PDF actualizado en {os.path.join(MATH_DIR, 'resultados.pdf')}")
    except Exception as e:
        print(f"❌ Error al compilar PDF: {e}")


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    policy = RacerPolicy()
    dummy = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy)
    num_params = policy.count_parameters()
    
    print(f"╔═══════════════════════════════════════════╗")
    print(f"║   ENTRENAMIENTO AG-RACE (5 HORAS)         ║")
    print(f"║   Modo: 5 NN vs 1 Baseline                ║")
    print(f"║   Drift Reward: x100 | Contact Points: YES║")
    print(f"╚═══════════════════════════════════════════╝")
    
    optimizer = CMA(mean=np.zeros(num_params), sigma=SIGMA_INIT, population_size=POP_SIZE)
    print(f">>> Optimizador CMA-ES listo con {num_params} parámetros.")
    
    # Visible (False headless) como pidió el usuario para ver progreso
    print(f">>> LISTO PARA CONECTAR. Por favor, abre Godot y dale a 'PLAY'.")
    print(f">>> (El entrenamiento empezará automáticamente al detectar el juego).")
    env = GodotRaceEnv(headless=False, port=9090)
    
    best_fitness_ever = -np.inf
    best_weights_ever = None
    start_time = time.time()
    gen = 0
    log_entries = []
    log_f = open(LOG_FILE, "w")
    
    try:
        while True:
            elapsed = time.time() - start_time
            if elapsed >= MAX_TIME_SECONDS:
                print(f"\n⏰ Tiempo cumplido ({elapsed/3600:.2f} horas).")
                break
            
            gen_start = time.time()
            solutions = [optimizer.ask() for _ in range(optimizer.population_size)]
            
            fitnesses = []
            print(f"Gen {gen:3d} | Evaluando pop: ", end="", flush=True)
            for i, x in enumerate(solutions):
                f = evaluate_genome(x, env, policy, gen)
                fitnesses.append(f)
                print(f"[{i+1}/{POP_SIZE}] ", end="", flush=True)
            
            optimizer.tell([(x, -f) for x, f in zip(solutions, fitnesses)])
            
            gen_time = time.time() - gen_start
            max_f = max(fitnesses)
            avg_f = np.mean(fitnesses)
            
            if max_f > best_fitness_ever:
                best_fitness_ever = max_f
                best_weights_ever = solutions[np.argmax(fitnesses)].copy()
                with open(f"{RESULTS_DIR}/mejor_modelo.json", "w") as wf:
                    json.dump(best_weights_ever.tolist(), wf)
            
            log_entry = {
                "gen": gen,
                "max_fitness": float(max_f),
                "avg_fitness": float(avg_f),
                "sigma": float(optimizer._sigma),
                "gen_time_s": gen_time
            }
            log_entries.append(log_entry)
            log_f.write(json.dumps(log_entry) + "\n")
            log_f.flush()
            
            rem_h = (MAX_TIME_SECONDS - elapsed) / 3600.0
            print(f" | Máx: {max_f:8.2f} | σ={optimizer._sigma:.4f} | Restante: {rem_h:.2f}h")
            
            if gen % CHECKPOINT_EVERY == 0:
                generate_pdf_report({
                    "total_generations": gen,
                    "total_time_min": elapsed / 60.0,
                    "best_fitness": best_fitness_ever if best_fitness_ever != -np.inf else 0.0,
                    "num_params": num_params
                }, log_entries)
                
            gen += 1
            
    except KeyboardInterrupt:
        print("\n🛑 Interrumpido.")
    finally:
        log_f.close()
        env.close()
        summary = {
            "total_generations": gen,
            "total_time_min": (time.time() - start_time) / 60.0,
            "best_fitness": float(best_fitness_ever if best_fitness_ever != -np.inf else 0.0),
            "num_params": num_params,
            "pop_size": POP_SIZE,
            "sigma_init": SIGMA_INIT
        }
        generate_pdf_report(summary, log_entries)
        print(f"\n📊 Entrenamiento guardado en {RESULTS_DIR}")

if __name__ == "__main__":
    main()
