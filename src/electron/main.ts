import { app, protocol } from "electron";
import { join } from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

if (process.env.IS_TEST === "1" && process.env.TEST_USER_DATA_DIR) {
  app.setPath("userData", process.env.TEST_USER_DATA_DIR);
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);

const resume = process.argv.includes("--bubble-resume");
const agent = process.argv.includes("--bubble-agent") || resume;
const control = process.argv.includes("--bubble-control");
const baseUserData = app.getPath("userData");

if (process.env.PRINT_APP_VERSION === "1") {
  void app.whenReady().then(() => {
    console.log(app.getVersion());
    app.exit(0);
  });
} else if (agent || control) {
  const directory = join(baseUserData, "bubble-agent");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  app.setPath("userData", directory);
  if (process.platform !== "win32") app.quit();
  else if (control) {
    void import("./bubble/client")
      .then(({ prepareBubbleUpdate }) => prepareBubbleUpdate())
      .then(
        () => app.exit(0),
        () => app.exit(2)
      );
  } else
    void import("./bubble/agent")
      .then(async ({ startBubbleAgent }) => {
        if (resume) {
          try {
            const ticket = JSON.parse(
              readFileSync(join(directory, "resume-after-update.json"), "utf8")
            );
            const { bubbleInstallationId } = await import("./bubble/client");
            if (
              ticket.installationId !== bubbleInstallationId() ||
              !Number.isFinite(ticket.createdAt) ||
              Date.now() - ticket.createdAt < 0 ||
              Date.now() - ticket.createdAt > 3600000
            ) {
              app.quit();
              return;
            }
          } catch {
            app.quit();
            return;
          }
        }
        if (!app.requestSingleInstanceLock()) {
          app.quit();
          return;
        }
        await startBubbleAgent();
      })
      .catch(() => app.quit());
} else if (process.env.IS_TEST === "1" || app.requestSingleInstanceLock()) {
  void import("./looksMain").catch(() => app.exit(1));
} else app.quit();
