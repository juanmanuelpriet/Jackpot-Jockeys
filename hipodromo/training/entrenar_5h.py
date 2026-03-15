import json
import os
import subprocess
import sys
import time
from typing import List, Tuple

import numpy as np

# Permitir imports locales
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    # Variante diagonal: coherente con política compacta y costo controlado
    from cmaes import SepCMA as CMA
    from godot_env import GodotRaceEnv
    from models.policy_network import RacerPolicy
except ImportError as e:
    print(f"Error al importar dependencias: {e}")
    sys.exit(1)


# ============================================================================
# CONFIGURACION
# ============================================================================

MAX_TIME_SECONDS = 18000*3          # 5 horas
POP_SIZE = 8                      # mas estable que 4
NUM_AGENTS = 6                    # 5 NN + 1 Baseline
NUM_EVAL_SEEDS = 5                # menos ruido que 2
NUM_VAL_SEEDS = 12                # reevaluacion del mejor
MAX_STEPS_PER_EP = 400            # Más ágil que cada 400
SIGMA_INIT = 0.20                 # menos agresiva que 0.5
CHECKPOINT_EVERY = 2
SEED_SPACE_MAX = 1_000_000

# Pesos del fitness
W_BASELINE_GAP = 0.10             # referencia suave, no dominante
W_VARIANCE = 0.25                 # penalizacion por inestabilidad inter-seed

RESULTS_DIR = "results/train_5h"
LOG_FILE = os.path.join(RESULTS_DIR, "log_5h.jsonl")
BEST_MODEL_FILE = os.path.join(RESULTS_DIR, "mejor_modelo.json")
SUMMARY_FILE = os.path.join(RESULTS_DIR, "summary_5h.json")

BASE_DIR = "/Users/juanmanuelprieto/Documents/entorno_jackpot"
MATH_DIR = os.path.join(BASE_DIR, "math")

# Fase actual: si luego haces curriculum, cambia esto por config externa
TRAIN_PHASE = 3

# Modo visual: False si quieres ver Godot, True si usas headless
HEADLESS = False
PORT = 9090


# ============================================================================
# UTILIDADES
# ============================================================================

def ensure_dirs() -> None:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    os.makedirs(MATH_DIR, exist_ok=True)


