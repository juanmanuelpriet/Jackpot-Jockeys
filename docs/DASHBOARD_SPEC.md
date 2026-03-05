# PROMPT MAESTRO — ETAPA 3: Dashboard PC ("El Show")

## 1) Elección de tecnología para el Dashboard PC (MVP)

**Elección: Opción B: Web App (React + Vite + TailwindCSS)**

**Justificación (3 razones):**
1. **Velocidad de iteración de UI (Casino Vibe):** Las animaciones complejas (glowing text, glassmorphism, tablas en tiempo real con transiciones, barras de progreso de odds) son triviales en CSS/Tailwind + React (`framer-motion`), pero requieren matemáticas manuales y redibujado intensivo en Pygame.
2. **WebSocket & JSON parsing nativo:** React maneja el estado global (`zustand` o `context`), el parseo JSON y la conexión WebSocket de forma nativa e impecable sin bloquear el hilo principal, algo en lo que Python/Pygame requiere librerías secundarias (asyncio + threads).
3. **Distribución LAN Zero-Install:** El dashboard puede correr simplemente levantando un servidor estático (`npm run dev -- --host`) y el "Admin" puede abrirlo en el navegador del SmartTV, laptop o cualquier dispositivo conectado a la LAN, sin requerir instalar Python/dependencias en la máquina de visualización.

**Cómo se corre:**
```bash
# Inicializar (una vez)
npm create vite@latest dashboard -- --template react-ts
cd dashboard && npm install zustand lucide-react react-router-dom

# Correr en toda la LAN para que el Smart TV pueda verlo
npm run dev -- --host 0.0.0.0
```

---

## 2) Arquitectura del dashboard

### Componentes UI (Pantallas/Paneles)
La aplicación será una Single Page Application (SPA) con dos Layouts:
1. **Admin Layout:** Para controles de GM (iniciar carrera, frenar).
2. **Show Layout:** La interfaz principal (el casino) diseñada a pantalla completa.
   - `RaceView`: Render vertical/circuito abstracto de la carrera.
   - `BettingView`: Tablas de pools, odds y rake en tiempo real.
   - `SocialView`: Leaderboard financiero.
   - `NarratorLog`: Feed lateral estilo Twitch.

### Data layer: WS listener + REST fetcher
- **REST Fetcher:** Funciones fetch estándar (o `axios`) para autenticarse, obtener token admin, crear el lobby y forzar settlements.
- **WS Listener:** Un singleton o hook `useGameSocket` que se instancía una vez autenticado, reacciona a los eventos y dispara acciones al Global Store.

### Store / State Management (Zustand)
Usaremos Zustand. El store contendrá todo el `GET_STATE_SNAPSHOT` inicial.
Cuando entra un evento WS, el store actualiza *in-place*.
**Resync:** El provider del socket mantiene la última `state_version` recibida. Si el socket se desconecta, al reconectar automáticamente lanza la orden REST o WS de `{"type": "GET_STATE_SNAPSHOT"}` y reemplaza todo el árbol de Zustand.

### Estructura de carpetas
```text
src/
├── core/
│   ├── store.ts            # Zustand global state (race, wallets, markets)
│   ├── wsClient.ts         # Manejo de reconexiones y dispatchers
│   └── api.ts              # Fetchers REST (auth, admin commands)
├── components/
│   ├── race/               # Track, HorseRow, HazardStub
│   ├── betting/            # OddsTable, PoolBars, Multipliers
│   ├── social/             # Leaderboard, DebtWarnings
│   ├── narrator/           # FeedLog, EventCard
│   └── admin/              # ControlPanel, QrCodeDisplay
├── views/
│   ├── TheShowView.tsx     # Integra race, betting, social, narrator
│   ├── AdminLayout.tsx     # Barra de control superior/inferior
│   └── SetupView.tsx       # Pantalla de creación de lobby
└── App.tsx                 # Router principal
```

---

## 3) Contrato de datos (Qué consumes del backend)

### Lista de eventos WS

