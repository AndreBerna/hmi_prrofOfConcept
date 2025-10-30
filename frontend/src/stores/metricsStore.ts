import { defineStore } from "pinia";

export interface MetricPayload {
  id: string;
  label: string;
  unit: string;
  value: number;
  publishedAt: number;
}

interface MetricState extends MetricPayload {
  lastUpdated: number;
}

interface RenderStats {
  fps: number;
  renderMs: number;
}

const LATENCY_WINDOW = 600;

export const useMetricsStore = defineStore("metrics", {
  state: () => ({
    metrics: {} as Record<string, MetricState>,
    order: [] as string[],
    latencySamples: [] as number[],
    latencyP50: 0,
    latencyP95: 0,
    fps: 0,
    renderMs: 0,
    lastFrameAt: 0
  }),
  getters: {
    metricList(state): MetricState[] {
      return state.order.map((id) => state.metrics[id]).filter(Boolean);
    }
  },
  actions: {
    applyUpdates(updates: MetricPayload[], frameTime: number) {
      if (!updates.length) return;
      const newIds: string[] = [];

      for (const update of updates) {
        const existing = this.metrics[update.id];
        if (!existing) {
          newIds.push(update.id);
        }
        this.metrics[update.id] = { ...update, lastUpdated: frameTime };
      }

      if (newIds.length) {
        for (const id of newIds) {
          if (!this.order.includes(id)) {
            this.order.push(id);
          }
        }
      }

      for (const update of updates) {
        const latency = Math.max(0, frameTime - update.publishedAt);
        this.latencySamples.push(latency);
      }

      if (this.latencySamples.length > LATENCY_WINDOW) {
        this.latencySamples.splice(0, this.latencySamples.length - LATENCY_WINDOW);
      }

      if (this.latencySamples.length) {
        const sorted = [...this.latencySamples].sort((a, b) => a - b);
        const p50Index = Math.floor(sorted.length * 0.5);
        const p95Index = Math.floor(sorted.length * 0.95);
        this.latencyP50 = sorted[p50Index] ?? this.latencyP50;
        this.latencyP95 = sorted[p95Index] ?? this.latencyP95;
      }
    },
    setRenderStats({ fps, renderMs }: RenderStats) {
      this.fps = fps;
      this.renderMs = renderMs;
    }
  }
});
