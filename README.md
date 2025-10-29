# Podman Automotive HMI Proof of Concept

This repository packages a complete automotive HMI dashboard prototype. It demonstrates a NanoMQ broker, a high-frequency TypeScript telemetry simulator, and a Vue 3/Vite dashboard accelerated with OffscreenCanvas workers. Everything runs locally with Podman or Docker via `podman compose up -d`.

## Architecture

| Service | Description |
| --- | --- |
| **broker** | NanoMQ broker exposing MQTT on 1883/TCP and WebSocket on 8083 for browser clients. Configured with persistence so retained telemetry survives restarts. |
| **simulator** | TypeScript publisher that generates ~20 vehicle metrics (speed, RPM, coolant temp, tyre pressure, etc.) at 1–50 Hz and publishes retained JSON payloads with timestamps. |
| **hmi** | Vue 3 + Vite frontend served on http://127.0.0.1:8080. It connects over WebSocket using `mqtt.js`, batches telemetry per animation frame, and renders a 4×5 instrument grid in an OffscreenCanvas worker at 60 FPS. |

The HMI keeps rendering overhead under 10 ms by diffing dirty metrics and redrawing only their cells. A debug overlay exposes FPS, render time, and p50/p95 end-to-end latency computed from simulator timestamps.

## Prerequisites

- Podman 4.4+ with `podman compose` (or Docker Engine 24+ if preferred).
- Ports 1883, 8080, and 8083 available on localhost.

## Quick start

```bash
# Launch all services in the background
podman compose up -d

# Watch container logs (optional)
podman compose logs -f
```

Open http://127.0.0.1:8080 in a modern browser with OffscreenCanvas support (Chrome, Edge, or Firefox Nightly). You should see 20 animated widgets with a live performance overlay.

## Project layout

```
.
├── broker/            # NanoMQ configuration
├── simulator/         # TypeScript telemetry publisher + Dockerfile
├── frontend/          # Vue 3 dashboard with OffscreenCanvas worker renderer
├── docker-compose.yml # Podman-compatible compose setup
└── README.md
```

### Simulator topics

The simulator publishes retained messages to `hmi/metrics/<metricId>` with payloads like:

```json
{
  "id": "vehicleSpeed",
  "label": "Speed",
  "unit": "km/h",
  "value": 122,
  "publishedAt": 1712419200000
}
```

Every message is retained so the dashboard shows the last known value immediately after refresh.

### Frontend rendering pipeline

1. The browser connects to NanoMQ via `mqtt.js` over WebSocket (ws://broker:8083/mqtt).
2. Messages are queued and flushed once per `requestAnimationFrame`, keeping the Vue/Pinia state updates deterministic and frame-bound.
3. The OffscreenCanvas worker receives compact metric batches and redraws only dirty cells on a single shared canvas, maintaining ~60 FPS with <10 ms render times.
4. Simulator timestamps are compared to render timestamps to compute live p50/p95 end-to-end latency in the overlay.

## Development notes

- The simulator implements a minimal MQTT 3.1.1 publisher over raw TCP sockets, avoiding external dependencies while still supporting retained QoS0 messages.
- The NanoMQ config enables both TCP and WebSocket listeners and persistence.
- The frontend build runs entirely inside Podman containers; no global Node.js install is required on the host.

## Maintenance

- Update metric rendering thresholds inside `frontend/src/workers/metricsRenderer.ts#getMetricRange` if you add new telemetry.
- To adjust MQTT topics, change `MQTT_TOPIC_PREFIX` in the simulator env and `VITE_MQTT_TOPIC` in `docker-compose.yml`.
- Regenerate the production build with `podman compose build hmi` if frontend assets change.

## Shutdown

```bash
podman compose down
```

This stops and removes all running containers without deleting built images.
