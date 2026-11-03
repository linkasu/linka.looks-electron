import { contextBridge, ipcRenderer } from "electron";
import type { TypingBridge } from "../common/typing";

function sync(operation: string, value?: unknown) {
  const result = ipcRenderer.sendSync("typing:sync", operation, value);
  if (!result?.ok) throw new Error("Typing storage unavailable");
  return result.value;
}

const bridge: TypingBridge = {
  load: () => sync("load"),
  save: (draft) => {
    sync("save", draft);
  },
  settings: () => sync("settings"),
  predict: async (id, input) => {
    const result = await ipcRenderer.invoke("typing:predict", id, input);
    if (!result.ok) throw new Error(result.code);
    return result.value;
  },
  cancel: (id) => ipcRenderer.send("typing:cancel", id),
  bounds: (data) => ipcRenderer.send("typing:bounds", data),
  onEye: (channel, listener) => {
    if (!["eye-enter", "eye-exit", "eye-click"].includes(channel))
      throw new Error("INVALID_CHANNEL");
    const wrapped = (_event: unknown, data: unknown) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
  speak: async (text) => {
    const ok = await ipcRenderer.invoke("typing:speak", text);
    if (!ok) throw new Error("Speech unavailable");
  },
  stop: () => ipcRenderer.send("typing:stop"),
  close: () => ipcRenderer.send("typing:close")
};

contextBridge.exposeInMainWorld("typingBridge", bridge);