def save_json(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def generate_eval_seeds(gen: int, num_seeds: int) -> List[int]:
    """
    Genera seeds deterministas por generacion.
    Todos los genomas de una misma generacion ven EXACTAMENTE las mismas pistas.
    """
    rng = np.random.RandomState(gen + 12345)
    return [int(x) for x in rng.randint(0, SEED_SPACE_MAX, size=num_seeds)]


def extract_rewards(info: dict, fallback_reward) -> Tuple[List[float], float]:
    """
    Espera que info tenga raw_rewards con 6 entradas:
    5 NN + 1 baseline.
    """
    raw = info.get("raw_rewards")
    if raw is None:
        raw = [fallback_reward] * NUM_AGENTS

    raw = list(raw)
    if len(raw) < NUM_AGENTS:
        raw = raw + [0.0] * (NUM_AGENTS - len(raw))

    nn_rewards = raw[:5]
    baseline_reward = raw[5] if len(raw) > 5 else 0.0
    return nn_rewards, baseline_reward


def compute_fitness(
    ia_returns: List[float],
    baseline_returns: List[float],
) -> Tuple[float, float, float, float]:
    """
    Fitness robusto:
    - media IA
    - baseline gap suave
    - penalizacion por varianza inter-seed

    Justificacion:
    el documento recomienda fitness multi-seed con regularizacion por varianza,
    porque sin eso se sobreajusta a seeds especificas.
    """
    ia_mean = float(np.mean(ia_returns))
    ia_std = float(np.std(ia_returns))
    base_mean = float(np.mean(baseline_returns))
    
    # Fitness enfocado en progreso neto + bono por superar al baseline
    fitness = ia_mean - (W_VARIANCE * ia_std) + (W_BASELINE_GAP * max(0, ia_mean - base_mean))
    return fitness, ia_mean, ia_std, base_mean


# ============================================================================
# EVALUACION
# ============================================================================

def evaluate_genome(
    weights: np.ndarray,
    env: GodotRaceEnv,
    policy: RacerPolicy,
    eval_seeds: List[int],
    gen: int,
    verbose: bool = False,
) -> dict:
    """
    Evalua un genoma sobre seeds fijas de la generacion.
    Retorna metricas agregadas para logging y optimizacion.
    """
    policy.set_flat_weights(weights)

    ia_seed_returns: List[float] = []
    baseline_seed_returns: List[float] = []

    for idx, eval_seed in enumerate(eval_seeds):
        # Siempre informar el progreso de la pista actual
        print(f"\r  > [Evaluando] Pista {idx+1}/{len(eval_seeds)}... ", end="", flush=True)

        obs, _ = env.reset(
            seed=int(eval_seed),
            options={
                "phase": TRAIN_PHASE,
                "num_agents": NUM_AGENTS,
                "agent_type": "neural",
                "gen": gen,
            },
        )

        ep_nn_reward = 0.0
        ep_baseline_reward = 0.0

        for _step in range(MAX_STEPS_PER_EP):
            action = policy(obs.astype(np.float32)).numpy()
            obs, reward, terminated, truncated, info = env.step(action)

            nn_rewards, baseline_reward = extract_rewards(info, reward)
            ep_nn_reward += float(np.mean(nn_rewards))
            ep_baseline_reward += float(baseline_reward)

            if terminated or truncated:
                break

        ia_seed_returns.append(ep_nn_reward)
        baseline_seed_returns.append(ep_baseline_reward)

        if verbose:
            print(
                f"IA={ep_nn_reward:.1f} | Baseline={ep_baseline_reward:.1f}",
                flush=True,
            )

    fitness, ia_mean, ia_std, base_mean = compute_fitness(
        ia_seed_returns, baseline_seed_returns
    )

    return {
        "fitness": float(fitness),
        "ia_mean": float(ia_mean),
        "ia_std": float(ia_std),
        "baseline_mean": float(base_mean),
        "seed_returns": [float(x) for x in ia_seed_returns],
        "baseline_returns": [float(x) for x in baseline_seed_returns],
    }


# ============================================================================
# REPORTE PDF
# ============================================================================

def generate_pdf_report(summary: dict, log_entries: List[dict]) -> None:
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
Entrenamiento con SepCMA sobre política compacta, evaluación multi-seed fija por generación y
penalización por varianza inter-seed para mejorar estabilidad.

\begin{itemize}
    \item \textbf{Unidades en pista:} 5 Agentes Neuronales + 1 Baseline.
    \item \textbf{Algoritmo:} SepCMA (variante diagonal de CMA-ES).
    \item \textbf{Seeds por evaluación:} """ + str(NUM_EVAL_SEEDS) + r"""
    \item \textbf{Pasos por episodio:} """ + str(MAX_STEPS_PER_EP) + r"""
    \item \textbf{Población:} """ + str(POP_SIZE) + r"""
\end{itemize}

\section{Métricas Finales}
\begin{itemize}
    \item \textbf{Generaciones totales:} """ + str(summary["total_generations"]) + r"""
    \item \textbf{Tiempo total:} """ + f'{summary["total_time_min"]:.2f}' + r""" minutos
    \item \textbf{Mejor fitness validado:} """ + f'{summary["best_fitness"]:.2f}' + r"""
    \item \textbf{Parámetros de la política:} """ + str(summary["num_params"]) + r"""
\end{itemize}

\section{Histórico reciente}
\begin{table}[h!]
\centering
\begin{tabular}{@{}ccccccc@{}}
\toprule
\textbf{Gen} & \textbf{Fit} & \textbf{IA Avg} & \textbf{IA Std} & \textbf{Baseline} & \textbf{Gap} & \textbf{Sigma} \\ \midrule
"""

    for entry in log_entries[-30:]:
        tex_content += (
            f'{entry["gen"]} & '
            f'{entry["fitness"]:.1f} & '
            f'{entry["ia_mean"]:.1f} & '
            f'{entry["ia_std"]:.1f} & '
            f'{entry["baseline_mean"]:.1f} & '
            f'{entry["gap"]:+.1f} & '
            f'{entry["sigma"]:.4f} \\\\\n'
        )

    tex_content += r"""
\bottomrule
\end{tabular}
\end{table}

\section{Lectura}
La meta no es maximizar un pico aislada, sino mejorar retorno medio y reducir sensibilidad entre
semillas. Por eso se reporta la desviación estándar inter-seed además del promedio.

\end{document}
"""

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(tex_content)

    try:
        subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "resultados.tex"],
            cwd=MATH_DIR,
            capture_output=True,
            check=False,
        )
        print(f"✅ PDF actualizado en {os.path.join(MATH_DIR, 'resultados.pdf')}")
    except Exception as e:
        print(f"❌ Error al compilar PDF: {e}")


# ============================================================================
# MAIN
# ============================================================================

def main() -> None:
    ensure_dirs()

    policy = RacerPolicy()
    dummy = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy)
    num_params = policy.count_parameters()

    print("╔══════════════════════════════════════════════╗")
    print("║   ENTRENAMIENTO AG-RACE (5 HORAS)            ║")
    print("║   SepCMA + evaluación multi-seed estable     ║")
    print("║   5 NN vs 1 Baseline                         ║")
    print("╚══════════════════════════════════════════════╝")
    print(f">>> Parámetros de la política: {num_params}")

    init_mean = np.zeros(num_params)
    if os.path.exists(BEST_MODEL_FILE):
        print(f">>> Cargando mejor genoma previo de {BEST_MODEL_FILE}...")
        try:
            with open(BEST_MODEL_FILE, "r") as f:
                saved_weights = np.array(json.load(f))
            if len(saved_weights) == num_params:
                init_mean = saved_weights
            else:
                print(f"⚠️ Tamaño incompatible. Ignorando.")
        except:
            print(f"⚠️ Error cargando modelo. Usando ceros.")

    optimizer = CMA(
        mean=init_mean,
        sigma=SIGMA_INIT,
        population_size=POP_SIZE,
    )
    print(f">>> Optimizador SepCMA listo | sigma inicial = {SIGMA_INIT}")

    if HEADLESS:
        print(f">>> Esperando conexión headless en puerto {PORT}...")
    else:
        print(f">>> Esperando conexión visual en puerto {PORT}...")

    env = GodotRaceEnv(headless=HEADLESS, port=PORT)

    best_fitness_ever = -np.inf
    best_weights_ever = None
    best_validation = None

    start_time = time.time()
    gen = 42
    log_entries: List[dict] = []

    log_f = open(LOG_FILE, "a", encoding="utf-8")

    try:
        while True:
            elapsed = time.time() - start_time
            if elapsed >= MAX_TIME_SECONDS:
                print(f"\n⏰ Tiempo cumplido ({elapsed / 3600.0:.2f} horas).")
                break

            gen_start = time.time()

            # Todas las soluciones de esta generacion ven las mismas seeds
            eval_seeds = generate_eval_seeds(gen, NUM_EVAL_SEEDS)

            solutions = [optimizer.ask() for _ in range(optimizer.population_size)]

            eval_results = []
            print(f"\nGen {gen:03d} | Seeds: {eval_seeds}")

            for i, x in enumerate(solutions):
                # Informar qué individuo se está evaluando
                print(f"  > [Cerebro {i+1}/{POP_SIZE}] Compitiendo en 5 pistas... ", end="", flush=True)
                
                result = evaluate_genome(
                    x, env, policy, eval_seeds, gen, verbose=False
                )
                eval_results.append(result)
                
                # Al terminar sus pistas, mostrar resultado con colores si es posible (en texto)
                delta_sign = "+" if result['ia_mean'] > result['baseline_mean'] else ""
                print(f"\r  ✓ [{i+1}/{POP_SIZE}] IA: {result['ia_mean']:7.1f} | Base: {result['baseline_mean']:7.1f} | Δ: {delta_sign}{result['ia_mean'] - result['baseline_mean']:+6.1f}", flush=True)

            fitnesses = [r["fitness"] for r in eval_results]
            optimizer.tell([(x, -f) for x, f in zip(solutions, fitnesses)])

            best_idx = int(np.argmax(fitnesses))
            best_train_fit = float(fitnesses[best_idx])
            best_train_weights = solutions[best_idx].copy()

            # Revalidar mejor individuo con mas seeds
            val_seeds = generate_eval_seeds(100000 + gen, NUM_VAL_SEEDS)
            val_result = evaluate_genome(
                best_train_weights, env, policy, val_seeds, gen, verbose=False
            )

            gen_time = time.time() - gen_start
            avg_fit = float(np.mean(fitnesses))
            avg_ia = float(np.mean([r["ia_mean"] for r in eval_results]))
            avg_std = float(np.mean([r["ia_std"] for r in eval_results]))
            avg_base = float(np.mean([r["baseline_mean"] for r in eval_results]))
            gap = avg_ia - avg_base

            if val_result["fitness"] > best_fitness_ever:
                best_fitness_ever = float(val_result["fitness"])
                best_weights_ever = best_train_weights.copy()
                best_validation = val_result

                save_json(BEST_MODEL_FILE, best_weights_ever.tolist())

            log_entry = {
                "gen": gen,
                "fitness": avg_fit,
                "best_train_fitness": best_train_fit,
                "best_val_fitness": float(val_result["fitness"]),
                "ia_mean": avg_ia,
                "ia_std": avg_std,
                "baseline_mean": avg_base,
                "gap": gap,
                "sigma": float(optimizer._sigma),
                "gen_time_s": gen_time,
                "eval_seeds": eval_seeds,
                "val_seeds": val_seeds,
            }
            log_entries.append(log_entry)
            log_f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
            log_f.flush()

            rem_h = (MAX_TIME_SECONDS - elapsed) / 3600.0
            print(
                f"Gen {gen:03d} | "
                f"avg_fit={avg_fit:8.1f} | "
                f"best_val={val_result['fitness']:8.1f} | "
                f"IA={avg_ia:8.1f} | "
                f"STD={avg_std:7.1f} | "
                f"Base={avg_base:8.1f} | "
                f"Gap={gap:+8.1f} | "
                f"σ={optimizer._sigma:.4f} | "
                f"restan {rem_h:.2f}h"
            )

            if gen % CHECKPOINT_EVERY == 0:
                generate_pdf_report(
                    {
                        "total_generations": gen,
                        "total_time_min": elapsed / 60.0,
                        "best_fitness": best_fitness_ever if best_fitness_ever != -np.inf else 0.0,
                        "num_params": num_params,
                    },
                    log_entries,
                )

            gen += 1

    except KeyboardInterrupt:
        print("\n🛑 Entrenamiento interrumpido por usuario.")

    finally:
        log_f.close()
        env.close()

        summary = {
            "total_generations": gen,
            "total_time_min": (time.time() - start_time) / 60.0,
            "best_fitness": float(best_fitness_ever if best_fitness_ever != -np.inf else 0.0),
            "num_params": num_params,
            "pop_size": POP_SIZE,
            "sigma_init": SIGMA_INIT,
            "num_eval_seeds": NUM_EVAL_SEEDS,
            "num_val_seeds": NUM_VAL_SEEDS,
            "max_steps_per_ep": MAX_STEPS_PER_EP,
            "best_validation": best_validation,
        }
        save_json(SUMMARY_FILE, summary)
        generate_pdf_report(summary, log_entries)
        print(f"\n📊 Entrenamiento guardado en {RESULTS_DIR}")


if __name__ == "__main__":
    main()
