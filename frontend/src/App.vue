<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Podman HMI Prototype</h1>
      <p>Real-time vehicle telemetry rendered at 60 FPS.</p>
    </header>
    <main class="app-main">
      <div class="canvas-wrapper">
        <canvas ref="canvasRef" class="hmi-canvas"></canvas>
        <DebugOverlay />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import DebugOverlay from "@/components/DebugOverlay.vue";
import { useMetricsStore, type MetricPayload } from "@/stores/metricsStore";
import { connectMqtt } from "@/utils/mqtt";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const metricsStore = useMetricsStore();
let worker: Worker | null = null;
let rafHandle = 0;
let disconnectMqtt: (() => void) | null = null;
const pendingUpdates: MetricPayload[] = [];

function flushFrame() {
  const updates = pendingUpdates.splice(0, pendingUpdates.length);
  if (updates.length) {
    const frameTime = performance.timeOrigin + performance.now();
    metricsStore.applyUpdates(updates, frameTime);
    worker?.postMessage({
      type: "metrics",
      updates: updates.map((update) => ({
        id: update.id,
        label: update.label,
        unit: update.unit,
        value: update.value
      })),
      order: [...metricsStore.order]
    });
  }
  rafHandle = requestAnimationFrame(flushFrame);
}

function sendResize() {
  if (!worker || !canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  worker.postMessage({
    type: "resize",
    width: rect.width,
    height: rect.height,
    devicePixelRatio: window.devicePixelRatio ?? 1
  });
}

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  worker = new Worker(new URL("./workers/metricsRenderer.ts", import.meta.url), { type: "module" });
  const offscreen = canvas.transferControlToOffscreen();
  worker.postMessage(
    {
      type: "init",
      canvas: offscreen,
      width: rect.width,
      height: rect.height,
      devicePixelRatio: window.devicePixelRatio ?? 1
    },
    [offscreen]
  );
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === "perf") {
      metricsStore.setRenderStats(data);
    }
  };

  const url = import.meta.env.VITE_MQTT_URL ?? `ws://${window.location.hostname}:8083/mqtt`;
  const subscription = import.meta.env.VITE_MQTT_TOPIC ?? "hmi/metrics/#";
  const client = connectMqtt({
    url,
    subscription,
    onMetric: (metric) => {
      pendingUpdates.push(metric);
    }
  });
  disconnectMqtt = () => client.end(true);

  window.addEventListener("resize", sendResize);
  sendResize();
  rafHandle = requestAnimationFrame(flushFrame);
});

onUnmounted(() => {
  if (rafHandle) cancelAnimationFrame(rafHandle);
  window.removeEventListener("resize", sendResize);
  worker?.terminate();
  worker = null;
  if (disconnectMqtt) {
    disconnectMqtt();
    disconnectMqtt = null;
  }
});
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: #e2e8f0;
  padding: 24px;
  box-sizing: border-box;
  gap: 24px;
}

.app-header {
  text-align: left;
}

.app-header h1 {
  margin: 0;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #38bdf8;
}

.app-header p {
  margin: 4px 0 0;
  color: #94a3b8;
}

.app-main {
  flex: 1;
  display: flex;
}

.canvas-wrapper {
  position: relative;
  flex: 1;
  border-radius: 24px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.6);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.15);
}

.hmi-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
