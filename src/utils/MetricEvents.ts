
const events = [
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
  "settingsToggleKeyboardActivation", //
  "settingsToggleJoystickActivation", //
  "settingsToggleTypeSound", //
  "settingsSetTimeout" //

] as const;

export type MetricEvent = typeof events[number]
