"""
Entrenamiento de 5 minutos CMA-ES para NeuralAgent
Registra el progreso y guarda las métricas en un PDF final.
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
    from cmaes import CMA
    from godot_env import GodotRaceEnv
    from models.policy_network import RacerPolicy
except ImportError as e:
    print(f"Error al importar dependencias: {e}")
    print("Asegúrate de estar en el directorio correcto y tener las dependencias instaladas.")
    sys.exit(1)

# ─── Configuración ──────────────────────────────────────────────────────────
MAX_TIME_SECONDS  = 300       # 5 minutos
POP_SIZE          = 4         # individuos por generación
NUM_EVAL_SEEDS    = 1         # semillas por evaluación
MAX_STEPS_PER_EP  = 500       
SIGMA_INIT        = 0.15
CHECKPOINT_EVERY  = 2
RESULTS_DIR       = "results/train_5min"
LOG_FILE          = "results/train_5min/log_entrenamiento.jsonl"
# Ruta absoluta para la carpeta math
BASE_DIR          = "/Users/juanmanuelprieto/Documents/entorno_jackpot"
MATH_DIR          = os.path.join(BASE_DIR, "math")
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_genome(weights, env, policy):
    """Evalúa un conjunto de pesos. Retorna el fitness."""
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
        
        # Fitness multi-objetivo
        fitness = (
            ep_progress * 1000.0           # premiar progreso
            + ep_reward * 10.0             # señal de recompensa
            - ep_collisions * 50.0         # penalizar colisiones
            - ep_off_track_steps * 1.0     # penalizar fuera de pista
            - ep_stuck_steps * 3.0         # penalizar atascado
        )
        seed_fitnesses.append(fitness)
    
    mean_f = np.mean(seed_fitnesses)
    std_f  = np.std(seed_fitnesses)
    return mean_f - 0.3 * std_f


def generate_pdf_report(summary, log_entries):
    """Genera un reporte LaTeX y lo compila a PDF."""
    os.makedirs(MATH_DIR, exist_ok=True)
    tex_path = os.path.join(MATH_DIR, "resultados.tex")
    
    # Escapar caracteres especiales de LaTeX si fuera necesario, pero aquí los valores son numéricos
    
    tex_content = r"""
\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{geometry}
\usepackage{booktabs}
\usepackage{xcolor}
\geometry{a4paper, margin=1in}

\title{\color{blue}Resultados del Entrenamiento AG-RACE \\ \large(Sesión de 5 Minutos)}
\author{Antigravity AI Assistant}
\date{\today}

\begin{document}

\maketitle

\section{Resumen del Entrenamiento}
Este documento contiene las métricas finales del entrenamiento realizado por el agente neuronal utilizando el algoritmo CMA-ES.

\begin{itemize}
    \item \textbf{Generaciones totales:} """ + str(summary['total_generations']) + r"""
    \item \textbf{Tiempo total de ejecución:} """ + f"{summary['total_time_min']:.2f}" + r""" minutos
    \item \textbf{Mejor fitness (aptitud) alcanzado:} """ + f"{summary['best_fitness']:.2f}" + r"""
    \item \textbf{Tamaño de la población:} """ + str(summary['pop_size']) + r""" individuos
    \item \textbf{Número de parámetros en la red:} """ + str(summary['num_params']) + r"""
    \item \textbf{Sigma inicial ($\sigma$):} """ + str(summary['sigma_init']) + r"""
\end{itemize}

\section{Historial de Evolución}
A continuación se detallan las últimas generaciones del proceso:

\begin{table}[h!]
\centering
\begin{tabular}{@{}cccccc@{}}
\toprule
\textbf{Gen} & \textbf{Máx Fitness} & \textbf{Promedio} & \textbf{Mínimo} & \textbf{Sigma} & \textbf{Tiempo (s)} \\ \midrule
"""
    # Agregar las últimas 25 generaciones para no saturar
    relevant_entries = log_entries[-25:]
    for entry in relevant_entries:
        tex_content += f"{entry['gen']} & {entry['max_fitness']:.2f} & {entry['avg_fitness']:.2f} & {entry['min_fitness']:.2f} & {entry['sigma']:.4f} & {entry['gen_time_s']:.1f} \\\\\n"

    tex_content += r"""
\bottomrule
\end{tabular}
\caption{Métricas de las últimas generaciones registradas.}
\end{table}

\section{Conclusión}
El entrenamiento se ha completado dentro del límite de 5 minutos establecido. El modelo con el mejor desempeño ha sido guardado exitosamente en formato JSON para su posterior despliegue en el hipódromo de Godot.

