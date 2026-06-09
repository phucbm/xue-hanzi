import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { resourceFromAttributes } from "@opentelemetry/resources";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

const tracerProvider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    "service.name": process.env.VERCEL_ENV ?? "development",
  }),
  spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();
