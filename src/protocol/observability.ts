import { readProtocolStore, writeProtocolStore } from "./store.js";

type MetricEvent = {
  name: string;
  at: string;
  labels: Record<string, string>;
  value: number;
};

type MetricStore = { events: MetricEvent[] };

export async function recordProtocolMetric(
  name: string,
  labels: Record<string, string> = {},
  value = 1,
): Promise<void> {
  const store = await readProtocolStore<MetricStore>("otel-metrics", { events: [] });
  store.events.push({ name, at: new Date().toISOString(), labels, value });
  if (store.events.length > 5000) store.events = store.events.slice(-3000);
  await writeProtocolStore("otel-metrics", store);
}

export async function getProtocolMetricsSnapshot(): Promise<{
  openTelemetryCompatible: boolean;
  traceFormat: string;
  recent: MetricEvent[];
  counters: Record<string, number>;
}> {
  const store = await readProtocolStore<MetricStore>("otel-metrics", { events: [] });
  const counters: Record<string, number> = {};
  for (const e of store.events) {
    counters[e.name] = (counters[e.name] ?? 0) + e.value;
  }
  return {
    openTelemetryCompatible: true,
    traceFormat: "x402-trust-layer-trace-v1",
    recent: store.events.slice(-50),
    counters,
  };
}
