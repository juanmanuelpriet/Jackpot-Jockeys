# Qué mira Einstein: Grad-CAM, saliencia y cuánto atrás mira, sobre carreras grabadas con graba.js.
# python3 -I gradcam.py <einstein.json> <grabación sin extensión> <carpeta de figuras> [quitar.json: victorias de analiza.js]
import sys, json, numpy as np, torch, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
red_f, rec, out = sys.argv[1:4]
torch.manual_seed(0); np.random.seed(0)
V, NS, U = 16, 8, 32

class Celda(torch.nn.Module):  # igual que gruStep de sim.js (y que entrena.py)
    def __init__(s, n, u):
        super().__init__(); s.n, s.u = n, u
        s.W = torch.nn.Parameter(torch.zeros(n + u, 3 * u)); s.b = torch.nn.Parameter(torch.zeros(3 * u))
    def forward(s, x, h):
        u = s.u; Wx, Wh = s.W[:s.n], s.W[s.n:]; xw = x @ Wx; hw = h @ Wh
        z = torch.sigmoid(s.b[:u] + xw[:, :u] + hw[:, :u]); r = torch.sigmoid(s.b[u:2*u] + xw[:, u:2*u] + hw[:, u:2*u])
        c = torch.tanh(s.b[2*u:] + xw[:, 2*u:] + (r * h) @ Wh[:, 2*u:])
        return (1 - z) * h + z * c

class Einstein(torch.nn.Module):
    def __init__(s):
        super().__init__()
        s.c1 = torch.nn.Conv2d(4, 8, 3, padding=1); s.c2 = torch.nn.Conv2d(8, 16, 3, padding=1)
        s.proy = torch.nn.Linear(256, 32); s.g1 = Celda(32 + NS, U); s.g2 = Celda(U, U)
        s.d1 = torch.nn.Linear(U, 16); s.d2 = torch.nn.Linear(16, 2)
    def carga(s, j):
        with torch.no_grad():
            for c, l in zip((s.c1, s.c2), j['conv']):
                c.weight.copy_(torch.tensor(l['W']).reshape(c.weight.shape)); c.bias.copy_(torch.tensor(l['b']))
            for m, l in zip((s.proy, s.d1, s.d2), (j['proy'], *j['densa'])):
                m.weight.copy_(torch.tensor(l['W']).t()); m.bias.copy_(torch.tensor(l['b']))
            for c, l in zip((s.g1, s.g2), j['gru']):
                c.W.copy_(torch.tensor(l['W'])); c.b.copy_(torch.tensor(l['b']))
    # Una ventana de T ticks desde un estado de memoria; devuelve salidas y la activación de la 1.ª convolución (antes del pooling)
    def corre(s, G, S, h1, h2):
        a1 = torch.relu(s.c1(G))
        if a1.requires_grad: a1.retain_grad()
        x = torch.nn.functional.max_pool2d(a1, 2)
        x = torch.nn.functional.max_pool2d(torch.relu(s.c2(x)), 2)
        v = torch.tanh(s.proy(x.flatten(1))); ys = []
        for t in range(len(S)):
            h1 = s.g1(torch.cat([v[t:t+1], S[t:t+1]], 1), h1); h2 = s.g2(h1, h2)
            ys.append(torch.tanh(s.d2(torch.tanh(s.d1(h2)))))
        return torch.cat(ys), a1, h1, h2

m = Einstein().double(); m.carga(json.load(open(red_f))); m.eval()
meta = json.load(open(rec + '.json')); F = np.array(meta['filas'], float); cols = {c: i for i, c in enumerate(meta['cols'])}
Gall = np.fromfile(rec + '.vis', dtype=np.float32).reshape(-1, 4, V, V).astype(float)
Sall = F[:, cols['s0']:cols['s7'] + 1]; carr = F[:, 0].astype(int)

