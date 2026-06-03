# TobiiFree helper

Experimental macOS helper for Tobii Eye Tracker 5. It does not run calibration;
it only streams normalized gaze points to the Electron main process.

## Daemon mode

Run `tobiifreed` with WebSocket support, then start Electron with:

```sh
TOBIIFREE_DAEMON_URL=ws://127.0.0.1:7081 npm run electron:serve
```

## Direct USB mode

Install or otherwise expose `tobiifree-sdk-ts` to Node resolution, then start
Electron normally. Override the package name if needed:

```sh
TOBIIFREE_SDK_PACKAGE=tobiifree-sdk-ts npm run electron:serve
```

## Custom command

To bypass this helper script entirely, provide a command that writes helper
protocol lines to stdout:

```sh
TOBIIFREE_HELPER_COMMAND=/path/to/custom-helper npm run electron:serve
```

The Electron adapter subtracts the current Electron content origin from gaze
coordinates, which compensates for the macOS menu bar and window titlebar. Add
extra manual correction only when needed:

```sh
TOBIIFREE_GAZE_OFFSET_Y=-10 npm run electron:serve
TOBIIFREE_GAZE_OFFSET_X=10 npm run electron:serve
```

Expected stdout lines:

```text
ready
gaze:0.5,0.5
invalid
error:message
```

Calibration commands are sent as JSON lines to stdin:

```json
{"id":1,"command":"calibration.start"}
{"id":2,"command":"calibration.addPoint","x":0.5,"y":0.5}
{"id":3,"command":"calibration.finish"}
{"id":4,"command":"calibration.apply","blobBase64":"..."}
```

Responses are JSON lines on stdout:

```json
{"type":"response","id":1,"ok":true}
{"type":"response","id":3,"ok":true,"blobBase64":"..."}
```
