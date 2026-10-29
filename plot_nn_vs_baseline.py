"""
plot_nn_vs_baseline.py
──────────────────────
Compara el desempeño de las redes neuronales evolucionadas (best_fitness)
contra el baseline (avg_progress: promedio del grupo sin selección).

Genera: nn_vs_baseline.png
"""

import csv
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.ticker import MaxNLocator

CSV_PATH = "training_log.csv"
OUTPUT   = "nn_vs_baseline.png"

# ── 1. Leer datos ─────────────────────────────────────────────────────────────
generations, best_fitness, avg_progress = [], [], []

with open(CSV_PATH, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            generations.append(int(row['generation']))
            best_fitness.append(float(row['best_fitness']))
            avg_progress.append(float(row['avg_progress']))
        except (ValueError, KeyError):
            continue

gens = np.array(generations)
bf   = np.array(best_fitness)
ap   = np.array(avg_progress)

# ── 2. Suavizado (media móvil) ────────────────────────────────────────────────
def moving_avg(arr, window=20):
    weights = np.ones(window) / window
    smoothed = np.convolve(arr, weights, mode='valid')
    pad = np.full(window - 1, np.nan)
    return np.concatenate([pad, smoothed])

bf_smooth = moving_avg(bf, 20)
ap_smooth = moving_avg(ap, 20)

# ── 3. Estilo ─────────────────────────────────────────────────────────────────
plt.style.use('dark_background')
ACCENT_NN   = '#00E5FF'   # cian eléctrico — redes neuronales
ACCENT_BASE = '#FF6B6B'   # coral  — baseline
GOLD        = '#FFD700'
BG          = '#0D1117'
PANEL_BG    = '#161B22'

fig = plt.figure(figsize=(16, 9), facecolor=BG)
fig.subplots_adjust(left=0.07, right=0.97, top=0.88, bottom=0.12)

ax = fig.add_subplot(111, facecolor=PANEL_BG)

# ── Relleno entre curvas ──────────────────────────────────────────────────────
ax.fill_between(gens, ap, bf, where=(bf >= ap),
                alpha=0.12, color=ACCENT_NN, label='_nolegend_')
ax.fill_between(gens, ap, bf, where=(bf < ap),
                alpha=0.12, color=ACCENT_BASE, label='_nolegend_')

# ── Líneas brutas (muy tenues) ────────────────────────────────────────────────
ax.plot(gens, bf, color=ACCENT_NN,  alpha=0.18, linewidth=0.7)
ax.plot(gens, ap, color=ACCENT_BASE, alpha=0.18, linewidth=0.7)

# ── Líneas suavizadas ─────────────────────────────────────────────────────────
ax.plot(gens, bf_smooth, color=ACCENT_NN,  linewidth=2.6,
        label='Red Neuronal Evolucionada  (best fitness)', zorder=5)
ax.plot(gens, ap_smooth, color=ACCENT_BASE, linewidth=2.6,
        label='Baseline  (avg progress población)', zorder=5)

# ── Línea de mejor histórico ──────────────────────────────────────────────────
all_time_best = np.max(bf)
idx_best      = np.argmax(bf)
ax.axhline(all_time_best, color=GOLD, linewidth=1.0, linestyle='--', alpha=0.7,
           label=f'Máx. histórico: {all_time_best:,.0f}  (Gen {gens[idx_best]})')
ax.scatter([gens[idx_best]], [all_time_best], color=GOLD, s=90, zorder=10)

# ── Anotación peak ────────────────────────────────────────────────────────────
ax.annotate(
    f"  ★ {all_time_best:,.0f}\n  Gen {gens[idx_best]}",
    xy=(gens[idx_best], all_time_best),
    xytext=(gens[idx_best] + len(gens)*0.03, all_time_best * 0.97),
    color=GOLD, fontsize=10, fontweight='bold',
    arrowprops=dict(arrowstyle='->', color=GOLD, lw=1.2)
)

# ── Banda de mejora significativa (percentil 75 de best_fitness) ──────────────
p75 = np.percentile(bf, 75)
ax.axhline(p75, color='#888', linewidth=0.7, linestyle=':', alpha=0.55)
ax.text(gens[-1]*0.01, p75 + all_time_best*0.01,
        f'P75 NN = {p75:,.0f}', color='#888', fontsize=8)

# ── Shading de "generaciones tempranas" ──────────────────────────────────────
early_gen = min(50, len(gens)//4)
ax.axvspan(gens[0], gens[early_gen-1], alpha=0.07, color='white',
           label='Fase de exploración inicial')

# ── Cuadrícula y ejes ─────────────────────────────────────────────────────────
ax.grid(True, color='#2D333B', linewidth=0.6, linestyle='--')
ax.set_xlim(gens[0], gens[-1])
ax.set_ylim(0, all_time_best * 1.12)
ax.xaxis.set_major_locator(MaxNLocator(integer=True, nbins=12))
ax.yaxis.set_major_locator(MaxNLocator(nbins=8))

ax.tick_params(colors='#8B949E', labelsize=10)
for spine in ax.spines.values():
    spine.set_edgecolor('#30363D')

ax.set_xlabel("Generación", color='#C9D1D9', fontsize=13, labelpad=8)
ax.set_ylabel("Puntuación  (score / fitness)", color='#C9D1D9', fontsize=13, labelpad=8)

# ── Título ────────────────────────────────────────────────────────────────────
fig.text(0.5, 0.94, "Red Neuronal Evolucionada  vs  Baseline",
         ha='center', va='center', fontsize=20, fontweight='bold', color='white')
fig.text(0.5, 0.905,
         f"Algoritmo Genético · {len(gens)} generaciones · {30} coches/gen · "
         f"MUTATION_RATE=0.7 · Arquitectura 5→5→3→3→2",
         ha='center', va='center', fontsize=11, color='#8B949E', style='italic')

# ── Leyenda ───────────────────────────────────────────────────────────────────
leg = ax.legend(loc='upper left', framealpha=0.35,
                facecolor=PANEL_BG, edgecolor='#30363D',
                fontsize=10, labelcolor='white', handlelength=2.2)

# ── Estadísticas en recuadro ──────────────────────────────────────────────────
stats_text = (
    f"ESTADÍSTICAS FINALES (últimas 50 gens)\n"
    f"─────────────────────────────────────\n"
    f"  NN  media:   {np.mean(bf[-50:]):>8.1f}\n"
    f"  NN  máx:     {np.max(bf[-50:]):>8.1f}\n"
    f"  Base media:  {np.mean(ap[-50:]):>8.1f}\n"
    f"  Mejora rel:  {((np.mean(bf[-50:])/np.mean(ap[-50:]))-1)*100:>7.1f}%"
)
props = dict(boxstyle='round,pad=0.6', facecolor=PANEL_BG,
             edgecolor='#30363D', alpha=0.85)
ax.text(0.975, 0.04, stats_text, transform=ax.transAxes,
        fontsize=8.5, verticalalignment='bottom', horizontalalignment='right',
        color='#C9D1D9', fontfamily='monospace', bbox=props)

plt.savefig(OUTPUT, dpi=150, bbox_inches='tight', facecolor=BG)
print(f"✅  Gráfico guardado en: {OUTPUT}")
plt.close()
