import { describe, expect, it } from "vitest";
import { observeTextImageOperation } from "../../../../tests/e2e/text-image-operation";

describe("text image E2E completion observer", () => {
  it("does not confuse a returned click with deferred generation completion", async () => {
    let finish!: (path: string) => void;
    const pending = new Promise<string>((resolve) => (finish = resolve));
    const service = { createImageFromText: () => pending };
    const original = service.createImageFromText;
    const operation = observeTextImageOperation(service);
    expect(operation.started).toBe(false);
    const result = service.createImageFromText();
    expect(operation.started).toBe(true);
    expect(operation.settled).toBe(false);
    finish("generated.png");
    expect(await result).toBe("generated.png");
    expect(operation).toMatchObject({ settled: true, path: "generated.png", error: null });
    expect(service.createImageFromText).toBe(original);
  });

  it.each([null, "", "   "])("fails closed on missing path %j", async (path) => {
    const service = { createImageFromText: async () => path };
    const operation = observeTextImageOperation(service);
    expect(await service.createImageFromText()).toBe(path);
    expect(operation).toMatchObject({ settled: true, path: null });
    expect(operation.error).toBeTruthy();
  });

  it("reports rejection without swallowing the application's error", async () => {
    const error = new Error("generation failed");
    const service = {
      createImageFromText: async () => {
        throw error;
      }
    };
    const operation = observeTextImageOperation(service);
    await expect(service.createImageFromText()).rejects.toBe(error);
    expect(operation).toMatchObject({ settled: true, path: null, error: error.message });
  });
});
