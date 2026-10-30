export function observeTextImageOperation(service: {
  createImageFromText: (...args: unknown[]) => Promise<string | null>;
}) {
  const original = service.createImageFromText;
  const operation = {
    started: false,
    settled: false,
    path: null as string | null,
    error: null as string | null,
    startedAt: null as number | null,
    settledAt: null as number | null
  };
  service.createImageFromText = async function (...args) {
    service.createImageFromText = original;
    operation.started = true;
    operation.startedAt = performance.now();
    try {
      const value = await original.apply(this, args);
      if (typeof value !== "string" || !value.trim()) {
        operation.error = "Image generation returned no path";
      } else operation.path = value;
      return value;
    } catch (error) {
      operation.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      operation.settled = true;
      operation.settledAt = performance.now();
    }
  };
  return operation;
}
