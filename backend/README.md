# Jackpot Jockeys Backend 🏎️💰

Este es el motor autoritativo de **Jackpot Jockeys (AntiGravity)**, un casino de carreras futuristas de alta velocidad. El sistema gestiona la lógica de las carreras, la economía persistente de los usuarios y la sincronización de estado en tiempo real.

## Overview
Optimizado para entornos **LAN-first** (con visión de escalado a la nube), el backend centraliza la verdad del juego:
- **Autoría Total**: El servidor controla el cronómetro, resuelve las apuestas y valida cada acción.
- **Baja Latencia**: Comunicación bidireccional vía WebSockets para sincronización con el Dashboard de Pygame.
- **Integridad Financiera**: Sistema de wallet con bloqueos preventivos y transacciones atómicas.

## Why this stack?
- **FastAPI**: 
  - *Desempeño*: Velocidad comparable a Go/Node gracias a su naturaleza asíncrona.
  - *Validación*: Pydantic v2 garantiza que no entren datos basura al sistema antes de tocar la DB.
- **WebSockets (Native)**: Permite el "State Syncing" fluido sin el overhead de polling constante.
- **PostgreSQL**: La base de datos relacional por excelencia para garantizar consistencia ACID en la economía.
- **SQLAlchemy 2.0**: Uso de APIs modernas con soporte completo de tipos para evitar errores en tiempo de ejecución.
- **Alembic**: Versionamiento profesional de la base de datos, vital para entornos colaborativos.
- **JWT (python-jose)**: Autenticación stateless que facilita la reconexión rápida de los clientes móviles.

## Architecture
El servidor orquestra tres frentes críticos:

1. **Race Engine Loop**: Una tarea asíncrona dedicada que gestiona la máquina de estados (Lobby → Betting → Racing → Settling).
2. **Transactional API**: Endpoints REST para gestión de wallet, apuestas e ítems.
3. **Broadcaster**: Manager de conexiones WebSocket que sectoriza eventos por `lobby_id`.

### Decisiones de Diseño Críticas
- **Atomicidad & Bloqueos**: Utilizamos `SELECT ... FOR UPDATE` en las operaciones de wallet para prevenir el *Double Spending* bajo condiciones de alta concurrencia.
- **Wallet Locking**: `balance_total` representa el dinero real; `balance_locked` es el capital retenido en apuestas activas. El balance disponible es el resultado calculado.
- **Idempotencia**: Implementada vía `X-Idempotency-Key`. Si un cliente reintenta una apuesta por fallo de red, el servidor devuelve el resultado original sin duplicar el cargo.
- **State Versioning**: Cada cambio de estado incrementa una `state_version`. Los clientes (Pygame) usan esto para asegurar que el snapshot visual coincide con el estado lógico del servidor.

## Getting Started (Docker)

Sigue estos pasos para levantar el entorno de desarrollo local:

1. **Variables de Entorno**:
   ```bash
   cp .env.example .env
   # Configura JWT_SECRET y credenciales de DB si es necesario
   ```

2. **Levantar Servicios**:
   ```bash
   docker compose up --build
   ```
   *El backend estará disponible en `http://localhost:8000`.*

3. **Ver Documentación Interactiva**:
   Accede a `http://localhost:8000/docs` para ver el Swagger UI.

## Migrations (Alembic)
El servicio de API se encarga de ejecutar las migraciones al arrancar si `RUN_MIGRATIONS=1`. Para manejo manual:

- **Evolucionar la DB (Upgrade)**:
  ```bash
  docker compose exec api alembic upgrade head
  ```
- **Generar nueva migración**:
  ```bash
  docker compose exec api alembic revision --autogenerate -m "feat: add favor system"
  ```

## Testing
Validamos la robustez económica y la consistencia de estados.

- **Correr suite completa**:
  ```bash
  ./run_tests.sh
  ```
*(Esto levantará contenedores efímeros para asegurar un entorno de prueba limpio).*

**Tests Críticos Incluidos**:
- Concurrencia en Wallet (Stress test de balance).
- Validación de Idempotencia en apuestas.
- Ciclo de vida de la máquina de estados de la carrera.

## Configuration (.env)
| Variable | Descripción | Valor Default |
|----------|-------------|---------------|
| `MAX_POWER_SPEND_PER_RACE` | Cap de gasto en poderes por carrera | `300` |
| `CANCEL_FEE` | Comisión por cancelar una apuesta activa | `0.05` |
| `JWT_SECRET` | Llave para firmar tokens de acceso | `dev_secret` |
| `DB_URL` | String de conexión (usar `db` como host en Docker) | `postgresql+psycopg://...` |

## API Quick Reference

### REST Endpoints
- `POST /auth/join`: Registro rápido y entrada al lobby.
- `GET /wallet/me`: Consulta de balances (total vs locked).
- `POST /bets`: Colocación de apuestas (Requiere `X-Idempotency-Key`).
- `DELETE /bets/{id}`: Cancelación con cobro de comisión.
- `POST /powers/cast`: Aplicación de poderes en tiempo real.

### WebSocket Protocol
- **Endpoint**: `ws://localhost:8000/ws?token=YOUR_JWT_TOKEN`
- **Sincronización inicial**: Al conectar, el cliente debe enviar:
  ```json
  {"type": "GET_STATE_SNAPSHOT"}
  ```
- **Eventos periódicos**: El servidor emite `STATE_SYNC` y `RACE_STATE_CHANGED` automáticamente.

## Troubleshooting
- **DB no listo**: El script `scripts/wait_for_db.sh` bloquea la API hasta que Postgres acepte conexiones. Si falla, revisa los logs: `docker compose logs db`.
- **WS Desconectado (Code 1008)**: El token JWT es inválido o el `lobby_id` no coincide. Refresca el token vía `/auth/join`.
- **Puerto 8000 ocupado**: Revisa si tienes otra instancia de Uvicorn corriendo localmente fuera de Docker.

## Roadmap
### MVP Next 🚀
- **Trifecta Market**: Soporte para apuestas de orden exacto (1ro, 2do, 3ro).
- **Favor System**: Mecánica de deudas y lealtad entre jugadores.
- **Race Replay**: Guardado de seeds para reproducir carreras exactas.

### Later / Online ☁️
- **Observabilidad**: Exportador de métricas para Prometheus/Grafana.
- **Cloud Run Deployment**: Adaptación para hosting serverless con Cloud SQL.
- **Post-Race Analytics**: Dashboard de estadísticas históricas de caballos/conductores.
