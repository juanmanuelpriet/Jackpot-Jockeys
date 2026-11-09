# Dibuja la forma del cerebro de cada caballo para el PDF. Uso (desde hipodromo/):
#   python3 -I experimentos/einstein/diagrama.py docs/img
# Deja redes_einstein.png (esquema), redes_casa.png y redes_potros.png (con sus pesos reales: azul suma, rojo resta).
import sys, os, json, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, FancyArrowPatch
VERDE, AMBAR, AMBAR2, ROJO, BORDE, LINEA = '#4CAF50', '#E0A82E', '#D49A22', '#D9434A', '#444441', '#8a8a85'
POS, NEG, GRIS = '#2A6FD0', '#D2453C', '#d8d8d4'
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SALIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'docs', 'img')
ENTRADAS = ['rayo 1', 'rayo 2', 'rayo 3', 'rayo 4', 'rayo 5', 'rival: distancia', 'rival: ángulo', 'rival: velocidad', 'rival: protegido',
            'rabia', 'turbo', 'barro', 'puesto', 'lado del barro', 'peligro', 'agarre', 'viento', 'gravedad',
            'adelante 1', 'adelante 2', 'adelante 3', 'velocidad']
lee = lambda f: json.load(open(os.path.join(RAIZ, f)))

def pila(ax, cx, cy, n, size, off, colores):
    w = size + (n - 1) * off; x0 = cx - w / 2; y0 = cy - (n - 1) * off / 2 - size / 2
    for i in range(n - 1, -1, -1):
        ax.add_patch(Rectangle((x0 + i * off, y0 + i * off), size, size, fc=colores[i % len(colores)], ec=BORDE, lw=.6, zorder=2))
    return x0, y0, x0 + (n - 1) * off + size
def col(x, n, step, cy): return [(x, cy + ((n - 1) / 2 - i) * step) for i in range(n)]
def conecta(ax, A, B, a=.25, r=8):
    for (x1, y1) in A:
        for (x2, y2) in B: ax.plot([x1 + r, x2 - r], [y1, y2], color=LINEA, lw=.5, alpha=a, zorder=1)
def nodos(ax, ps, f, r=8, ec=BORDE):
    for (x, y) in ps: ax.add_patch(Circle((x, y), r, fc=f, ec=ec, lw=.7, zorder=3))
def memoria(ax, g, r=8, alto=46):
    x, y = g[0]
    ax.add_patch(FancyArrowPatch((x + r - 1, y + r), (x - r + 1, y + r), connectionstyle='arc3,rad=1.6', arrowstyle='-|>', mutation_scale=10, color='#C04828', lw=1.2, zorder=4))
    ax.text(x, y + alto, 'memoria', ha='center', fontsize=9)
def etiquetas(ax, L, y, fs=10):
    for x, a, b in L:
        ax.text(x, y, a, ha='center', fontsize=fs, fontweight='bold'); ax.text(x, y - 16, b, ha='center', fontsize=fs - 1)
def pesos(ax, A, B, W, r, top=1.0):
    """Una línea por peso: azul si suma, rojo si resta; más gruesa y oscura cuanto más pesa. Los ceros no se dibujan."""
    m = max(abs(w) for fila in W for w in fila) or 1
    for i, (x1, y1) in enumerate(A):
        for j, (x2, y2) in enumerate(B):
            w = W[i][j]
            if w == 0: continue
            k = min(1, abs(w) / m / top)
            ax.plot([x1 + r, x2 - r], [y1, y2], color=POS if w > 0 else NEG, lw=.25 + 1.6 * k, alpha=.06 + .8 * k, zorder=1)
def fin(fig, ruta, nota):
    fig.text(.5, .01, nota, ha='center', fontsize=9, color='#555')
    fig.tight_layout(rect=[0, .03, 1, 1]); fig.savefig(ruta, dpi=150); plt.close(fig); print(ruta)

