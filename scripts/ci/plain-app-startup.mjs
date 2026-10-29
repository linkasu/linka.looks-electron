import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Normal executable startup: no Playwright Electron loader, no hardware substitution.
const root = await mkdtemp(join(tmpdir(), "linka-plain-startup-"));
await mkdir(join(root, "home"));
await mkdir(join(root, "userData"));
await writeFile(
  join(root, "userData/config.json"),
  JSON.stringify({
    pcHash: "test",
    first_calibrate: true,
    defaultSetsDownloaded: 1
  })
);
await writeFile(
  join(root, "userData/telemetry-preference-v3.json"),
  JSON.stringify({
    schemaVersion: 3,
    preference: "disabled"
  })
);
const executable =
  process.env.PACKAGED_EXECUTABLE ||
  (process.platform === "win32"
    ? resolve("dist/win-unpacked/LINKa. смотри.exe")
    : resolve(
        `dist/mac${process.arch === "arm64" ? "-arm64" : ""}/LINKa. смотри.app/Contents/MacOS/LINKa. смотри`
      ));
const child = spawn(executable, ["--remote-debugging-port=0", "--enable-logging=stderr"], {
  env: {
    ...process.env,
    IS_TEST: "1",
    TEST_USER_DATA_DIR: join(root, "userData"),
    LINKA_HOME_DIR: join(root, "home"),
    NODE_ENV: "production",
    VITE_DEV_SERVER_URL: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let browser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Plain startup: no CDP endpoint in 20s")),
      20000
    );
    const done = (error, value) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    child.once("error", (error) => done(error));
    child.once("exit", (code) => done(new Error(`Plain app exited before connection: ${code}`)));
    let stderr = "";
    child.stdout.on("data", (data) => process.stdout.write(data));
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      stderr += data;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) done(null, match[1]);
    });
  });
  console.log("[plain-startup] CDP", endpoint);
  browser = await chromium.connectOverCDP(endpoint, { timeout: 20000 });
  const context = browser.contexts()[0];
  const page = context.pages()[0] || (await context.waitForEvent("page", { timeout: 20000 }));
  await page.locator(".v-application").waitFor({ state: "visible", timeout: 20000 });
  const version = await page.evaluate(() =>
    globalThis.require("electron").ipcRenderer.invoke("app_version")
  );
  if (!version.isPackaged || version.platform !== process.platform)
    throw new Error("Wrong packaged IPC identity");
  console.log("[plain-startup] UI + packaged IPC PASS", JSON.stringify(version));
  await page.screenshot({ path: "plain-startup.png" });
} catch (error) {
  if (browser) {
    for (const page of browser.contexts()[0].pages()) {
      console.error("[plain-startup] window", page.url());
    }
  }
  if (process.platform === "win32") {
    spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `
      Add-Type -AssemblyName System.Windows.Forms;
      Add-Type -AssemblyName System.Drawing;
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen;
      $image = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;
      $graphics = [System.Drawing.Graphics]::FromImage($image);
      $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size);
      $image.Save((Join-Path (Get-Location) 'plain-startup-desktop.png'));
      $graphics.Dispose(); $image.Dispose();
    `
      ],
      { stdio: "inherit", timeout: 10000 }
    );
  }
  throw error;
} finally {
  const exited =
    child.exitCode === null && child.signalCode === null ? once(child, "exit") : Promise.resolve();
  if (browser?.isConnected()) {
    try {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close");
    } catch (error) {
      console.warn("[plain-startup] CDP close", error.message);
    }
  }
  if (browser) await browser.close();
  await Promise.race([
    exited,
    new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      timer.unref();
    })
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { timeout: 10000 });
    else child.kill("SIGKILL");
    await exited;
  }
  await rm(root, { recursive: true, force: true });
}
