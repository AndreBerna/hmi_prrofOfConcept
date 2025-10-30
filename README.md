# Podman Automotive HMI Proof of Concept

This repository packages a complete automotive HMI dashboard prototype. It demonstrates a NanoMQ broker, a high-frequency TypeScript telemetry simulator, and a Vue 3/Vite dashboard accelerated with OffscreenCanvas workers. Everything runs locally with Podman or Docker via the native `podman compose` plugin, the standalone `podman-compose` shim, or `docker compose`.

## Architecture

| Service | Description |
| --- | --- |
| **broker** | NanoMQ broker exposing MQTT on 1883/TCP and WebSocket on 8083 for browser clients. Configured with persistence so retained telemetry survives restarts. |
| **simulator** | TypeScript publisher that generates ~20 vehicle metrics (speed, RPM, coolant temp, tyre pressure, etc.) at 1–50 Hz and publishes retained JSON payloads with timestamps. |
| **hmi** | Vue 3 + Vite frontend served on http://127.0.0.1:8080. It connects over WebSocket using `mqtt.js`, batches telemetry per animation frame, and renders a 4×5 instrument grid in an OffscreenCanvas worker at 60 FPS. |

The HMI keeps rendering overhead under 10 ms by diffing dirty metrics and redrawing only their cells. A debug overlay exposes FPS, render time, and p50/p95 end-to-end latency computed from simulator timestamps.

## Prerequisites

- Podman 4.4+ **with the Compose plugin available** (typically the `podman-plugins` package) or the standalone [`podman-compose`](https://github.com/containers/podman-compose) shim. Docker Engine 24+ with Compose v2 is a compatible fallback.
- An active Podman service connection. On macOS, Windows, and most desktop Linux installs this means running `podman machine init` once and `podman machine start` before using Compose. Verify connectivity with `podman info`.
- Ports 1883, 8080, and 8083 available on localhost.
- Podman 3.x users: short-name resolution is stricter on these releases. The provided compose file and Dockerfiles now pin fully-qualified image references (e.g. `docker.io/emqx/nanomq:0.21.6` and `docker.io/library/node:20-alpine`) so no manual registry configuration is required.

## Quick start

1. **Confirm Podman connectivity**
   ```bash
   podman info
   ```
   If this fails, run `podman machine init` (first time only) followed by `podman machine start` and retry.

2. **Ensure a Compose frontend is available**
   ```bash
   podman compose version   # or `podman-compose --version`, `docker compose version`
   ```
   Install the missing toolchain if the command is not found (see the troubleshooting matrix below).

3. **Start the full stack**
   ```bash
   ./scripts/compose.sh up -d
   ```
   The helper automatically prefers `podman compose`, falls back to `podman-compose`, and finally tries `docker compose`.

4. **Tail the logs (optional but recommended for first run)**
   ```bash
   ./scripts/compose.sh logs -f
   ```
   You should see NanoMQ announce both listeners, the simulator printing `Simulator connected to mqtt://broker:1883`, and the frontend `http-server` banner once the build finishes.

5. **Open the dashboard**
   Visit [http://127.0.0.1:8080](http://127.0.0.1:8080). Twenty metrics animate in a 4×5 grid and the debug overlay shows FPS, render time, and latency statistics. Refreshing the page immediately repopulates values thanks to retained MQTT messages.

6. **Shut everything down**
   ```bash
   ./scripts/compose.sh down
   ```
   This stops containers while keeping the built images cached for the next launch.

> 💡 The helper script injects the repository `docker-compose.yml` automatically, so you can run the commands above from any subdirectory within the repo.

### Podman compose troubleshooting

If `podman compose` prints `Error: unknown command` your distribution is missing the Compose plugin. Install one of the following packages (names vary slightly per OS):

| Distro | Command |
| --- | --- |
| Fedora / CentOS / RHEL | `sudo dnf install podman-plugins` |
| Debian / Ubuntu | `sudo apt install podman-compose` |
| Arch | `sudo pacman -S podman-docker` |

Alternatively, install the upstream Python shim via `pipx install podman-compose`. Once installed, re-run `podman compose version` to confirm the plugin is active.

If the compose command reports it "Cannot connect to Podman" or references a refused `podman.socket`, start the Podman machine first:

```bash
podman machine init    # first run only
podman machine start   # each time you reboot or resume
podman info            # should now succeed
```

Once the machine is running, rerun `./scripts/compose.sh up -d`.

### Older Podman registries configuration

Podman 3.x predates the default short-name registry hints used by modern images. If you see build errors such as `short-name "node:20-alpine" did not resolve to an alias`, update to Podman 4.x+ or keep the fully-qualified references included in this repository. The compose services that build locally are tagged as `localhost/<name>` so Podman treats them as local images instead of pulling from a registry. When adding new base images, prefer the `docker.io/<namespace>/<image>:<tag>` form or configure `/etc/containers/registries.conf` with explicit short-name aliases.

Open http://127.0.0.1:8080 in a modern browser with OffscreenCanvas support (Chrome, Edge, or Firefox Nightly). You should see 20 animated widgets with a live performance overlay.

### NanoMQ fails to start with `Unrecognized .` / `syntax error`

These errors indicate the broker could not parse its configuration file. The repository ships with a NanoMQ v0.21-compatible config at `broker/nanomq.conf`. Verify that your compose run mounts the file read-only (it does by default) and that no local edits introduced invalid keys. Restoring the file from git fixes the issue:

```bash
git checkout -- broker/nanomq.conf
./scripts/compose.sh restart broker
```

When adding additional listeners stick to the dot-prefixed blocks NanoMQ expects (e.g., `listeners.ws { ... }`).

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
- Regenerate the production build with `./scripts/compose.sh build hmi` if frontend assets change.

## Shutdown

```bash
./scripts/compose.sh down
```

This stops and removes all running containers without deleting built images.
