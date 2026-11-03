// Keep real BackWatch IPC/geometry, but never consume live gaze during deterministic E2E.
const Module = require("node:module");
const load = Module._load;
Module._load = function (id, ...args) {
  const loaded = load.call(this, id, ...args);
  if (id === "@linkasu/tobii-electron/main") {
    loaded.BackWatch.prototype.createTracker = () => undefined;
  }
  return loaded;
};
