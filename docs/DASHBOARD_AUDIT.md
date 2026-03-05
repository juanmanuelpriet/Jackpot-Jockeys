# PROMPT MAESTRO — Auditoría SOLO Dashboard PC ("El Show")

## 1) Resumen ejecutivo + score 0–10

**Score Actual: 7.5 / 10**

**¿Está "Demo Ready" para 2 móviles + PC corriendo 5 carreras seguidas?**
**CASI, pero con fricción (NO al 100%).** 
La arquitectura base (Zustand + WS + Tailwind) es excelentemente robusta y levanta instantáneamente. Los flujos centrales (crear lobby, unirse, apostar, ver odds moverse, y forzar Settle) funcionan. Sin embargo, carece de *polish UX* vital para un show autónomo y sostenido:
1. No hay botones de "Siguiente Carrera / Reset" en el Admin. Después de `Settlement`, la UI se queda estática; hay que refrescar o forzar recarga.
2. Si el Backend levanta WS en un puerto/IP distinto a localhost, el dashboard estalla por estar hardcodeado en `wsClient.ts`.
3. El frontend no soporta la deserialización dinámica de trifectas, poderes activos, ni préstamos (están ausentes).

Es un MVP fundacional brillante, pero requiere la ejecución del **Fix Plan** descrito abajo para poder soltarlo en una fiesta sin tocar el teclado.

---

## 2) Matriz de cumplimiento del checklist (SOLO Dashboard)

| Requisito | Estado | Evidencia | Qué falta para ✅ |
| :--- | :---: | :--- | :--- |
| **RaceView: Posición / Progreso** | ⚠️ | `RaceView.tsx` | Las cajas de los caballos se animan por tiempo puro (CSS transition) asumiendo que dura 15s. No reaccionan a aceleración/posiciones en vivo del backend (falta telemetría). |
| **RaceView: Estados (Running/Settling)** | ✅ | `RaceView.tsx` | Reactivo a `race.current_state`. Muestra "Carrera en curso". |
| **RaceView: Poderes activos / Hazards** | ❌ | `RaceView.tsx` | No se visualizan íconos o auras sobre los caballos al activarse un poder. Falta integrar el payload de `POWER_APPLIED` en el componente. |
| **BettingView: Odds live / Pool por caballo** | ✅ | `BettingView.tsx` | Escucha `ODDS_UPDATE`. Calcula el pool localmente y ensancha las barras animadas dinámicamente. |
| **BettingView: Market closed / Trifecta**| ⚠️ | `BettingView.tsx` | Bloquea UX si estado `!= 'BettingOpen'`. **Trifecta**: Ausente, solo mapea `type === 'Win'`. |
| **SocialView: Deudas, favores, interés, "riesgo"**| ❌ | `SocialView.tsx` | Solo muestra `balance_total` y `balance_locked`. Falta extraer y mostrar campos de deudas del snapshot. |
| **NarratorLog: Cómico, eventos importantes** | ⚠️ | `NarratorLog.tsx` | Estilo visual implementado (colores por tipo). **Cómico**: Falta. Usa plantillas de texto secas y hardcodeadas ("Jugador X apostó Y"). |
| **AdminPanel: Crear lobby, start/stop, settle** | ✅ | `AdminPanel.tsx` | Botones funcionales apuntando a endpoints en `api.ts`. |
| **AdminPanel: Reset race / Loop** | ❌ | `AdminPanel.tsx` | No existe botón para arrancar la Carrera 2 en el mismo lobby una vez que la Carrera 1 llega a `Results`. |

---

## 3) Auditoría técnica (wsClient + Zustand)

- **Inicialización (Snapshot):** ✅ Funciona. Al hacer `onopen`, el cliente manda `{"type": "GET_STATE_SNAPSHOT"}` y hace bulk insert al `setSnapshot`.
- **Procesadores (Reducers):** ✅ Limpios. Zustand actualiza objetos inmutables mutando la copia. `BALANCE_UPDATE` va directo a cada slice de wallet sin tocar el resto.
- **Single-Socket & Backoff:** ⚠️ Hay un timer de `setInterval(connect, 3000)` básico, pero no hay jitter ni backoff exponencial. El modo estricto (`StrictMode`) de React18 en desarrollo dispara el `connectWS` dos veces si no está bien encapsulado en un `useEffect` limpio en la vista Setup, creando potenciales cierres abruptos (socket thrashing).
- **Dedupe de eventos:** ❌ Inexistente. El socket traga todo lo que el backend escupe. Si el backend duplica por accidente un `POWER_APPLIED`, el dashboard pintará dos mensajes seguidos en el log.
- **Resync en F5:** ✅ Robusto. Al apretar F5 en mitad de `RaceRunning`, Vite recarga, el WS manda el Handshake de snapshot y Zustand rehidrata el state completo en milisegundos saltando a la vista correcta gracias a la lectura condicional de `race.current_state`.

---

## 4) Auditoría UI por vistas ("Screenshots" Mentales)

### 4.1 RaceView
- **Timer/Estado:** Parcial (muestra estado literal, falta cronómetro real regresivo sincronizado a T-10s).
- **Progreso:** Las barras corren uniformemente de izquierda a derecha. Coherente pero estático.
- **Hazards/Poderes:** Vacío. No hay íconos flotantes.

### 4.2 BettingView
- **Odds live:** Excelente. Las barras llenan porcentualmente la pantalla de manera muy visual tipo casino. 
- **Overlays:** Muestra `CERRADO (CARRERA EN CURSO)` y cambia las tipografías de verde neón a gris muerto.
- **Trifecta/Lap:** No existe, ni tiene stubs visuales.