*El dashboard solo escucha; su estado es reactivo puro al servidor.*
- **`STATE_SYNC`**: Recibe timers faltantes y `state_version`. Lo usa para actualizar la barra regresiva general.
- **`RACE_STATE_CHANGED`**: (Lobby → BettingOpen → RaceRunning). Dispara el swap masivo de UI. (Ej: oculta mercado, sube el circuito).
- **`ODDS_UPDATE`**: Payload `{"market": "Win", "odds": {"horse_1": 2.5}}`. Anima en verde/rojo los números de la `BettingView`.
- **`MARKET_CLOSED`**: Bloquea visualmente las tablas de apuestas.
- **`BET_PLACED` / `BET_CANCELED`**: Muestra un flash en la UI ("¡@juan apostó $50 al caballo 3!"). Se inyecta en el `NarratorLog`.
- **`BALANCE_UPDATE`**: Payload `{"total": 1200, "locked": 100}`. Se envían a la `SocialView` para reordenar el ranking en tiempo real.
- **`POWER_TELEGRAPH` / `POWER_APPLIED` / `POWER_EXPIRED`**: Payload de poderes. Dispara efectos de sonido y alimenta la cabecera narradora ("⚡ ¡INYECCIÓN ACTIVADA EN CABALLO 2!").
- **`SETTLEMENT_COMPLETE`**: Trae los ganadores y los payouts totales. Dispara pantalla de victoria y lluvia de dólares virtuales en los ganadores.

### REST Admin Endpoints
- `POST /auth/join`: Con `role: admin` para obtener el JWT base.
- `POST /admin/lobby`: Genera el Lobby y obtiene el `join_code` (ej: XB34Z). Genera el QR.
- `POST /admin/race/start/{lobby}`: Inicia etapa de apuestas.
- `POST /admin/race/stop/{lobby}`: Fuerza cierre prematuro (opcional).
- `POST /admin/race/settle/{race}`: Ejecuta el payout en caso de atasco en RaceRunning.

### Snapshots (Resync)
`{"type": "GET_STATE_SNAPSHOT"}`
Trae todo el array de `races`, `markets` con pools acumulados, y `placements` si ya hay carreras terminadas.

---

## 4) Diseño de UI — 5 Vistas Obligatorias (Wireframes Textuales)

### 4.1 Vista Carrera (`RaceView`)
```text
┌────────────────────────────────────────────────────────┐
│  ESTADO: [ RACE RUNNING ]         VUELTA: 1/3   ⌚ 0:45 │
├────────────────────────────────────────────────────────┤
│ 🐴 H1 (Seabiscuit)  [========>            ] 1ro        │
│    └─ ⚡ (Boost x2)                                    │
│ 🐴 H2 (BoJack)      [=====>               ] 3ro        │
│    └─ 🐢 (Mancha Aceite)      ⚠️ HAZARD ZONA 2         │
│ 🐴 H3 (Shadowfax)   [======>              ] 2do        │
└────────────────────────────────────────────────────────┘
```

### 4.2 Vista Apuestas (`BettingView`)
```text
┌────────────────────────────────────────────────────────┐
│  🔥 APUESTAS ABIERTAS (T-15s)    | POOL GLOBAL: $4,500 │
├────────────────────────────────────────────────────────┤
│ MERCADO: WIN (A Ganador)                               │
│ H1: 1.8X   [████████░░░] $1200                         │
│ H2: 4.5X   [███░░░░░░░░]  $300                         │
│ H3: 3.2X   [█████░░░░░░]  $800                         │
├────────────────────────────────────────────────────────┤
│ ÚLTIMAS: ✔ @pedro $50 a H1 | ❌ @ana retiró $20       │
└────────────────────────────────────────────────────────┘
```

### 4.3 Vista Social / Leaderboard (`SocialView`)
```text
┌────────────────────────────────────────────────────────┐
│  💎 JUGADORES (RANKING NET WORTH)                      │
├────────────────────────────────────────────────────────┤
│ 1. @carlos   [$1,500] (Locked: $200)                   │
│ 2. @ana      [$1,100] (Locked: $50)                    │
│ 3. @pedro    [  $400] ⚠️ DEBT: $500 (125% Riesgo)      │
│ ------------------------------------------------------ │
│ 🏦 BANCO NPC: Interés 15%. Ofertas P2P: 1 activas      │
└────────────────────────────────────────────────────────┘
```

### 4.4 Log Narrativo (`NarratorLog`)
```text
┌────────────────────────────────────────────────────────┐
│  🎙️ EL NARRADOR (FEED EN VIVO)                         │
├────────────────────────────────────────────────────────┤
│ [14:02:10] 🔥 ¡@carlos huele sangre! Mete $200 a H1.   │
│ [14:02:15] 🚨 ¡Alerta Anti-dopping! @pedro le ha       │
│            inyectado ESTEROIDES a BoJack.              │
│ [14:02:18] 💔 @ana se arrepiente y saca su dinero.     │
│ [14:03:00] 🏁 ¡SE ACABÓ! Seabiscuit destroza los       │
│            pronósticos. @carlos gana $450 limpios.     │
└────────────────────────────────────────────────────────┘
```

