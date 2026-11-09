# Entrena a Einstein para copiar a su maestro, con el mismo cálculo y formato que usa el juego (sim.js, einsteinStep).
# python3 entrena.py <carpeta con d*.bin y d*.vis> <pasos> <semilla> [tasa]
import sys, json, glob, numpy as np, torch
carpeta, pasos, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
lr = float(sys.argv[4]) if len(sys.argv) > 4 else 2e-3
torch.manual_seed(seed); np.random.seed(seed)
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
V, NS, T, BATCH, U = 16, 8, 48, 32, 32

class Celda(torch.nn.Module):  # La misma GRU que gruStep en sim.js: W apila entradas y memoria; columnas z | r | candidato
    def __init__(s, n, u):
        super().__init__(); s.n, s.u = n, u
        s.W = torch.nn.Parameter(torch.randn(n + u, 3 * u) * .15); s.b = torch.nn.Parameter(torch.zeros(3 * u))
    def forward(s, x, h):
        u = s.u; Wx, Wh = s.W[:s.n], s.W[s.n:]
        xw = x @ Wx; hw = h @ Wh
        z = torch.sigmoid(s.b[:u] + xw[:, :u] + hw[:, :u]); r = torch.sigmoid(s.b[u:2*u] + xw[:, u:2*u] + hw[:, u:2*u])
        c = torch.tanh(s.b[2*u:] + xw[:, 2*u:] + (r * h) @ Wh[:, 2*u:])
        return (1 - z) * h + z * c

class Einstein(torch.nn.Module):
    def __init__(s):
        super().__init__()
        s.c1 = torch.nn.Conv2d(4, 8, 3, padding=1); s.c2 = torch.nn.Conv2d(8, 16, 3, padding=1)
        s.proy = torch.nn.Linear(16 * 4 * 4, 32)
        s.g1 = Celda(32 + NS, U); s.g2 = Celda(U, U)
        s.d1 = torch.nn.Linear(U, 16); s.d2 = torch.nn.Linear(16, 2)
    def vista(s, G):  # G: (n, 4, 16, 16)
        x = torch.nn.functional.max_pool2d(torch.relu(s.c1(G)), 2)
        x = torch.nn.functional.max_pool2d(torch.relu(s.c2(x)), 2)
        return torch.tanh(s.proy(x.flatten(1)))
    def forward(s, G, S):  # G: (B, T, 4, 16, 16)  S: (B, T, 8)
        B, Tn = S.shape[:2]
        v = s.vista(G.reshape(B * Tn, 4, V, V)).reshape(B, Tn, -1)
        h1 = torch.zeros(B, U, device=S.device); h2 = torch.zeros(B, U, device=S.device); out = []
        for t in range(Tn):
            h1 = s.g1(torch.cat([v[:, t], S[:, t]], 1), h1); h2 = s.g2(h1, h2)
            out.append(torch.tanh(s.d2(torch.tanh(s.d1(h2)))))
        return torch.stack(out, 1)
    def export(s):
        f = lambda p: p.detach().cpu().numpy().tolist()
        conv = lambda c: {'W': c.weight.detach().cpu().numpy().reshape(-1).tolist(), 'b': f(c.bias)}
        lin = lambda l: {'W': f(l.weight.t()), 'b': f(l.bias)}
        return {'einstein': True, 'conv': [conv(s.c1), conv(s.c2)], 'proy': lin(s.proy),
                'gru': [{'gru': True, 'W': f(c.W), 'b': f(c.b)} for c in (s.g1, s.g2)], 'densa': [lin(s.d1), lin(s.d2)]}

m = Einstein().to(dev)
ck = carpeta + '/modelo.pt'
try: m.load_state_dict(torch.load(ck))
except FileNotFoundError: pass

# Secuencias por carrera: la cuadrícula se queda en bytes hasta armar cada lote
sq = []
for fb in sorted(glob.glob(carpeta + '/d*.bin')):
    a = np.fromfile(fb, dtype=np.float32).reshape(-1, 1 + NS + 2)
    g = np.fromfile(fb[:-4] + '.vis', dtype=np.uint8).reshape(-1, 4, V, V)
    for r in np.unique(a[:, 0]):
        k = a[:, 0] == r
        if k.sum() > T: sq.append((torch.from_numpy(g[k]), torch.from_numpy(a[k][:, 1:])))
lens = np.array([len(q[1]) for q in sq], float)
op = torch.optim.Adam(m.parameters(), lr=lr); tot = 0
for p in range(pasos):
    idx = np.random.choice(len(sq), BATCH, p=lens / lens.sum())
    Gs, Ss = [], []
    for i in idx:
        s0 = np.random.randint(len(sq[i][1]) - T)
        Gs.append(sq[i][0][s0:s0 + T]); Ss.append(sq[i][1][s0:s0 + T])
    G = torch.stack(Gs).to(dev).float() / 250; X = torch.stack(Ss).to(dev)
    S, Y = X[..., :NS], X[..., NS:]
    e = m(G, S) - Y
    # Pesan más los momentos con algo que saltar o pisar justo delante: es donde se decide saltar o esquivar
    near = 1 + 2 * (G[:, :, 1:3, 2:10, 5:11].amax((2, 3, 4)) > 0).float()
    loss = ((e[..., 0] ** 2 + e[..., 1] ** 2) * near).mean()
    op.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0); op.step(); tot += loss.item()
torch.save(m.state_dict(), ck)
json.dump(m.export(), open(carpeta + '/red.json', 'w'))
# Referencia para comprobar que el juego calcula lo mismo
G0, X0 = sq[0][0][:40][None].to(dev).float() / 250, sq[0][1][:40][None].to(dev)
with torch.no_grad(): y = m(G0, X0[..., :NS])[0]
json.dump({'g': (G0[0].cpu().numpy() * 250).round().astype(int).reshape(40, -1).tolist(), 's': X0[0, :, :NS].cpu().tolist(), 'y': y.cpu().tolist()}, open(carpeta + '/control.json', 'w'))
print(f'perdida {tot / pasos:.4f} secuencias {len(sq)} muestras {int(lens.sum())}')
