// Test-only preload: same tracker fixture as E2E, observe real children, block network.
require("../../tests/e2e/typing-tracker-fixture.cjs");
const { app, session } = require("electron");
app.on("ready", () => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, done) => done({ cancel: true })
  );
});
const childProcess = require("node:child_process");
const { resolve } = require("node:path");
const spawn = childProcess.spawn;
const expected = resolve("predictor-resources/lp-electron.exe").toLowerCase();
const children = { spawned: 0, closed: 0, failed: 0, live: new Set() };
global.__windowsModelChildren = children;
childProcess.spawn = function (executable, ...args) {
  const child = spawn.call(this, executable, ...args);
  if (resolve(String(executable)).toLowerCase() === expected) {
    children.spawned++;
    children.live.add(child);
    child.once("error", () => children.failed++);
    child.once("close", () => {
      children.closed++;
      children.live.delete(child);
    });
  }
  return child;
};
app.on("will-quit", () => {
  for (const child of children.live) child.kill();
});
