# Entrena una red para copiar a la heurística, con el mismo cálculo y formato que usa el juego.
import sys, json, glob, numpy as np, torch
arq, u, carpeta, pasos, seed = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
torch.manual_seed(seed); np.random.seed(seed); torch.set_num_threads(1)
NI, T, BATCH = 18, (80 if arq == 'gru' else 1), (64 if arq == 'gru' else 512)
class Gru(torch.nn.Module):
    def __init__(s, n, u):
        super().__init__(); s.n, s.u = n, u
        s.W = torch.nn.Parameter(torch.randn(n + u, 3 * u) * .15); s.b = torch.nn.Parameter(torch.zeros(3 * u))
        s.oW = torch.nn.Parameter(torch.randn(u, 2) * .15); s.ob = torch.nn.Parameter(torch.zeros(2))
    def forward(s, X):
        h = torch.zeros(X.shape[0], s.u); out = []; u = s.u
        Wx, Wh = s.W[:s.n], s.W[s.n:]
        for t in range(X.shape[1]):
            x = X[:, t]; xw = x @ Wx; hw = h @ Wh
            z = torch.sigmoid(s.b[:u] + xw[:, :u] + hw[:, :u]); r = torch.sigmoid(s.b[u:2*u] + xw[:, u:2*u] + hw[:, u:2*u])
            c = torch.tanh(s.b[2*u:] + xw[:, 2*u:] + (r * h) @ Wh[:, 2*u:])
            h = (1 - z) * h + z * c
            out.append(torch.tanh(h @ s.oW + s.ob))
        return torch.stack(out, 1)
    def export(s):
        f = lambda p: p.detach().cpu().numpy().tolist()
        return [{'gru': True, 'W': f(s.W), 'b': f(s.b)}, {'W': f(s.oW), 'b': f(s.ob)}]
class Mlp(torch.nn.Module):
    def __init__(s, n):
        super().__init__(); d = [n, 8, 3, 3, 2]
        s.W = torch.nn.ParameterList([torch.nn.Parameter(torch.randn(d[i], d[i+1]) * .3) for i in range(4)])
        s.b = torch.nn.ParameterList([torch.nn.Parameter(torch.zeros(d[i+1])) for i in range(4)])
    def forward(s, X):
        x = X
        for W, b in zip(s.W, s.b): x = torch.tanh(x @ W + b)
        return x
    def export(s):
        return [{'W': W.detach().numpy().tolist(), 'b': b.detach().numpy().tolist()} for W, b in zip(s.W, s.b)]
m = Gru(NI, u) if arq == 'gru' else Mlp(NI)
ck = carpeta + '/modelo.pt'
try: m.load_state_dict(torch.load(ck))
except FileNotFoundError: pass
sq = []
for f in sorted(glob.glob(carpeta + '/d*.bin')):
    a = np.fromfile(f, dtype=np.float32).reshape(-1, NI + 3)
    for r in np.unique(a[:, 0]):
        q = a[a[:, 0] == r][:, 1:]
        if len(q) > T: sq.append(q)
lens = np.array([len(q) for q in sq], float)
op = torch.optim.Adam(m.parameters(), lr=float(sys.argv[6]) if len(sys.argv) > 6 else 2e-3); tot = 0
for p in range(pasos):
    idx = np.random.choice(len(sq), BATCH, p=lens / lens.sum())
    B = np.stack([sq[i][(s := np.random.randint(len(sq[i]) - T)):s + T] for i in idx])
    X = torch.tensor(B[:, :, :NI]); Y = torch.tensor(B[:, :, NI:])
    if arq != 'gru': X, Y = X[:, 0], Y[:, 0]
    pred = m(X); e = pred - Y
    loss = (e[..., 0] ** 2).mean() + (e[..., 1] ** 2).mean()
    op.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0); op.step(); tot += loss.item()
torch.save(m.state_dict(), ck)
json.dump(m.export(), open(carpeta + '/red.json', 'w'))
# Referencia para comprobar que el juego calcula lo mismo
X = torch.tensor(sq[0][:40, :NI])
with torch.no_grad(): y = m(X[None])[0] if arq == 'gru' else m(X)
json.dump({'x': X.tolist(), 'y': y.tolist()}, open(carpeta + '/control.json', 'w'))
print(f'perdida {tot / pasos:.4f} secuencias {len(sq)}')