# Estados de memoria de cada tick (sin gradiente) y comprobación contra lo que decidió en el juego
estados, err = {}, 0
with torch.no_grad():
    for c in np.unique(carr):
        idx = np.where(carr == c)[0]; h1 = torch.zeros(1, U, dtype=torch.double); h2 = h1.clone()
        y, _, _, _ = m.corre(torch.tensor(Gall[idx]), torch.tensor(Sall[idx]), h1, h2)
        err = max(err, float(np.abs(y.numpy() - F[idx][:, [cols['giro'], cols['gas']]]).max()))
        # memoria al empezar cada tick: se recalcula paso a paso para poder arrancar ventanas en cualquier punto
        G_ = torch.tensor(Gall[idx]); S_ = torch.tensor(Sall[idx])
        x = torch.nn.functional.max_pool2d(torch.relu(m.c1(G_)), 2); x = torch.nn.functional.max_pool2d(torch.relu(m.c2(x)), 2)
        v = torch.tanh(m.proy(x.flatten(1)))
        for t, i in enumerate(idx):
            estados[i] = (h1, h2)
            h1 = m.g1(torch.cat([v[t:t+1], S_[t:t+1]], 1), h1); h2 = m.g2(h1, h2)
print('diferencia con el juego', f'{err:.1e}')
if err > 1e-3: sys.exit('el modelo no reproduce al juego')

ATRAS = 30  # ventana: 30 ticks (1 s) antes del momento estudiado
def explica(i, salida):
    """Grad-CAM (1.ª convolución), gradiente×entrada por canal y por tick hacia atrás, para giro (0) o gas (1) en el tick i."""
    c = carr[i]; i0 = max(i - ATRAS, int(np.where(carr == c)[0][0]))
    G = torch.tensor(Gall[i0:i + 1], requires_grad=True); S = torch.tensor(Sall[i0:i + 1], requires_grad=True)
    h1, h2 = estados[i0]
    y, a1, _, _ = m.corre(G, S, h1, h2)
    obj = y[-1, salida] * (np.sign(y[-1, salida].item()) or 1) if salida == 0 else y[-1, 1]  # el giro, hacia donde gira
    obj.backward()
    A, gA = a1[-1].detach().numpy(), a1.grad[-1].numpy()
    cam = np.maximum((gA.mean((1, 2))[:, None, None] * A).sum(0), 0)
    gi = (G.grad * G).detach().numpy()          # gradiente × entrada
    explica.sens = np.abs(G.grad[-1].numpy()).sum((1, 2))  # sensibilidad: cuánto cambiaría si apareciera algo en ese canal
    return cam, gi[-1], np.abs(gi).sum((1, 2, 3))[::-1], np.abs((S.grad * S).detach().numpy()[-1]), y[-1].detach().numpy()

# ─── Momentos típicos ───
fila = lambda i, k: F[i, cols[k]]
def proximo(k, dt=6):
    return [i for i in range(len(F) - dt) if carr[i + dt] == carr[i] and F[i + dt, cols[k]] > F[i, cols[k]] and F[i, cols[k]] == F[i - 1, cols[k]]]