# ─── Einstein (esquema: sus 23 498 pesos no caben en un dibujo) ───
fig, ax = plt.subplots(figsize=(11, 5.6))
ix0, iy0, _ = pila(ax, 55, 250, 4, 52, 6, ['#C9BFA8', '#D9534F', '#F0A030', '#3B7DD8'])
c1x, c1y, _ = pila(ax, 150, 250, 8, 40, 4, [AMBAR, AMBAR2])
c2x, c2y, c2r = pila(ax, 238, 250, 16, 24, 2.4, [AMBAR, AMBAR2])
ax.add_patch(Rectangle((ix0 + 14, iy0 + 28), 10, 10, fill=False, ec='#2C2C2A', lw=1.2, zorder=3))
ax.add_patch(Rectangle((c1x + 12, c1y + 20), 8, 8, fill=False, ec='#2C2C2A', lw=1.2, zorder=3))
p1, p2 = (c1x + 20, c1y + 24), (c2x + 8, c2y + 16)
for a, b in (((ix0 + 24, iy0 + 38), p1), ((ix0 + 24, iy0 + 28), p1), ((c1x + 20, c1y + 28), p2), ((c1x + 20, c1y + 20), p2)):
    ax.plot([a[0], b[0]], [a[1], b[1]], color='#2C2C2A', lw=.8, alpha=.7, zorder=5)
d32, num = col(318, 8, 20, 345), col(318, 8, 20, 165)
g1, g2, d16, out = col(400, 8, 26, 255), col(478, 8, 26, 255), col(556, 6, 26, 255), col(630, 2, 40, 255)
for (x, y) in d32: ax.plot([c2r, x - 8], [262, y], color=LINEA, lw=.5, alpha=.45, zorder=1)
conecta(ax, d32 + num, g1, .2); conecta(ax, g1, g2, .28); conecta(ax, g2, d16, .32); conecta(ax, d16, out, .5)
nodos(ax, d32, AMBAR); nodos(ax, num, VERDE); nodos(ax, g1, AMBAR); nodos(ax, g2, AMBAR); nodos(ax, d16, AMBAR); nodos(ax, out, ROJO)
memoria(ax, g1); memoria(ax, g2)
ax.text(645, 275, 'giro', va='center', fontsize=10); ax.text(645, 235, 'gas', va='center', fontsize=10)
ax.text(300, 165, '8 números', ha='right', va='center', fontsize=9)
etiquetas(ax, [(55, 'Vista', '16×16 · 4 canales'), (150, 'Conv + pool', '8 mapas 8×8'), (238, 'Conv + pool', '16 mapas 4×4'),
               (318, 'Densa 32', '+ 8 números'), (400, 'GRU 1', '32'), (478, 'GRU 2', '32'), (556, 'Densa', '16'), (630, 'Salida', '2')], 50)
ax.text(30, 440, 'Einstein: 23 498 pesos', fontsize=12, fontweight='bold')
for k, (c, t) in enumerate((('#C9BFA8', 'pista'), ('#D9534F', 'vallas'), ('#F0A030', 'peligros'), ('#3B7DD8', 'rivales'))):
    ax.add_patch(Rectangle((30 + k * 75, 408), 10, 10, fc=c, ec=BORDE, lw=.6)); ax.text(45 + k * 75, 413, t, va='center', fontsize=9)
ax.set_xlim(10, 680); ax.set_ylim(15, 460); ax.set_aspect('equal'); ax.axis('off')
fin(fig, os.path.join(SALIDA, 'redes_einstein.png'),
    'Esquema: 8 neuronas por capa en vez de 32. Cada línea es un peso; la flecha curva es la memoria de la GRU.')

# ─── La casa: misma forma (22 → GRU 32 → 2), cuatro personalidades con pesos distintos ───
casa = lee('perfiles_gru.json')
NOMBRES = [('corredor', 'Corredor', 'limpio y constante'), ('picaro', 'Pícaro', 'empuja a veces'),
           ('bravo', 'Bravo', 'busca pelea'), ('muybravo', 'Muy bravo', 'todo o nada')]
