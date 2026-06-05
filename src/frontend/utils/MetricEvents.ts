
export const metricEvents = [
  "start", //
  "platformDetected", //

  "openSettings", //
  "openSet", //
  "openFolder", //
  "openEditor", //
  "openTobiiCalibration", //

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
  "settingsToggleMouseActivation", //
  "settingsTogglePageTurnMode", //
  "settingsToggleEyeScale", //
  "settingsSetTimeout", //

  "tobiiCalibrationStart", //
  "tobiiCalibrationPoint", //
  "tobiiCalibrationFinish", //
  "tobiiCalibrationCancel", //
  "tobiiCalibrationError", //
  "tobiiCalibrationApplySaved", //
  "tobiiCalibrationApplySavedResult", //
  "tobiiCalibrationUnavailable", //

  "updateAvailable", //
  "updateDownloaded", //
  "updateError", //
  "updateInstallConfirmed" //

] as const;

export type MetricEvent = typeof metricEvents[number]
