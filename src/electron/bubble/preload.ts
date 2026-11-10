import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("bubbleOverlay", {
  nextFrame: () => ipcRenderer.invoke("bubble:frame")
});
