import type { App, Plugin } from "vue";

type RuntimeProcess = {
  platform?: string;
};

export type PlatformHelper = {
  name: string;
  isMacOS: boolean;
  isWindows: boolean;
  isLinux: boolean;
  is: (platformName: string) => boolean;
};

const currentPlatform = detectPlatform();

export const platform: PlatformHelper = {
  name: currentPlatform,
  isMacOS: currentPlatform === "darwin",
  isWindows: currentPlatform === "win32",
  isLinux: currentPlatform === "linux",
  is: (platformName: string) => currentPlatform === platformName
};

const platformPlugin: Plugin = {
  install (app: App) {
    app.config.globalProperties.$platform = platform;
    app.provide("platform", platform);
  }
};

function detectPlatform () {
  const runtimeProcess = (globalThis as typeof globalThis & { process?: RuntimeProcess }).process;
  if (runtimeProcess?.platform) return runtimeProcess.platform;

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("macintosh") || userAgent.includes("mac os x")) return "darwin";
  if (userAgent.includes("windows")) return "win32";
  if (userAgent.includes("linux")) return "linux";
  return "unknown";
}

declare module "@vue/runtime-core" {
  interface ComponentCustomProperties {
    $platform: PlatformHelper;
  }
}

export default platformPlugin;