### 4.5 Panel Admin (`ControlPanel`) - Barra inferior escondible
```text
┌────────────────────────────────────────────────────────┐
│ ⚙️ ADMIN | LOBBY: XYZ123 (🔳 Ver QR) | Health: OK (v42)│
├────────────────────────────────────────────────────────┤
│ [ CREAR LOBBY ]  [ START APUESTAS ]  [ FORCE SETTLE ]  │
└────────────────────────────────────────────────────────┘
```

---

## 5) Reglas de "Narrador" (Copywriting Engine)

El "copywriting engine" es un pequeño middleware en React que toma los JSON de WebSockets y los pasa por un mapeo randomizado.

### Plantillas por evento
- **`BET_PLACED`**:
  - *"¡@user acaba de soltar ${amount} al caballo {horse}! O tiene información de adentro o está loco."*
  - *"Silencio en la sala... @user confía ciegamente ${amount} a {horse}."*
- **`POWER_APPLIED`**:
  - *"¡JUEGO SUCIO! @user despacha {power} sobre {horse}. ¡Esto es legal aquí!"*
  - *"¡MAGIA! El caballo {horse} empieza a brillar gracias al {power} de @user."*
- **`SETTLEMENT_COMPLETE`**:
  - *"¡SUDOR FRÍO! La casa ha repartido ${payout}. @ganadores sacan la champaña."*

### Filtros Anti-spam
- Si entran 5 `BET_PLACED` en menos de 2 segundos, el Narrador obvia nombrar a todos y publica un agregado: *"¡FRENESÍ DE APUESTAS! $3,500 acaban de entrar al pool en 2 segundos."*
- Powers siempre suenan (alta prioridad).

### Tono de lenguaje
Cómico, "Cyberpunk Casino", sarcástico con los perdedores, glorificador con los ricos, sin sobrepasar límites (sin usar groserías explícitas).

---

## 6) Implementación MVP (Paso a paso)

- **Paso 1: Bootstrap y conexión WS**
  - **Done:** Levantar Vite. Autenticar mock admin. Hardcodear vista Admin que cree Lobby y dibuje el `join_code` grande. Websocket conecta y mantiene `state_version` sin colapsar.
- **Paso 2: Vista Apuestas y Eventos Base**
  - **Done:** Mockear carreras. Al darle a *Start Apuestas*, la UI muestra el pool Win/Place. Escuchar e inyectar `ODDS_UPDATE` para que las barras cambien de tamaño en vivo con CSS transitions.
- **Paso 3: Dashboard Carrera (Stubs)**
  - **Done:** Al pasar a *RaceRunning*, crear un timer visual. Como el backend aún no manda XY de caballos (stub sim), simular barras de progreso en CSS del 0% al 100% que representen a los caballos corriendo en base a su tiempo de meta mockeado, disparando el `SETTLEMENT_COMPLETE` al final.
- **Paso 4: El Narrador Social**
  - **Done:** Implementar Zustand para el Leaderboard copiando `BALANCE_UPDATE`. Enviar logs formateados al feed lateral usando React Context.
- **Paso 5: Pulido y Desconexión (DoD)**
  - **Done:** Probar apagar el servidor backend y reconectar. Vite detecta la reconexión, pide `GET_STATE_SNAPSHOT` y recarga Zustand sin parpadear la pantalla violentamente.

---

## 7) Tests / Verificación manual (Checklist de Demo)

- [ ] **QR Launch**: Crear lobby en React, aparece `XB34Z` gigante y un código QR renderizado con `react-qr-code`.
- [ ] **Join LAN**: Usar el móvil, escanear el QR conectado a la misma red Wifi, registrarse, y el Admin ve incrementar el contador de "Jugadores en sala" automáticamente (vía socket o polling leve al estado).
- [ ] **Live Pools**: El admin abre el mercado. En el móvil alguien mete $100. La pantalla grande (Dashboard) vibra su barra de `Win` y el multiplicador baja de 4.0 a 2.5 instantáneamente (`ODDS_UPDATE`).
- [ ] **Carrera Fake**: El admin arranca la carrera. Las barras de los caballos suben del 0% al 100%. Un usuario lanza *Mancha de Aceite*. Aparece un emoji enorme en el dashboard (`POWER_APPLIED`) y el narrador suelta el tooltip cómico.
- [ ] **Resiliencia**: Apagar el wifi de un móvil, prenderlo. La plata y los Locked budgets tienen que seguir idénticos. Refrescar la pestaña de Chrome (F5) del Dashboard: en 1 segundo vuelve al estado *RaceRunning* exacto sin perder datos del snapshot.
