# Especificación Etapa 4: App iPhone (Mobile Web) — Jackpot Jockeys

## 1) Arquitectura móvil

La App Móvil será una vista web embebida en el mismo proyecto Vite/React del Dashboard, operando bajo la ruta `/m`. Es un **cliente extremadamente delgado**: toda lógica pesada de cálculo de premios, matemáticas, y resolución ocurre en el Backend Autoritativo (Postgres+FastAPI).

### Principios Fundamentales (LAN-First)
1. **Configuración por Query Params & Fallbacks:** El QR emitido por el `SetupView` apuntará a `http://<PC_IP>:5173/m?join=XB34Z&api=http://<PC_IP>:8000`. Esto permite que cualquier iPhone se sume instantáneamente sin necesidad de instalar certificados HTTPS, usar DNS complejos ni configurar IPs a mano.
2. **Robustez ante cortes:** La web móvil será propensa a perder foco (Safari background). Si vuelve a primer plano (`visibilitychange`), lanzará automáticamente el rescate WS (`GET_STATE_SNAPSHOT`) tras reconectarse para igualar el tablero.
3. **Optimización UI Móvil (Tailwind):** Todo operará en una columna única `max-w-md mx-auto h-screen flex flex-col`. Bottom Tab Bar para navegación entre Apuestas, Poderes y Billetera para experiencia "App Native".

---

## 2) Rutas + estructura de archivos

La estructura vivirá dentro de `dashboard/src/mobile/`, totalmente segregada de las vistas de TV o Admin para que no importen librerías pesadas si no se ocupan:

```text
dashboard/src/mobile/
├── MobileApp.tsx                 # Layout principal (Header + Content + BottomTabBar)
├── MobileJoin.tsx                # Pantalla de Ingreso: Captura "?join=...", pide Username y dispara POST /auth/join
├── components/
│   ├── Toasts.tsx                # Notificaciones in-app (lucide-react icons + estilos "casino")
│   ├── ConfirmModal.tsx          # Wrapper reusable para cualquier acción destructiva ($$$)
│   ├── HorsePicker.tsx           # Selector visual de caballos + odds inyectados
│   └── BottomTabBar.tsx          # Menú de navegación inferior
├── core/
│   ├── mobileStore.ts            # Zustand Store exclusivo para la experiencia del jugador
│   ├── mobileWsClient.ts         # Singleton WS customizado para resync de Safari background
│   └── mobileApi.ts              # Axios proxy consumiendo "?api=" query var o fallback VITE_API
└── tabs/
    ├── BetsTab.tsx               # UX de apostar: muestra info de live pool local y botón Apostar
    ├── PowersTab.tsx             # Catálogo scrolleable de poderes + botón Castear
    └── WalletTab.tsx             # Billetera personal (disponible/bloqueado) + historial log
```

**Modificación en `dashboard/src/App.tsx`:**
```tsx
  <Route path="/m" element={<MobileRouter />} />
```

---

## 3) Store + WS client (Pseudocódigo y decisiones)

### `mobileWsClient.ts`
El cliente WS usa el mismo *Exponential Backoff* que el Dashboard TV, pero añade listeners nativos del navegador móvil para contrarrestar las pausas del sistema operativo.

```typescript
// Safari congela websockets al matar pantalla. Forzamos reconexión rápida:
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            connectWS(token); // reconecta y pide SNAPSHOT.
        } else {
            socket.send(JSON.stringify({ type: 'GET_STATE_SNAPSHOT' }));
        }
    }
});

// Deduplicación vital
const handledEventHashes = new LRUCache(300);
function handle(event) {
    if (handledEventHashes.has(event.hash)) return;
    handledEventHashes.add(event.hash);
    
    // Sólo avisos personales para no "spammear" el toast al jugador
    if (event.type === 'BET_PLACED' && event.data.user_id === miUserId) {
       showToast("success", `¡Apostaste $${event.data.amount}!`);
    } else if (event.type === 'POWER_APPLIED') {
       // Notificaciones globales solo para poderes.
       showToast("warning", `Poder activado en la pista.`);
    }
}
```

### `mobileStore.ts` (Zustand)
Retiene únicamente la data que interesa a UN dispositivo:
- `myWallet`: total, locked, history.
- `markets`: Win/Place pools.
- `raceStatus`: Para bloquear botones si `RaceRunning`.

---

## 4) UI/UX (Wireframes mentales)

### A. MobileJoin (`/m?join=XYZ`)
- **Top:** Logo retro-futurista de Jackpot Jockeys.
- **Centro:** "Te estás uniendo a la sala: **XYZ**". TextBox: [ Ingresa tu Nombre ] (max 12 chars).
- **Abajo:** Botón Titilante `[ ENTRAR AL LOBBY ]`
- *(Error Toast via `/auth/join`)*: "El lobby está lleno o ya empezó".

