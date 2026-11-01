import { ipcRenderer } from "electron";
import { storageService } from "@/frontend/services/card-storage-service";

describe("text image storage IPC", () => {
  it("forwards dimensions without changing legacy square-default calls", async () => {
    vi.mocked(ipcRenderer.invoke).mockResolvedValue("generated.png");
    const size = { width: 900, height: 300 };
    expect(await storageService.createImageFromText("set.linka", "Кот", size)).toBe(
      "generated.png"
    );
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      "storage:createImageFromText",
      "set.linka",
      "Кот",
      size
    );
    await storageService.createImageFromText("set.linka", "Кот");
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      "storage:createImageFromText",
      "set.linka",
      "Кот",
      undefined
    );
  });
});