delante = lambda i, ch: Gall[i, ch, 3:10, 4:12].max()
cand = {
    'Antes de saltar': proximo('saltos', 5),
    'Esquivando': proximo('esquivas', 3),
    'Curva cerrada': [i for i in range(len(F)) if abs(F[i, cols['giro']]) > .9 and delante(i, 1) == 0 and delante(i, 2) == 0 and delante(i, 3) == 0 and Gall[i, 0, 2:12, 4:12].mean() < .7],
    'Rival delante': [i for i in range(len(F)) if delante(i, 3) > 0 and delante(i, 1) == 0 and delante(i, 2) == 0],
    'Recta a fondo': [i for i in range(len(F)) if abs(F[i, cols['giro']]) < .1 and F[i, cols['gas']] > .9 and Gall[i, 0, 2:16, 5:11].min() == 1 and delante(i, 1) == 0 and delante(i, 2) == 0],
    'Peligro delante': [i for i in range(len(F)) if delante(i, 2) >= .5 and delante(i, 1) == 0],
}
elegidos = {k: v[len(v) // 2] for k, v in cand.items() if v}
print({k: len(v) for k, v in cand.items()})

def foto(g):
    """Lo que ve, en colores: pista gris, fuera verde oscuro, niebla negra, vallas rojas, peligros naranja, rivales azul."""
    img = np.zeros((V, V, 3))
    img[g[0] == 1] = (.78, .74, .66); img[g[0] == 0] = (.16, .32, .18); img[g[0] == .5] = (0.05, .05, .05)
    for ch, col in ((1, (.85, .1, .1)), (2, (1, .55, 0)), (3, (.15, .35, 1))):
        a = g[ch][..., None]; img = img * (1 - a) + np.array(col) * a
    return img

caballo = lambda ax: ax.plot([7.5], [1.5], marker='^', ms=11, mfc='white', mec='black')
fig, axs = plt.subplots(len(elegidos), 3, figsize=(9.5, 3.1 * len(elegidos)))
for fi, (nombre, i) in enumerate(elegidos.items()):
    camg, _, _, _, y = explica(i, 0); camv, _, _, _, _ = explica(i, 1)
    for k, (titulo, cam) in enumerate((('Lo que ve', None), (f'Para girar ({y[0]:+.2f})', camg), (f'Para el acelerador ({y[1]:+.2f})', camv))):
        ax = axs[fi, k]; ax.imshow(foto(Gall[i]), origin='lower', interpolation='nearest')
        if cam is not None: ax.imshow(cam / (cam.max() + 1e-9), origin='lower', cmap='magma', alpha=.6, interpolation='bilinear')
        caballo(ax); ax.set_xticks([]); ax.set_yticks([])
        ax.set_title(titulo, fontsize=10); 
        if k == 0: ax.set_ylabel(f'{nombre}\n({meta["mundos"][carr[i]]})', fontsize=10)
fig.suptitle('Grad-CAM de Einstein: dónde mira (más claro = pesa más). Él es el triángulo; adelante es arriba.', fontsize=11)
fig.tight_layout(rect=[0, 0, 1, 0.985]); fig.savefig(out + '/gradcam_momentos.png', dpi=130); plt.close(fig)

# ─── Promedios sobre 1.500 ticks al azar ───
muestra = np.random.choice(len(F), 1500, replace=False)
canales = ['Pista', 'Vallas', 'Peligros', 'Rivales']; numeros = ['Rival', 'Furia', 'Impulso', 'Puesto', 'Agarre', 'Viento', 'Salto', 'Velocidad']
res = {}
for salida, nom in ((0, 'giro'), (1, 'gas')):
    mapa, tiempo, nums, cams, sens = np.zeros((4, V, V)), np.zeros(ATRAS + 1), np.zeros(NS), np.zeros((V, V)), np.zeros(4)
    for i in muestra:
        cam, gi, tt, gs, _ = explica(i, salida)
        mapa += np.abs(gi); tl = np.zeros(ATRAS + 1); tl[:len(tt)] = tt; tiempo += tl; nums += gs; cams += cam / (cam.max() + 1e-9); sens += explica.sens
    res[nom] = dict(mapa=mapa / len(muestra), tiempo=tiempo / len(muestra), nums=nums / len(muestra), cam=cams / len(muestra), sens=sens / sens.sum() * 100)

fig, axs = plt.subplots(2, 5, figsize=(13, 6.2))
for f, nom in enumerate(('giro', 'gas')):
    r = res[nom]
    for ch in range(4):
        ax = axs[f, ch]; ax.imshow(r['mapa'][ch], origin='lower', cmap='magma', interpolation='nearest'); caballo(ax)
        ax.set_xticks([]); ax.set_yticks([]); ax.set_title(f'{canales[ch]} ({r["mapa"][ch].sum() / r["mapa"].sum() * 100:.0f} %)', fontsize=10)
    axs[f, 0].set_ylabel('Giro' if f == 0 else 'Acelerador', fontsize=11)
    ax = axs[f, 4]; ax.imshow(r['cam'], origin='lower', cmap='magma', interpolation='bilinear'); caballo(ax); ax.set_xticks([]); ax.set_yticks([]); ax.set_title('Grad-CAM promedio', fontsize=10)
fig.suptitle('Saliencia promedio (|gradiente × entrada|) en 1.500 momentos: qué celdas de cada canal mueven su decisión\n(cada mapa con su propia escala; entre paréntesis, su parte del total)', fontsize=11)
fig.tight_layout(rect=[0, 0, 1, 0.97], h_pad=2.2); fig.savefig(out + '/saliencia_promedio.png', dpi=130); plt.close(fig)

fig, axs = plt.subplots(1, 3, figsize=(15, 4.2))
for nom, col in (('giro', '#c8102e'), ('gas', '#2f5fb3')):
    t = res[nom]['tiempo']; axs[0].plot(np.arange(ATRAS + 1), t / t[0], color=col, lw=2, label='Giro' if nom == 'giro' else 'Acelerador')
axs[0].set_xlabel('Ticks hacia atrás (30 = 1 s)'); axs[0].set_ylabel('Peso de lo que vio entonces\n(1 = lo que ve ahora)'); axs[0].set_yscale('log'); axs[0].legend(); axs[0].grid(alpha=.3)
axs[0].set_title('¿Cuánto atrás mira? (memoria)')
w = .38; x = np.arange(4)
for k, (nom, col) in enumerate((('giro', '#c8102e'), ('gas', '#2f5fb3'))):
    axs[1].bar(x + (k - .5) * w, res[nom]['sens'], w, color=col, label='Giro' if nom == 'giro' else 'Acelerador')
axs[1].set_xticks(x); axs[1].set_xticklabels(canales); axs[1].set_ylabel('% de la sensibilidad'); axs[1].legend()
axs[1].set_title('Sensibilidad de cada canal (|gradiente|)')
# Lo medido con analiza.js (300 carreras): victorias sin cada cosa
abl = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
if abl:
    nombres = [k for k in abl if k != 'Nada']; base = abl['Nada']
    axs[2].barh(nombres, [abl[k] - base for k in nombres], color=['#555' if abl[k] - base > -3 else '#c8102e' for k in nombres])
    axs[2].axvline(0, color='k', lw=.8); axs[2].invert_yaxis(); axs[2].set_xlabel(f'Puntos de victoria (con todo gana {base} %)')
    axs[2].set_title('Si se le quita… (carreras de verdad)')
fig.tight_layout(); fig.savefig(out + '/tiempo_y_canales.png', dpi=130); plt.close(fig)

resumen = {nom: dict(canales={c: round(float(res[nom]['mapa'][k].sum() / (res[nom]['mapa'].sum() + res[nom]['nums'].sum()) * 100), 1) for k, c in enumerate(canales)},
                     numeros={c: round(float(res[nom]['nums'][k] / (res[nom]['mapa'].sum() + res[nom]['nums'].sum()) * 100), 1) for k, c in enumerate(numeros)},
                     tiempo=[round(float(v), 4) for v in res[nom]['tiempo'] / res[nom]['tiempo'][0]],
                     filas_delante=round(float(res[nom]['mapa'][:, 2:].sum() / res[nom]['mapa'].sum() * 100), 1),
                     cerca=round(float(res[nom]['mapa'][:, 2:8].sum() / res[nom]['mapa'][:, 2:].sum() * 100), 1), sensibilidad={c: round(float(res[nom]['sens'][k]), 1) for k, c in enumerate(canales)}) for nom in res}
json.dump(resumen, open(out + '/resumen.json', 'w'), indent=1, ensure_ascii=False)
print(json.dumps(resumen, ensure_ascii=False))
