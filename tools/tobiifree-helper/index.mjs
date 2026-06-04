const sdkModule = process.env.TOBIIFREE_SDK_MODULE || new URL("../tobiifree-sdk/src/index.ts", import.meta.url).href;
const daemonUrl = process.env.TOBIIFREE_DAEMON_URL;

const HEADER_SIZE = 5;
const CMD_SUBSCRIBE = 0x01;
const SRV_GAZE = 0x01;
const BIT_GAZE_2D = 1 << 6;
const BIT_VALIDITY_L = 1 << 2;
const BIT_VALIDITY_R = 1 << 3;
const DEFAULT_DISPLAY_AREA = {
  tl: { x: -500, y: 500, z: 0 },
  tr: { x: 500, y: 500, z: 0 },
  bl: { x: -500, y: 0, z: 0 }
};

let source;
let stdinBuffer = "";
let invalidSamples = 0;

function writeLine (line) {
  process.stdout.write(`${line}\n`);
}

function writeError (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeLine(`error:${message}`);
}

function writeResponse (id, ok, payload = {}) {
  writeLine(JSON.stringify({ type: "response", id, ok, ...payload }));
}

function logDiagnostic (message, data) {
  process.stderr.write(`[diagnostic] ${message}${data === undefined ? "" : ` ${JSON.stringify(data)}`}\n`);
}

function isResetArea (area) {
  if (!area?.tl || !area?.tr || !area?.bl) return true;
  const width = Math.hypot(area.tr.x - area.tl.x, area.tr.y - area.tl.y, area.tr.z - area.tl.z);
  const height = Math.hypot(area.bl.x - area.tl.x, area.bl.y - area.tl.y, area.bl.z - area.tl.z);
  return width < 50 || height < 50;
}

async function ensureDisplayArea () {
  if (!source?.getDisplayArea || !source?.setDisplayAreaCorners) return;
  try {
    const area = source.displayArea || await source.getDisplayArea();
    if (!isResetArea(area)) {
      logDiagnostic("display_area ok", area);
      return;
    }
    logDiagnostic("display_area reset, applying fallback", area);
    await source.setDisplayAreaCorners(DEFAULT_DISPLAY_AREA);
    logDiagnostic("fallback display_area applied", DEFAULT_DISPLAY_AREA);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDiagnostic("display_area setup failed", { error: message });
  }
}

function isValidGaze (sample) {
  if (sample.validity_L === 4 && sample.validity_R === 4) return false;
  const point = bestGazePoint(sample);
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function bestGazePoint (sample) {
  return sample?.gaze_point_2d_norm ||
    sample?.gaze_point_2d_unfiltered ||
    sample?.gaze_point_2d_L_norm ||
    sample?.gaze_point_2d_R_norm;
}

function clamp01 (value) {
  return Math.max(0, Math.min(1, value));
}

function readGazeSample (payload) {
  if (payload.byteLength < 56) return undefined;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const present = view.getUint32(0, true);
  if (!(present & BIT_GAZE_2D)) return undefined;

  const sample = {
    gaze_point_2d_norm: {
      x: view.getFloat64(40, true),
      y: view.getFloat64(48, true)
    }
  };

  if (present & BIT_VALIDITY_L) sample.validity_L = view.getUint32(8, true);
  if (present & BIT_VALIDITY_R) sample.validity_R = view.getUint32(12, true);
  return sample;
}

function writeSample (sample) {
  const point = bestGazePoint(sample);
  if (!isValidGaze(sample)) {
    invalidSamples += 1;
    if (invalidSamples === 1 || invalidSamples % 120 === 0) {
      logDiagnostic("invalid gaze sample", {
        count: invalidSamples,
        validity_L: sample?.validity_L,
        validity_R: sample?.validity_R,
        has2d: !!sample?.gaze_point_2d_norm,
        has2dUnfiltered: !!sample?.gaze_point_2d_unfiltered,
        hasLeft2d: !!sample?.gaze_point_2d_L_norm,
        hasRight2d: !!sample?.gaze_point_2d_R_norm,
        point
      });
    }
    writeLine("invalid");
    return;
  }
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    logDiagnostic("gaze point outside display, clamping", {
      x: point.x,
      y: point.y,
      validity_L: sample?.validity_L,
      validity_R: sample?.validity_R
    });
  }
  invalidSamples = 0;
  writeLine(`gaze:${point.x},${point.y}`);
}

function subscribeCommand () {
  const buffer = new ArrayBuffer(HEADER_SIZE);
  const view = new DataView(buffer);
  view.setUint8(0, CMD_SUBSCRIBE);
  view.setUint32(1, 0, true);
  return buffer;
}

async function toUint8Array (data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return undefined;
}

async function startDaemonMode (url) {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    ws.send(subscribeCommand());
    writeLine("ready");
  });

  ws.addEventListener("message", async (event) => {
    const data = await toUint8Array(event.data);
    if (!data || data.byteLength < HEADER_SIZE) return;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const type = view.getUint8(0);
    const length = view.getUint32(1, true);
    if (type !== SRV_GAZE || data.byteLength < HEADER_SIZE + length) return;
    writeSample(readGazeSample(data.slice(HEADER_SIZE, HEADER_SIZE + length)));
  });

  ws.addEventListener("error", () => writeError(`daemon websocket error: ${url}`));
  ws.addEventListener("close", () => process.exit(0));

  process.on("SIGTERM", () => ws.close());
  process.on("SIGINT", () => ws.close());
}

async function startDirectUsbMode () {
  const { Tobii } = await import(sdkModule);
  source = await Tobii.fromUsb();
  await ensureDisplayArea();

  process.on("SIGTERM", () => {
    void source.close().finally(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    void source.close().finally(() => process.exit(0));
  });

  writeLine("ready");
  source.subscribeToGaze(writeSample);
}

async function handleCommand (message) {
  const id = message.id;
  if (typeof id !== "number") return;
  if (!source) {
    writeResponse(id, false, { error: "Tobii source is not ready" });
    return;
  }

  try {
    if (message.command === "calibration.start") {
      await source.startCalibration();
      writeResponse(id, true);
      return;
    }
    if (message.command === "calibration.addPoint") {
      await source.addCalibrationPoint(message.x, message.y);
      writeResponse(id, true);
      return;
    }
    if (message.command === "calibration.finish") {
      const blob = await source.finishCalibration();
      writeResponse(id, true, { blobBase64: Buffer.from(blob).toString("base64") });
      return;
    }
    if (message.command === "calibration.apply") {
      await source.calApply(Buffer.from(message.blobBase64, "base64"));
      writeResponse(id, true);
      return;
    }
    writeResponse(id, false, { error: `Unknown command: ${message.command}` });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    writeResponse(id, false, { error: messageText });
  }
}

function startCommandReader () {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    stdinBuffer += chunk;
    const lines = stdinBuffer.split(/\r?\n/);
    stdinBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        void handleCommand(JSON.parse(line));
      } catch (error) {
        writeError(error);
      }
    }
  });
}

try {
  startCommandReader();
  if (daemonUrl) {
    await startDaemonMode(daemonUrl);
  } else {
    await startDirectUsbMode();
  }
} catch (error) {
  writeError(error);
  process.exitCode = 1;
}
