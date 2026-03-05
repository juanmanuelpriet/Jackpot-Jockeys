# Jackpot Jockeys Backend 🏎️💰

Motor autoritativo para **Jackpot Jockeys** — un casino de carreras futuristas. El servidor controla toda la lógica: carreras, apuestas parimutuel, poderes, préstamos y economía en tiempo real.

## Stack

| Tech | Por qué |
|------|---------|
| **FastAPI** | Async, validación Pydantic v2, WebSocket nativo |
| **PostgreSQL 16** | ACID para la economía, `SELECT FOR UPDATE` para concurrencia |
| **SQLAlchemy 2.0** | ORM tipado + migraciones con **Alembic** |
| **JWT (python-jose)** | Auth stateless, roles admin/player, refresh |
| **Docker Compose** | Un comando → DB + API listos en LAN |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FastAPI (Uvicorn)                  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ REST API │  │ WS Mgr   │  │ Race Engine       │  │
│  │ 25+ eps  │  │ 16 events│  │ async per lobby   │  │
│  └────┬─────┘  └────┬─────┘  └────┬──────────────┘  │
│       │              │             │                 │
│  ┌────┴──────────────┴─────────────┴──────────────┐  │
│  │         Repository (FOR UPDATE + _r())         │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │                              │
│  ┌────────────────────┴───────────────────────────┐  │
│  │  Rate Limiter │ Idempotency │ Audit Log        │  │
│  └────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │
                   PostgreSQL 16
                   (13 tablas)
```

### Principios de diseño

- **Server-authoritative**: El cliente solo envía intenciones. El server valida y ejecuta.
- **Wallet locking**: `balance_locked` retiene fondos en apuestas activas. `SELECT FOR UPDATE` previene double spending.
- **Rounding policy**: Cada mutación de dinero usa `_r()` (round a 2 decimales) para evitar centavos fantasma.
- **Idempotency**: `X-Idempotency-Key` en bets/powers — retry seguro sin duplicar cargos.
- **State versioning**: Cada transición incrementa `state_version`. Clients detectan atraso y rehidratan vía `GET_STATE_SNAPSHOT`.

## Quick Start

```bash
# 1. Config
cp .env.example .env  # JWT_SECRET, DB_URL

# 2. Levantar
docker compose up --build
# API: http://localhost:8000
# Docs: http://localhost:8000/docs

# 3. Migraciones
docker compose exec api alembic upgrade head

# 4. Tests
./run_tests.sh
```

## API Reference

### Auth
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/auth/join` | Registro + join lobby (con `lobby_id` o `join_code` de QR) |
| `POST` | `/auth/refresh` | Renovar JWT |

### Wallet
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/wallet/me` | Balance total, locked, available, debt |

### Bets
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/bets` | Apostar (idempotent, cutoff T-10s) → WS: `BET_PLACED` + `ODDS_UPDATE` |
| `DELETE` | `/bets/{id}` | Cancelar (5% fee) → WS: `BET_CANCELED` |

### Markets
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/markets/{race_id}` | Mercados Win/Place/Show + odds parimutuel |

### Powers
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/powers` | Catálogo (3 poderes MVP) |
| `POST` | `/powers/cast` | Castear (cap $300, cooldowns, anti-focus, pity shield) → WS: `POWER_TELEGRAPH` + `POWER_APPLIED` |

### Loans
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/loans/npc` | Préstamo NPC (15%, max 1 activo) |
| `POST` | `/loans/offer` | Ofrecer P2P (locks lender funds) |
| `POST` | `/loans/{id}/accept` | Aceptar P2P → transferencia |
| `POST` | `/loans/{id}/repay` | Pagar parcial/total |
| `GET` | `/loans/me` | Mis préstamos (borrower + lender) |

### Admin (requiere `role: admin`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/admin/lobby` | Crear lobby con join_code (QR) |
| `POST` | `/admin/race/start/{lobby_id}` | Iniciar engine + auto-crear markets |
| `POST` | `/admin/race/stop/{lobby_id}` | Detener engine |
| `POST` | `/admin/race/settle/{race_id}` | Settlement manual override |
| `GET` | `/admin/lobby/{lobby_id}/state` | Dashboard: jugadores, balances, carrera |

