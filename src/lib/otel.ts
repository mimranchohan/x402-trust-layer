import { logger } from "./logger.js";

let started = false;

/** Start OpenTelemetry when OTEL_ENABLED=1 and packages are installed. */
export async function startOtelIfEnabled(): Promise<void> {
  if (started || process.env.OTEL_ENABLED !== "1") return;
  try {
    const spec = "@opentelemetry/sdk-node";
    const mod = await import(/* webpackIgnore: true */ spec);
    const autoSpec = "@opentelemetry/auto-instrumentations-node";
    const auto = await import(/* webpackIgnore: true */ autoSpec);
    const sdk = new mod.NodeSDK({
      instrumentations: [auto.getNodeAutoInstrumentations()],
    });
    await sdk.start();
    started = true;
    logger.info({}, "OpenTelemetry SDK started");
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        hint: "npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node",
      },
      "OpenTelemetry not started",
    );
  }
}
