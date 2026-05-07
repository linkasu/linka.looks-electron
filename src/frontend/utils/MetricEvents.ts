
export const metricEvents = [
  "start", //

  "openSettings", //
  "openSet", //
  "openFolder", //
  "openEditor", //

  "cardClick", //
  "toggleOutputLine", //
  "toggleGazeLock", //

  "share", //
  "move", //
  "trash", //

  "editorAddImage", //
  "editorAddAudio", //

  "settingsToggleEyeExit", //
  "settingsToggleEyeChoose", //
  "settingsToggleEyeActivation", //
  "settingsToggleEyePagination", //
  "settingsToggleKeyboardActivation", //
  "settingsToggleJoystickActivation", //
  "settingsToggleTypeSound", //
  "settingsSetTimeout" //

] as const;

export type MetricEvent = typeof metricEvents[number]