### WebSocket
```
ws://PC_IP:8000/ws?token=JWT

→ Client:  {"type": "GET_STATE_SNAPSHOT"}
← Server:  {race, markets, odds, wallet, bets, placements}

→ Client:  {"type": "PING"}
← Server:  {"event_name": "PONG"}
```

**Eventos del servidor:**

| Evento | Cuándo | Destino |
|--------|--------|---------|
| `STATE_SYNC` | Cada 1s en BettingOpen | Lobby |
| `RACE_STATE_CHANGED` | Transición de estado | Lobby |
| `ODDS_UPDATE` | Después de cada bet | Lobby |
| `BET_PLACED` / `BET_CANCELED` | Al apostar/cancelar | Lobby |
| `BALANCE_UPDATE` | Cambio de wallet | User |
| `POWER_TELEGRAPH` / `POWER_APPLIED` | Al castear poder | Lobby |
| `MARKET_CLOSED` | BettingOpen → RaceRunning | Lobby |
| `SETTLEMENT_COMPLETE` | Al resolver carrera | Lobby |

## Configuration

| Variable | Default | Descripción |
|----------|---------|-------------|
| `JWT_SECRET` | `dev_secret_change_me` | Llave HS256 |
| `DB_URL` | `postgresql+psycopg://...` | Host `db` en Docker |
| `MAX_POWER_SPEND_PER_RACE` | `300` | Cap de gasto en poderes |
| `CANCEL_FEE` | `0.05` | Comisión al cancelar bet |
| `RAKE_PCT` | `0.10` | Rake de la casa en pools |
| `NPC_INTEREST_RATE` | `0.15` | Interés préstamo NPC |
| `MAX_TOTAL_DEBT` | `1000` | Deuda máxima por jugador |
| `MAX_DEBUFFS_PER_TARGET_PER_USER` | `3` | Anti-focus |
| `PITY_SHIELD_THRESHOLD` | `5` | Debuffs para activar pity |

## Database (13 tablas)

```
users ─── wallets (CHECK constraints: total≥0, locked≤total)
  │
  ├── bets ─── markets ─── market_selections
  │                │
  ├── loans       races ─── race_results
  │                │
  ├── favors      lobbies (VARCHAR id, join_code)
  │
  ├── power_cast_events (composite indices)
  │
  ├── audit_log
  │
  └── idempotency_keys (UNIQUE user+key+endpoint)
```

## Tests (14+)

```bash
./run_tests.sh
```

| Test | Qué valida |
|------|-----------|
| `test_settlement_*` (3) | Parimutuel Win/Place/Show math + refund |
| `test_powers_*` (2) | Cap $300 + cooldowns |
| `test_anti_chaos_*` (2) | Anti-focus 3/target + pity shield |
| `test_bets_validation_*` (3) | Market closed, auto-close, auto-create |
| `test_race_sim_*` (4) | Determinism, unique positions |
| `test_idempotency_*` | Retry safe, mismatch 409 |
| `test_wallet_*` | Concurrent bets, only 1 passes |
| `test_cancel_fee` | 5% fee exacto |

## Troubleshooting

| Problema | Solución |
|----------|---------|
| DB no listo | `docker compose logs db` — espera `ready to accept connections` |
| WS close 4001/4003 | Token inválido → `POST /auth/join` |
| Port 8000 busy | Mata otro Uvicorn: `lsof -i :8000` |
| `ck_wallet_total_positive` error | Balance negativo → bug en lógica de cobro |
| Rate limit 429 | Espera 10s. Limits: /bets 20, /powers 10, /loans 5 |

## Roadmap

### P1 (Next)
- Trifecta/Box markets
- Lap/checkpoint betting
- `NUMERIC(12,2)` migration (Float → Decimal)
- Server-side POWER_EXPIRED timer

### P2 (Later)
- Prometheus metrics
- Cloud Run deployment
- Post-race analytics dashboard
- Rejoin / kick player
