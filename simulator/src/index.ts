import net from "node:net";
import { URL } from "node:url";

type QoS = 0 | 1 | 2;

interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  smoothing: number;
  frequency: number; // Hz
  precision?: number;
  generator?: (current: number) => number;
}

interface MetricState {
  value: number;
  target: number;
}

const MQTT_URL = process.env.MQTT_URL ?? "mqtt://broker:1883";
const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX ?? "hmi/metrics";
const KEEP_ALIVE_SECONDS = 60;

class SimpleMqttPublisher {
  private socket: net.Socket | null = null;
  private url: URL;
  private clientId: string;
  private isReady = false;
  private connectPromise: Promise<void> | null = null;

  constructor(brokerUrl: string, clientId?: string) {
    this.url = new URL(brokerUrl);
    this.clientId = clientId ?? `sim-${Math.random().toString(16).slice(2)}`;
  }

  async connect() {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const port = Number(this.url.port || 1883);
      const host = this.url.hostname;
      this.socket = net.createConnection(port, host);

      this.socket.once("connect", () => {
        const connectPacket = this.buildConnectPacket();
        this.socket?.write(connectPacket);
      });

      this.socket.once("error", (err: NodeJS.ErrnoException) => {
        reject(err);
      });

      this.socket.on("error", (err: NodeJS.ErrnoException) => {
        console.error("MQTT socket error", err);
      });

      this.socket.on("data", (chunk: Buffer) => {
        if (!this.isReady && chunk.length >= 4) {
          if (chunk[0] === 0x20 && chunk[1] >= 0x02 && chunk[3] === 0x00) {
            this.isReady = true;
            resolve();
          } else {
            reject(new Error("MQTT broker rejected connection"));
          }
        }
      });

      this.socket.on("close", () => {
        this.isReady = false;
        this.connectPromise = null;
      });
    });

    return this.connectPromise;
  }

  publish(topic: string, payload: Buffer, options: { retain?: boolean; qos?: QoS } = {}) {
    if (!this.socket || !this.isReady) {
      throw new Error("MQTT publisher not connected");
    }

    const retainFlag = options.retain ? 0x01 : 0x00;
    const qosFlag = options.qos ? options.qos << 1 : 0;
    const fixedHeader = 0x30 | retainFlag | qosFlag;
    const topicBuffer = encodeUtf8String(topic);
    const remainingLength = topicBuffer.length + payload.length;
    const packet = Buffer.concat([
      Buffer.from([fixedHeader, ...encodeRemainingLength(remainingLength)]),
      topicBuffer,
      payload
    ]);

    this.socket.write(packet);
  }

  end() {
    this.socket?.end();
  }

  private buildConnectPacket(): Buffer {
    const protocolName = encodeUtf8String("MQTT");
    const protocolLevel = Buffer.from([0x04]);
    const connectFlags = Buffer.from([0x02]); // clean session
    const keepAlive = Buffer.from([(KEEP_ALIVE_SECONDS >> 8) & 0xff, KEEP_ALIVE_SECONDS & 0xff]);
    const clientId = encodeUtf8String(this.clientId);

    const variableHeader = Buffer.concat([protocolName, protocolLevel, connectFlags, keepAlive]);
    const payload = Buffer.concat([clientId]);
    const remainingLength = encodeRemainingLength(variableHeader.length + payload.length);

    return Buffer.concat([
      Buffer.from([0x10, ...remainingLength]),
      variableHeader,
      payload
    ]);
  }
}

function encodeUtf8String(value: string): Buffer {
  const stringBuf = Buffer.from(value, "utf8");
  const length = Buffer.from([(stringBuf.length >> 8) & 0xff, stringBuf.length & 0xff]);
  return Buffer.concat([length, stringBuf]);
}

function encodeRemainingLength(length: number): number[] {
  const bytes: number[] = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) {
      digit = digit | 0x80;
    }
    bytes.push(digit);
  } while (length > 0);
  return bytes;
}

