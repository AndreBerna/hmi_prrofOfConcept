interface InitMessage {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface ResizeMessage {
  type: "resize";
  width: number;
  height: number;
  devicePixelRatio: number;
}

interface MetricUpdate {
  id: string;
  label: string;
  unit: string;
  value: number;
}

interface MetricsMessage {
  type: "metrics";
  updates: MetricUpdate[];
  order: string[];
}

type WorkerMessage = InitMessage | ResizeMessage | MetricsMessage;

interface MetricVisual extends MetricUpdate {
  dirty: boolean;
  lastRenderedValue: number;
}

const state = {
  canvas: null as OffscreenCanvas | null,
  ctx: null as OffscreenCanvasRenderingContext2D | null,
  devicePixelRatio: 1,
  width: 1280,
  height: 720,
  metrics: new Map<string, MetricVisual>(),
  order: [] as string[],
  frameTimer: null as number | null,
  lastFpsStamp: 0,
  frameCounter: 0,
  currentFps: 0,
  lastPerfPost: 0
};

const FRAME_INTERVAL = 1000 / 60;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  switch (data.type) {
    case "init":
      state.canvas = data.canvas;
      state.devicePixelRatio = data.devicePixelRatio;
      state.width = data.width;
      state.height = data.height;
      initializeCanvas();
      startLoop();
      break;
    case "resize":
      state.devicePixelRatio = data.devicePixelRatio;
      state.width = data.width;
      state.height = data.height;
      resizeCanvas();
      break;
    case "metrics":
      state.order = data.order;
      for (const update of data.updates) {
        const existing = state.metrics.get(update.id);
        if (existing) {
          existing.label = update.label;
          existing.unit = update.unit;
          existing.value = update.value;
          if (existing.lastRenderedValue !== update.value) {
            existing.dirty = true;
          }
        } else {
          state.metrics.set(update.id, {
            ...update,
            dirty: true,
            lastRenderedValue: Number.NaN
          });
        }
      }
      break;
  }
};

function initializeCanvas() {
  if (!state.canvas) return;
  resizeCanvas();
}

function resizeCanvas() {
  if (!state.canvas) return;
  state.canvas.width = Math.max(1, Math.floor(state.width * state.devicePixelRatio));
  state.canvas.height = Math.max(1, Math.floor(state.height * state.devicePixelRatio));
  const ctx = state.canvas.getContext("2d");
  if (!ctx) return;
  state.ctx = ctx;
  ctx.resetTransform();
  ctx.scale(state.devicePixelRatio, state.devicePixelRatio);
  ctx.font = "16px 'Inter', system-ui";
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, state.width, state.height);
  state.metrics.forEach((metric) => (metric.dirty = true));
}

function startLoop() {
  if (state.frameTimer !== null) {
    clearInterval(state.frameTimer);
  }
  state.frameTimer = setInterval(renderFrame, FRAME_INTERVAL);
}

function renderFrame() {
  const ctx = state.ctx;
  if (!ctx || !state.canvas) return;

  const start = performance.now();
  const total = state.order.length;
  if (!total) {
    updateFps();
    return;
  }
  const cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(total))));
  const rows = Math.ceil(total / cols) || 1;
  const padding = 16;
  const gap = 12;
  const availableWidth = state.width - padding * 2 - gap * (cols - 1);
  const availableHeight = state.height - padding * 2 - gap * (rows - 1);
  const cellWidth = availableWidth / cols;
  const cellHeight = availableHeight / rows;

  let renderedDirty = false;

  state.order.forEach((id, index) => {
    const metric = state.metrics.get(id);
    if (!metric) return;
    if (!metric.dirty && Number.isFinite(metric.lastRenderedValue)) {
      return;
    }

    renderedDirty = true;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = padding + col * (cellWidth + gap);
    const y = padding + row * (cellHeight + gap);

    ctx.save();
    ctx.beginPath();
    const radius = 12;
    roundedRect(ctx, x, y, cellWidth, cellHeight, radius);
    ctx.clip();
    ctx.clearRect(x, y, cellWidth, cellHeight);
    const gradient = ctx.createLinearGradient(x, y, x, y + cellHeight);
    gradient.addColorStop(0, "#0b1f3a");
    gradient.addColorStop(1, "#031022");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, cellWidth, cellHeight);

    ctx.fillStyle = "#cbd5f5";
    ctx.font = "bold 18px 'Inter', system-ui";
    ctx.fillText(metric.label, x + 16, y + 28);

    ctx.font = "42px 'Inter', system-ui";
    ctx.fillStyle = "#38bdf8";
    const valueText = `${metric.value}`;
    ctx.fillText(valueText, x + 16, y + 72);

    ctx.font = "20px 'Inter', system-ui";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(metric.unit, x + 16, y + 102);

    drawTrendBar(
      ctx,
      x + 16,
      y + cellHeight - 44,
      cellWidth - 32,
      12,
      metric.value,
      metric.id
    );

    ctx.restore();

    metric.lastRenderedValue = metric.value;
    metric.dirty = false;
  });

  const renderTime = performance.now() - start;
  updateFps();
  const now = performance.now();
  if (renderedDirty || now - state.lastPerfPost > 250) {
    state.lastPerfPost = now;
    self.postMessage({
      type: "perf",
      fps: state.currentFps,
      renderMs: renderTime
    });
  }
}

function drawTrendBar(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  metricId: string
) {
  ctx.fillStyle = "#0f172a";
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
  const max = getMetricRange(metricId);
  const percent = Math.max(0, Math.min(1, value / max));
  const fillWidth = width * percent;
  const gradient = ctx.createLinearGradient(x, y, x + fillWidth, y);
  gradient.addColorStop(0, "#22d3ee");
  gradient.addColorStop(1, "#3b82f6");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, fillWidth, height);
}

function getMetricRange(id: string): number {
  switch (id) {
    case "engineRpm":
      return 8000;
    case "boostPressure":
    case "oilPressure":
      return 800;
    case "coolantTemp":
    case "oilTemp":
    case "intakeTemp":
    case "ambientTemp":
      return 150;
    case "fuelLevel":
    case "throttle":
    case "brakePressure":
      return 100;
    case "batteryVoltage":
      return 16;
    case "instantConsumption":
    case "avgConsumption":
      return 30;
    case "steeringAngle":
      return 1080;
    case "gear":
      return 10;
    case "odometer":
    case "trip":
      return 500;
    case "tirePressureFrontLeft":
    case "tirePressureFrontRight":
      return 50;
    default:
      return 260;
  }
}

function updateFps() {
  const now = performance.now();
  state.frameCounter += 1;
  if (!state.lastFpsStamp) {
    state.lastFpsStamp = now;
  }
  const elapsed = now - state.lastFpsStamp;
  if (elapsed >= 500) {
    state.currentFps = (state.frameCounter * 1000) / elapsed;
    state.frameCounter = 0;
    state.lastFpsStamp = now;
  }
}

function roundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export default null;