### B. Layout (MobileApp const)
- **Top Header Fijo:** `$ Saldo: $500.00` | Estado Carrera: `[ 🟢 APUESTAS ABIERTAS ]` o `[ 🔴 CORRIENDO ]`.
- **Botones Footer (Tab Bar):** `🏇 Apuestas` | `🔥 Poderes` | `💰 Billetera`.

### C. BetsTab
- Lista vertical de Caballos.
- Por cada caballo: Avatar + Nombre | `Odds: 2.5x` | `Pool: $500`.
- Botón al lado de cada caballo: `[ APOSTAR ]`.
- Al apretar: Sube una `ConfirmModal` del fondo ("Drawer"): 
  - Ingresa Monto `[ $50 ] [ $100 ] [ ALL-IN ]`
  - Botón: `Confirmar Apuesta ($XXX)` → Dispara POST con `Uuid-v4` Idempotency-Key.

### D. PowersTab
- Carrusel horizontal (Swipeable) o Grid 2xX de Cartas.
- Cada Carta: Título ("Sabotaje Básico"), Ícono ⚡, Costo (`$150`), Desc (Frena un caballo random).
- Al tocar Carta → Sube BottomSheet: 
  - Selector de a quién castear (Caballo 1 al 6).
  - Alerta: "Te costará $150". Botón: `Castear Poder`.

### E. WalletTab
- **Card Principal:** `Balance Total: $500` | `Bloqueado en apuestas: $100` | `DISPONIBLE: $400`.
- **Historial (FlatList):** Consumo del arreglo interno de events:
  - `- $50 (Apuesta a Caballo 1)`
  - `- $150 (Poder casteado)`
  - `+ $250 (Liquidación Carrera 1)`

---

## 5) Integración Backend (REST + WS)

**REST endpoints consumidos por la App Móvil:**
1. `POST /auth/join` → Payload `{"username": "Pepe", "join_code": "XB34Z", "is_admin": false}`. (Retorna JWT).
2. `GET /wallet/me` → (Opcional si no se usa snapshot para hidratar initial state).
3. `POST /bets` → Payload `{"market_id": 1, "selection_key": "horse_1", "amount": 50}` + Header `X-Idempotency-Key`.
4. `POST /powers/cast` → Payload `{"power_id": "sabotaje", "target_id": "horse_1"}` + Header `X-Idempotency-Key`.
5. `GET /powers` → (Stub de UI o fetch real). Para el MVP podemos renderizar UI hardcodeada de poderes aprobados si no hay endpoint de catálogo dinámico.

**WebSockets Payload Esperado:**
- Mandar `{"type": "GET_STATE_SNAPSHOT"}` on open.
- Escuchar: `ODDS_UPDATE` (actualizar UI BetsTab), `RACE_STATE_CHANGED` (bloquear inputs si carrera corre), `BALANCE_UPDATE` (parchear UI instantáneo post-gastos), `SETTLEMENT_COMPLETE` (mostrar modal de "Ganaste/Perdiste").

---

## 6) Plan de Implementación (3 Días) + DoD

### Día 1: Infraestructura Web/Móvil 
- Setup de `vue-router` / React-Router `<Route path="/m" />`.
- Crear layout global Mobile (`MobileApp` con TabBar CSS).
- Lógica de captura URL params `?join` y `?api` guardando en localStorage.
- POST `/auth/join` y seteo del Singleton `mobileWsClient`.

### Día 2: Tab Apuestas & Wallet (Core loop monetario)
- Pantalla `BetsTab` mapeando `race.markets`. Animación de bloqueo (Overlay gris) si la carrera empieza.
- Modales Drawer de Confirmación (`ConfirmModal.tsx`).
- Botoneras pre-configuradas ($10, $50, Max) y pegada a `POST /bets` inyectando Idempotency UUIDs.
- `WalletTab` consumiendo `BALANCE_UPDATE` nativo para refrescos a prueba de balas.

### Día 3: Poderes, Toasts y Quality of Life
- Diseñar cartas del `PowersTab`.
- Interfaz de targeting (¿A quién se le tira el hechizo?).
- Pegar a `POST /powers/cast`.
- Hacemos global el generador de **Toasts** 🍞 en Mobile (Top right o bottom popup) para alertar rechazos por cap de apuestas, falta de dinero o enfriamiento de poderes.

**✅ DoD (Definition of Done) para la Etapa 4:**
1. El GM en una Mac crea sala. Emite QR con IP interna `192.x.x`.
2. 2 personas escanean QR desde su iPhone (Safari). Entran a `/m?join=123`.
3. Ambos ponen su nombre, entran al lobby web móvil. Visualizan TabBar, Saldo en $1000.
4. Las vistas móviles de Apuestas se refrescan a 60fps junto al Dashboard TV escuchando ODD_UPDATES.
5. Los jugadores interactúan de forma paralela apostando e inyectando deduplicidad.
6. Empieza la carrera: iPhones se bloquean ("CARRERA EN CURSO"). Falla localmente cualquier fetch. Settle ocurre: Toasts de dinero impactado.