### 4.3 SocialView
- **Ranking:** Impecable orden descendente, resaltando en ámbar/oro al jugador rico.
- **Locked/Debt:** Muestra "DISPONIBLE" y "LOCKED", pero no menciona "DEUDA" ni "INTERÉS" (loans omitido).

### 4.4 NarratorLog
- **Templates:** Básicos técnicos, no usa randomizers ni lógica "cómica". 
- **Anti-spam:** No implementado; si hay 50 apuestas en 2 segundos, escupirá 50 globos de texto seguidos empujando la UI violentamente y comiendo RAM (aunque limitamos el array a 50 historial).

### 4.5 AdminPanel
- **Creación / QR:** Funciona perfecto pasando `lobbyData` al layout inicial. 
- **Controles:** Abajo fijo, oscuro transparente. Faltan ventanas de confirmación para "Force Settle" (click accidental arruina la carrera). Falta "Next Race".

---

## 5) Bugs/Riesgos (Impacto vs Severidad)

| ID | Sev | Descripción |
|---|---|---|
| **P0-1** | High | IP Hardcodeada: `src/core/api.ts` e `wsClient.ts` dicen `localhost:8000`. Si el Dashboard corre en la PC1 y los móviles entran desde la LAN, la request del móvil chocará tratando de conectarse al `localhost` del móvil. Debe usar import.meta.env o detección dinámica (`window.location.hostname`). |
| **P0-2** | High | Carrera bloqueada post-Settle. No hay forma de vaciar la pista y abrir apuestas para una **Carrera #2** sin matar el servidor. |
| **P1-1** | Med | No Confirmation on "Force Settle". Un click en `AdminPanel` arruina el ciclo de vida. |
| **P1-2** | Med | StrictMode Mount: El llamado a `connectWS` no cuenta con cleanup total en React 18 mount/unmount. |
| **P2-1** | Low | Textos aburridos de Narrador. Faltan variaciones string. |
| **P2-2** | Low | `SetSnapshot` pisa Arrays indiscriminadamente; podría haber parpadeos si no usa deep diff. |

---

## 6) Fix Plan (Top 5 Tareas Ordenadas por Impacto)

1. **Config Dinámica LAN-Ready (P0)**
   - **Qué:** Reemplazar `localhost:8000` por variables estáticas o resolver vía `window.location.hostname`.
   - **Archivo:** `api.ts`, `wsClient.ts`
   - **Acceptance:** Correr el build en otra IP de la misma LAN y que conecte sin fallas CORS ni Connection Refused.

2. **Loop de Carreras "Next Race" (P0)**
   - **Qué:** Añadir botón `[ NEXT RACE ]` en `AdminPanel` (aparece solo si estado es `Results`/`Settling`). Requiere un endpoint `POST /admin/race/next/{lobby}` en REST para que Backend genere otra Race asociada a la ID.
   - **Archivo:** `AdminPanel.tsx`, `api.ts`
   - **Acceptance:** Tras el Settle, GM aprieta botón, y la UI vuelve fluida al grid "ESPERANDO APUESTAS" y vacía los `placements`.

3. **Confirmation Modals para GM (P1)**
   - **Qué:** Envolver los métodos en `window.confirm("¿Seguro que quieres forzar solución?")`.
   - **Archivo:** `AdminPanel.tsx`
   - **Acceptance:** Click obliga doble check nativo.

4. **Copywriting Engine del Narrador (P1)**
   - **Qué:** Mapear switch statements en `NarratorLog` a librerías de templates con `Math.random()`. "¡X tiró el dinero a la basura apostando a Y!".
   - **Archivo:** `wsClient.ts` o modulo interno `logger.ts`
   - **Acceptance:** Apostar 3 veces genera 3 frases estructuralmente distintas.

5. **Aura/Indicador de Poderes (P2)**
   - **Qué:** Agregar badge "🔥 Power" a la barra del caballo cuando `state.race.active_powers` (por inyectar) lo requiera, o iluminar pantalla al recibir `POWER_APPLIED`.
   - **Archivo:** `RaceView.tsx`

---

## 7) Checklist Final "Demo Ready" (Pasos Exactos)

Una vez aplicados los 3 primeros fixes críticos:

1. Levantar backend: `docker compose up --build -d` (esperar Healthz).
2. Entrar a `dashboard/`, configurar `.env.local` con `VITE_API_URL=http://<YOUR_LAN_IP>:8000`. Correr `npm run dev -- --host`.
3. Abrir navegador en el Monitor Principal de la sala `/setup`.
4. Clickear "Crear Sala Principal". Verifica que el QR gigante aparezca usando la `<YOUR_LAN_IP>`.
5. Los 2 móviles de los amigos escanean el QR desde Android/iOS Safari.
6. Automáticamente en la pantalla gigante el Leaderboard registra: *"Jugador 1: $1000", "Jugador 2: $1000"*.
7. GM da click a "Adivinar la Trifecta" (Start Bets). 
8. En los móviles, hacen un POST y la pantalla grande mueve los porcentajes de `BettingView` narrando: *"¡Grito en la sala! Jugador 1 cree que Seabiscuit no la pechea."*
9. La carrera empieza (Automático T-10 o GM Force Start). Las barras corren y el mercado se bloquea poniéndose gris.
10. Settle automático. Lluvia de IDs de ganadores. Balances del Leaderboard cambian on the fly.
11. GM aprieta "NEXT RACE", bucle reinicia impecable sin apretar F5 en ningún lado.
