import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupE2EContext,
  createE2EContext,
  devServerUrl,
  firstTestWindow,
  launchTestElectron,
  standardConfig,
  writeLinkaSet
} from "./helpers";

const modes = [
  { value: "hidden", label: "Стрелки скрыты" },
  { value: "mouseOnly", label: "Только клик специалиста" },
  { value: "mouseAndEyes", label: "Мышь и взгляд" }
];

for (const mode of modes) {
  test(`page arrows: settings and restart preserve ${mode.value}`, async () => {
    const context = createArrowContext();
    const setName = "page-arrows.linka";
    writeLinkaSet(
      context.homeDir,
      setName,
      standardConfig([], {
        pages: ["А", "Б"].map((title, index) => ({
          id: `page-${index}`,
          mode: "standard",
          columns: 1,
          rows: 1,
          cards: [{ id: `card-${index}`, cardType: 0, title }]
        }))
      })
    );

    let app = await launchTestElectron(context);
    try {
      let window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/settings`);
      const select = window.getByRole("combobox", { name: "Способ перелистывания" });
      await select.press("Enter");
      for (const option of modes) {
        await expect(window.getByRole("option", { name: option.label, exact: true })).toBeVisible();
      }
      await window.getByRole("option", { name: mode.label, exact: true }).click();
      const configPath = join(context.userDataDir, "config.json");
      await expect
        .poll(() => JSON.parse(readFileSync(configPath, "utf8")).button_pageTurnMode)
        .toBe(mode.value);

      await window.screenshot({ path: test.info().outputPath("settings.png") });
      await app.close();
      app = await launchTestElectron(context);
      window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/settings`);
      await expect(window.getByRole("combobox", { name: "Способ перелистывания" })).toHaveValue(
        mode.label
      );
      await window.goto(`${devServerUrl}/#/set/§${setName}`);
      await expect(window.getByText("1 из 2")).toBeVisible();
      const arrows = window.locator(".grid button.lock");
      if (mode.value === "hidden") {
        await expect(arrows).toHaveCount(0);
        await expect(window.locator(".grid .mdi-arrow-left, .grid .mdi-arrow-right")).toHaveCount(
          0
        );
        await window.getByRole("button", { name: "А", exact: true }).click();
        await expect(window.locator(".output-text .text")).toContainText("А");
      } else {
        await expect(arrows).toHaveCount(2);
        if (mode.value === "mouseOnly") {
          await expect(arrows.nth(1)).toHaveAttribute("data-eye-disabled", "1");
        } else {
          await expect(arrows.nth(1)).not.toHaveAttribute("data-eye-disabled");
        }
        await arrows.nth(0).click();
        await expect(window.getByText("1 из 2")).toBeVisible();
        await window.getByRole("button", { name: "А", exact: true }).click();
        await arrows.nth(1).click();
        await expect(window.getByText("2 из 2")).toBeVisible();
        await expect(window.locator(".output-text .text")).toContainText("А");
        await arrows.nth(1).click();
        await expect(window.getByText("2 из 2")).toBeVisible();

        const bounds = await arrows.nth(0).boundingBox();
        if (!bounds) throw new Error("Previous-page arrow has no touch target");
        const cdp = await window.context().newCDPSession(window);
        try {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }]
          });
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        } finally {
          await cdp.detach();
        }
        await expect(window.getByText("1 из 2")).toBeVisible();
        await expect(window.locator(".output-text .text")).toContainText("А");
      }
      await window.screenshot({ path: test.info().outputPath("set.png") });
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}

for (const value of [undefined, "mouseOnly", "mouseAndEyes"]) {
  test(`page arrows: loads legacy ${value ?? "absent"} setting`, async () => {
    const context = createArrowContext();
    const configPath = join(context.userDataDir, "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (value) config.button_pageTurnMode = value;
    writeFileSync(configPath, JSON.stringify(config));
    const app = await launchTestElectron(context);
    try {
      const window = await firstTestWindow(app);
      await window.goto(`${devServerUrl}/#/settings`);
      await expect(window.getByRole("combobox", { name: "Способ перелистывания" })).toHaveValue(
        value === "mouseOnly" ? "Только клик специалиста" : "Мышь и взгляд"
      );
    } finally {
      await app.close();
      cleanupE2EContext(context);
    }
  });
}

function createArrowContext() {
  const context = createE2EContext();
  writeFileSync(
    join(context.userDataDir, "telemetry-preference-v3.json"),
    JSON.stringify({ schemaVersion: 3, preference: "disabled" })
  );
  return context;
}
