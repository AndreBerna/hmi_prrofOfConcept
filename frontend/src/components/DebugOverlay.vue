<template>
  <div class="overlay">
    <div class="stat">
      <span>FPS</span>
      <strong>{{ fpsDisplay }}</strong>
    </div>
    <div class="stat">
      <span>Render (ms)</span>
      <strong>{{ renderDisplay }}</strong>
    </div>
    <div class="stat">
      <span>Latency p50 (ms)</span>
      <strong>{{ latencyP50Display }}</strong>
    </div>
    <div class="stat">
      <span>Latency p95 (ms)</span>
      <strong>{{ latencyP95Display }}</strong>
    </div>
    <div class="stat">
      <span>Metrics</span>
      <strong>{{ metricCount }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useMetricsStore } from "@/stores/metricsStore";

const metricsStore = useMetricsStore();
const { fps, renderMs, latencyP50, latencyP95, metricList } = storeToRefs(metricsStore);

const metricCount = computed(() => metricList.value.length);
const fpsDisplay = computed(() => fps.value ? fps.value.toFixed(1) : "--");
const renderDisplay = computed(() => renderMs.value ? renderMs.value.toFixed(2) : "--");
const latencyP50Display = computed(() => latencyP50.value ? latencyP50.value.toFixed(1) : "--");
const latencyP95Display = computed(() => latencyP95.value ? latencyP95.value.toFixed(1) : "--");
</script>

<style scoped>
.overlay {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 12px;
  background: rgba(2, 6, 23, 0.75);
  border-radius: 12px;
  padding: 12px 16px;
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 25px rgba(2, 6, 23, 0.4);
}

.stat {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stat strong {
  color: #f8fafc;
  font-size: 18px;
  letter-spacing: normal;
}
</style>