fig, axs = plt.subplots(2, 2, figsize=(11, 11.5))
for ax, (k, nombre, tag) in zip(axs.flat, NOMBRES):
    gru, den = casa[k + '.1']
    u = len(gru['b']) // 3
    ent, g, sal = col(120, 22, 13, 160), col(270, u, 8.6, 160), col(380, 2, 60, 160)
    cand = [fila[2 * u:3 * u] for fila in gru['W'][:22]]             # lo que cada entrada aporta a la idea nueva de la GRU
    pesos(ax, ent, g, cand, 4, .6); pesos(ax, g, sal, den['W'], 4)
    oido = [sum(abs(w) for w in fila) for fila in gru['W'][:22]]   # cuánto escucha cada entrada (todas las compuertas)
    mo = max(oido)
    for (x, y), o, t in zip(ent, oido, ENTRADAS):
        ax.add_patch(Rectangle((x - 12 - 30 * o / mo, y - 3), 30 * o / mo, 6, fc='#9b9b94', ec='none', zorder=2))
        ax.text(x - 46, y, t, ha='right', va='center', fontsize=7)
    nodos(ax, ent, VERDE, 4); nodos(ax, g, AMBAR, 3.4); nodos(ax, sal, ROJO, 6)
    memoria(ax, g, 3.4, 28)
    ax.text(392, 190, 'giro', va='center', fontsize=9); ax.text(392, 130, 'gas', va='center', fontsize=9)
    top = sorted(range(22), key=lambda i: -oido[i])[:3]
    ax.text(5, 335, f'{nombre}: {tag}', fontsize=12, fontweight='bold')
    ax.text(5, 318, 'escucha más: ' + ', '.join(ENTRADAS[i] for i in top), fontsize=9, color='#333')
    etiquetas(ax, [(120, 'Entrada', '22'), (270, 'GRU', f'{u} con memoria'), (380, 'Salida', '2')], -10, 9)
    ax.set_xlim(0, 420); ax.set_ylim(-35, 345); ax.set_aspect('equal'); ax.axis('off')
fin(fig, os.path.join(SALIDA, 'redes_casa.png'),
    'Pesos reales del caballo .1 de cada línea (el .2 tiene la misma forma). Azul suma, rojo resta; la barra gris es cuánto escucha cada entrada.')

# ─── Los potros: perceptrón 22 → 8 → 3 → 3 → 2, todos los pesos ───
POTROS = [('caballos_corredor.json', 'Potro corredor', 'el que dejan los entrenamientos de corredor'),
          ('caballos_bravo_100.json', 'Potro bravo', 'el que dejan los entrenamientos de bravo')]
fig, axs = plt.subplots(1, 2, figsize=(11, 6.6))
for ax, (f, nombre, tag) in zip(axs, POTROS):
    red = lee(f)[0]
    W0 = red[0]['W'] + [[0] * len(red[0]['b'])] * (22 - len(red[0]['W']))  # como upgradeBrain: entradas nuevas en cero
    capas = [col(120, 22, 13, 160)] + [col(x, len(l['b']), s, 160) for x, l, s in zip((215, 290, 350, 410), red, (34, 50, 50, 60))]
    for i, l in enumerate(red): pesos(ax, capas[i], capas[i + 1], W0 if i == 0 else l['W'], 4 if i == 0 else 6)
    usa = [any(w != 0 for w in fila) for fila in W0]
    for (x, y), t, u in zip(capas[0], ENTRADAS, usa):
        ax.add_patch(Circle((x, y), 4, fc=VERDE if u else 'white', ec=BORDE if u else '#aaa', lw=.7, zorder=3))
        ax.text(x - 9, y, t, ha='right', va='center', fontsize=7, color='#222' if u else '#999')
    for c in capas[1:-1]: nodos(ax, c, AMBAR, 6)
    nodos(ax, capas[-1], ROJO, 6)
    ax.text(422, 190, 'giro', va='center', fontsize=9); ax.text(422, 130, 'gas', va='center', fontsize=9)
    npes = sum(len(l['b']) * (len(l['W']) + 1) for l in red) + (22 - len(red[0]['W'])) * len(red[0]['b'])
    ax.text(5, 335, f'{nombre}: {npes} pesos', fontsize=12, fontweight='bold'); ax.text(5, 318, tag, fontsize=9, color='#333')
    etiquetas(ax, [(120, 'Entrada', '22'), (215, 'Densa', '8'), (290, 'Densa', '3'), (350, 'Densa', '3'), (410, 'Salida', '2')], -10, 9)
    ax.set_xlim(0, 450); ax.set_ylim(-35, 345); ax.set_aspect('equal'); ax.axis('off')
fin(fig, os.path.join(SALIDA, 'redes_potros.png'),
    'Todos los pesos reales. Sin memoria: decide solo con lo que ve ahora. Las entradas en blanco nacieron después que el potro y le llegan con peso 0.')
