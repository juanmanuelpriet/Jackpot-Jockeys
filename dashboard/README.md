# Jackpot Jockeys: The Show (Dashboard PC) 🖥️🏁

Esta es la interfaz principal (Etapa 3 MVP) del ecosistema de **Jackpot Jockeys**. Está diseñada para funcionar como un "Broadcast Overlay" de Casino Futurista en la red local (LAN), conectándose directamente al **Backend Autoritativo**.

## 🌟 Características

1. **Admin / GM Console (`SetupView`)**
   - Creación rápida de Lobby con `join_code` autogenerado (ej: XB34Z).
   - Render ultra-rápido de código QR nativo escalable para que los jugadores escaneen.
2. **The Show (`TheShowView`)**
   - **Race View (Pista):** Renderiza el estado de la carrera (`RaceRunning`) y mapea dinámicamente el avance de los caballos según eventos del backend.
   - **Betting View (Apuestas):** Gráficos de barra porcentuales dinámicos e impulsados por WebSockets (`ODDS_UPDATE`), mostrando Live-Odds de Parimutuel.
   - **Social Leaderboard:** Integración en tiempo real (`BALANCE_UPDATE`) para ordenar jugadores basados en su balance bancario (`balance_total`).
   - **El Narrador:** Feed histórico cronológico interceptando logs tipo `BET_PLACED` (Apuestas) y `POWER_APPLIED` (Poderes) transformándolos a formato TV.

## 🛠️ Stack Tecnológico

- **React 18** + **TypeScript** (Vite)
- **Tailwind CSS v3.4:** Estilizado hiper-rápido con Glassmorphism (`backdrop-blur`) y Neon Glows ad-hoc (`text-glow-accent`).
- **Zustand:** Manejador de estado global asíncrono.
- **Axios:** Para comandos críticos del Game Master (`/admin/race/start`, `/admin/race/settle`).
- **WebSockets HTML5 Nativos:** `wsClient.ts` custom con recolector Garbage Collect auto-limpiable, Heartbeat (`PING 30s`) y Auto-Reconnect inteligente (Pide `GET_STATE_SNAPSHOT` al despertar).

## 🚀 Cómo Correr el Dashboard (LAN-First)

Para abrir la consola del "Game Master" / Espectador principal (Ideal en Smart TV o monitor grande).

**Requisito previo:** Debes tener el [Backend corriendo primero](../backend/README.md) en Docker (Puerto 8000).

```bash
# 1. Instalar dependencias
cd dashboard
npm install

# 2. Correr el servidor exponiéndolo a toda la red local/Wi-Fi
npm run dev -- --host 0.0.0.0
```

> **Abre `http://localhost:5173` en tu navegador.**  
*(Nota: Si juegas LAN, usa la IP real de la máquina como `http://192.168.1.10:5173` en la Smart TV).*

## 📡 Integración Core WebSockets
El dashboard depende estrechamente de su cliente WS (`src/core/wsClient.ts`), mapeado directamente al backend.
- `GET_STATE_SNAPSHOT` es solicitado cada vez que React detecta que se inicializó un cliente o hubo un corte de red de microsegundos, para evitar desincronizaciones de UI.
- Escucha los 8 Hooks obligatorios del *Architectural Spec*.

## 📌 Siguientes Pasos (Roadmap)
- Integrar Assets 2D (Render Caballos y Pixel Art).
- Integrar Partículas Canvas Confetti en evento `SETTLEMENT_COMPLETE`.
- Modales de alertas/notificación lateral para los `Loans` (Préstamos).