const metrics: MetricDefinition[] = [
  { id: "vehicleSpeed", label: "Speed", unit: "km/h", min: 0, max: 240, smoothing: 0.2, frequency: 20 },
  { id: "engineRpm", label: "RPM", unit: "rpm", min: 700, max: 7200, smoothing: 0.18, frequency: 30 },
  { id: "coolantTemp", label: "Coolant", unit: "°C", min: 70, max: 110, smoothing: 0.05, frequency: 5, precision: 1 },
  { id: "oilTemp", label: "Oil Temp", unit: "°C", min: 60, max: 130, smoothing: 0.04, frequency: 5, precision: 1 },
  { id: "fuelLevel", label: "Fuel", unit: "%", min: 5, max: 100, smoothing: 0.01, frequency: 1, precision: 1, generator: (value) => Math.max(0, value - Math.random() * 0.1) },
  { id: "batteryVoltage", label: "Battery", unit: "V", min: 12.2, max: 14.4, smoothing: 0.03, frequency: 2, precision: 2 },
  { id: "instantConsumption", label: "Cons.", unit: "L/100km", min: 3, max: 25, smoothing: 0.2, frequency: 15, precision: 1 },
  { id: "avgConsumption", label: "Avg Cons.", unit: "L/100km", min: 4, max: 12, smoothing: 0.01, frequency: 1, precision: 1 },
  { id: "boostPressure", label: "Boost", unit: "kPa", min: 95, max: 190, smoothing: 0.25, frequency: 25, precision: 1 },
  { id: "oilPressure", label: "Oil Press", unit: "kPa", min: 200, max: 600, smoothing: 0.1, frequency: 10 },
  { id: "intakeTemp", label: "Intake", unit: "°C", min: 20, max: 75, smoothing: 0.06, frequency: 5, precision: 1 },
  { id: "ambientTemp", label: "Ambient", unit: "°C", min: -10, max: 45, smoothing: 0.02, frequency: 0.5, precision: 1 },
  { id: "steeringAngle", label: "Steer", unit: "°", min: -540, max: 540, smoothing: 0.35, frequency: 30, precision: 0 },
  { id: "brakePressure", label: "Brake", unit: "%", min: 0, max: 100, smoothing: 0.4, frequency: 30 },
  { id: "throttle", label: "Throttle", unit: "%", min: 0, max: 100, smoothing: 0.3, frequency: 30 },
  { id: "gear", label: "Gear", unit: "", min: 1, max: 8, smoothing: 1, frequency: 2, generator: () => Math.floor(Math.random() * 8) + 1 },
  { id: "odometer", label: "Odo", unit: "km", min: 0, max: 200000, smoothing: 0.00001, frequency: 1, generator: (value) => value + Math.random() * 0.05 },
  { id: "trip", label: "Trip", unit: "km", min: 0, max: 500, smoothing: 0.0002, frequency: 2, generator: (value) => value + Math.random() * 0.02 },
  { id: "tirePressureFrontLeft", label: "FL Tire", unit: "psi", min: 30, max: 38, smoothing: 0.05, frequency: 2, precision: 1 },
  { id: "tirePressureFrontRight", label: "FR Tire", unit: "psi", min: 30, max: 38, smoothing: 0.05, frequency: 2, precision: 1 }
];

const metricStates: Record<string, MetricState> = Object.fromEntries(
  metrics.map((metric) => [metric.id, { value: metric.min, target: randomInRange(metric.min, metric.max) }])
);

const publisher = new SimpleMqttPublisher(MQTT_URL);

publisher
  .connect()
  .then(() => {
    console.log(`Simulator connected to ${MQTT_URL}`);
    metrics.forEach((metric) => startMetricTimer(metric));
  })
  .catch((err) => {
    console.error("Failed to connect to MQTT broker", err);
    process.exit(1);
  });

function startMetricTimer(metric: MetricDefinition) {
  const intervalMs = Math.max(1000 / metric.frequency, 10);
  setInterval(() => publishMetric(metric), intervalMs).unref();
  publishMetric(metric);
}

function publishMetric(metric: MetricDefinition) {
  const state = metricStates[metric.id];
  const generator = metric.generator ?? defaultGenerator(metric);
  const nextValue = generator(state.value);
  state.value = clamp(nextValue, metric.min, metric.max);

  if (Math.abs(state.value - state.target) < metric.smoothing * 5) {
    state.target = randomInRange(metric.min, metric.max);
  }

  const payload = {
    id: metric.id,
    label: metric.label,
    unit: metric.unit,
    value: Number(state.value.toFixed(metric.precision ?? 0)),
    publishedAt: Date.now()
  };

  const topic = `${MQTT_TOPIC_PREFIX}/${metric.id}`;
  publisher.publish(topic, Buffer.from(JSON.stringify(payload)), { retain: true, qos: 0 });
}

function defaultGenerator(metric: MetricDefinition) {
  return (current: number) => {
    const state = metricStates[metric.id];
    const towards = state.target - current;
    const noise = (Math.random() - 0.5) * metric.smoothing * (metric.max - metric.min) * 0.01;
    return current + towards * metric.smoothing + noise;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

process.on("SIGINT", () => {
  publisher.end();
  process.exit(0);
});