\end{document}
"""
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(tex_content)
    
    print(f"📄 Archivo LaTeX creado en {tex_path}. Compilando...")
    
    try:
        # Ejecutar pdflatex dos veces para asegurar referencias (aunque aquí no hay muchas)
        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "resultados.tex"],
            cwd=MATH_DIR,
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            print(f"✅ PDF generado exitosamente: {os.path.join(MATH_DIR, 'resultados.pdf')}")
        else:
            print(f"⚠️ pdflatex terminó con advertencias o errores parciales.")
            print(result.stdout[-500:]) # Mostrar el final del log
    except FileNotFoundError:
        print("❌ Error: 'pdflatex' no encontrado en el sistema. No se pudo generar el PDF.")
    except Exception as e:
        print(f"❌ Error inesperado al compilar PDF: {e}")


def main():
    os.makedirs(RESULTS_DIR, exist_ok=True)
    
    # Construir política para contar parámetros
    policy = RacerPolicy()
    dummy = np.zeros((1, 59), dtype=np.float32)
    _ = policy(dummy)
    num_params = policy.count_parameters()
    
    print(f"╔═══════════════════════════════════════════╗")
    print(f"║   Entrenamiento NeuralAgent AG-RACE       ║")
    print(f"║   Algoritmo: CMA-ES | Parámetros: {num_params:4d}    ║")
    print(f"║   Pob: {POP_SIZE} | Semillas: {NUM_EVAL_SEEDS} | Tiempo: 5 min ║")
    print(f"╚═══════════════════════════════════════════╝")
    
    # Inicializar CMA-ES
    mean = np.zeros(num_params)
    optimizer = CMA(mean=mean, sigma=SIGMA_INIT, population_size=POP_SIZE)
    
    # Inicializar Entorno (Visible)
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
                print(f"\n⏰ Límite de tiempo alcanzado ({elapsed/60:.1f} min).")
                break
            
            gen_start = time.time()
            
            # Obtener candidatos
            print(f"Gen {gen:3d} | Calculando candidatos CMA-ES...")
            solutions = [optimizer.ask() for _ in range(optimizer.population_size)]
            
            # Evaluar candidatos
            fitnesses = []
            print(f"Gen {gen:3d} | Evaluando: ", end="", flush=True)
            for i, x in enumerate(solutions):
                f = evaluate_genome(x, env, policy)
                fitnesses.append(f)
                print(f"[{i+1}/{POP_SIZE}] ", end="", flush=True)
            print(" | ", end="")
            
            # Informar a CMA-ES
            optimizer.tell([(x, -f) for x, f in zip(solutions, fitnesses)])
            
            gen_time = time.time() - gen_start
            max_f = max(fitnesses)
            avg_f = np.mean(fitnesses)
            min_f = min(fitnesses)
            
            # Guardar mejor global
            if max_f > best_fitness_ever:
                best_fitness_ever = max_f
                best_idx = np.argmax(fitnesses)
                best_weights_ever = solutions[best_idx].copy()
                with open(f"{RESULTS_DIR}/pesos_optimos.json", "w") as wf:
                    json.dump(best_weights_ever.tolist(), wf)
            
            # Registro de log
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
            log_entries.append(log_entry)
            log_f.write(json.dumps(log_entry) + "\n")
            log_f.flush()
            
            remaining = (MAX_TIME_SECONDS - elapsed) / 60.0
            print(f"Máx: {max_f:8.2f} | Prom: {avg_f:8.2f} | Mejor: {best_fitness_ever:8.2f} | σ={optimizer._sigma:.4f} | {gen_time:.1f}s | {remaining:.1f} min")
            
            if gen % CHECKPOINT_EVERY == 0 and gen > 0:
                ckpt_path = f"{RESULTS_DIR}/punto_control_gen{gen}.json"
                with open(ckpt_path, "w") as wf:
                    json.dump(best_weights_ever.tolist(), wf)
                print(f"  💾 Punto de control guardado: {ckpt_path}")
            
            gen += 1
            
    except KeyboardInterrupt:
        print("\n🛑 Entrenamiento interrumpido por el usuario.")
    finally:
        log_f.close()
        env.close()
        
        # Guardar resumen final
        if best_weights_ever is not None:
            final_path = f"{RESULTS_DIR}/pesos_finales.json"
            with open(final_path, "w") as wf:
                json.dump(best_weights_ever.tolist(), wf)
            print(f"\n✅ Entrenamiento finalizado tras {gen} generaciones ({(time.time()-start_time)/60:.1f} min)")
            print(f"   Mejor fitness obtenido: {best_fitness_ever:.2f}")
        
        mejor_f = best_fitness_ever if best_fitness_ever != -np.inf else 0.0
        
        summary = {
            "total_generations": gen,
            "total_time_min": (time.time() - start_time) / 60.0,
            "best_fitness": float(mejor_f),
            "num_params": num_params,
            "pop_size": POP_SIZE,
            "num_seeds": NUM_EVAL_SEEDS,
            "sigma_init": SIGMA_INIT,
        }
        with open(f"{RESULTS_DIR}/resumen_final.json", "w") as sf:
            json.dump(summary, sf, indent=2)
            
        print("\n📊 Generando reporte PDF en la carpeta 'math'...")
        generate_pdf_report(summary, log_entries)

if __name__ == "__main__":
    main()
