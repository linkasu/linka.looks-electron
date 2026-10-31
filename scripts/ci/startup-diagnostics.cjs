// Observe the real app startup without replacing hardware or product code.
const { app } = require("electron");
const marker = (event, detail = "") => console.log(`[startup] ${event} ${detail}`);
marker("preload", process.versions.electron);
app.on("ready", () => marker("ready"));
app.on("browser-window-created", (_event, window) => {
  marker("window-created", window.id);
  window.webContents.on("did-start-loading", () => marker("loading", window.id));
  window.webContents.on("dom-ready", () => marker("dom-ready", window.id));
  window.webContents.on("did-fail-load", (_event, code, description) =>
    marker("load-failed", `${code} ${description}`)
  );
  window.webContents.on("render-process-gone", (_event, detail) =>
    marker("renderer-gone", JSON.stringify(detail))
  );
});
process.on("uncaughtExceptionMonitor", (error) => marker("uncaught", error.stack));
