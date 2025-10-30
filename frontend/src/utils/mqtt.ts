import { connect, MqttClient } from "mqtt/dist/mqtt";
import type { MetricPayload } from "@/stores/metricsStore";

interface ConnectOptions {
  url: string;
  subscription: string;
  onMetric: (metric: MetricPayload) => void;
}

export function connectMqtt({ url, subscription, onMetric }: ConnectOptions): MqttClient {
  const client = connect(url, {
    reconnectPeriod: 1000,
    clean: true,
    connectTimeout: 5_000
  });

  client.on("connect", () => {
    client.subscribe(subscription, { qos: 0 });
  });

  client.on("message", (_topic, payload) => {
    try {
      const decoded = JSON.parse(payload.toString());
      if (decoded && decoded.id) {
        const metric: MetricPayload = {
          id: decoded.id,
          label: decoded.label ?? decoded.id,
          unit: decoded.unit ?? "",
          value: Number(decoded.value ?? 0),
          publishedAt: Number(decoded.publishedAt ?? Date.now())
        };
        onMetric(metric);
      }
    } catch (error) {
      console.error("Failed to parse metric message", error);
    }
  });

  client.on("error", (err) => {
    console.error("MQTT client error", err);
  });

  return client;
}
