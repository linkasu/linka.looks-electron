import net from "node:net";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const sdkModule = process.env.TOBIIFREE_SDK_MODULE || new URL("../tobiifree-sdk/src/index.ts", import.meta.url).href;
const daemonUrl = process.env.TOBIIFREE_DAEMON_URL;
const serviceMode = process.argv.includes("--service");
const serviceSocketPath = getArgValue("--socket") || process.env.TOBIIFREE_SERVICE_SOCKET;

const HEADER_SIZE = 5;
const CMD_SUBSCRIBE = 0x01;
const SRV_GAZE = 0x01;
const BIT_GAZE_2D = 1 << 6;
const BIT_VALIDITY_L = 1 << 2;
const BIT_VALIDITY_R = 1 << 3;
const SERVICE_RETRY_MAX_MS = 5000;
const SERVICE_SAMPLE_STALE_MS = 30000;
const DEFAULT_DISPLAY_AREA = {
  tl: { x: -500, y: 500, z: 0 },
  tr: { x: 500, y: 500, z: 0 },
  bl: { x: -500, y: 0, z: 0 }
};

let source;
let stdinBuffer = "";
let invalidSamples = 0;
let serviceServer;
let serviceStopping = false;
let serviceReconnectAttempt = 0;
let lastServiceSampleAt = 0;
const serviceClients = new Set();
let currentStatus = makeStatus("service_starting", "Запуск службы Tobii");

function getArgValue (name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function makeStatus (state, message, payload = {}) {
  return {
    type: "status",
    state,
    mode: serviceMode ? "socket-service" : (daemonUrl ? "direct" : "direct"),
    message,
    servicePid: process.pid,
    deviceFound: state === "connected" || state === "tracking",
    reconnectAttempt: serviceReconnectAttempt,
    updatedAt: Date.now(),
    ...payload
  };
}

function setStatus (state, message, payload = {}) {
  currentStatus = makeStatus(state, message, payload);
  if (serviceMode) broadcast(currentStatus);
  logDiagnostic("status", currentStatus);
}

function writeLine (line) {
  process.stdout.write(`${line}\n`);
}

function writeFrame (client, message) {
  if (client.destroyed) return;
  client.write(`${JSON.stringify(message)}\n`);
}

function broadcast (message) {
  for (const client of serviceClients) writeFrame(client, message);
}

function writeError (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (serviceMode) {
    setStatus("error", "Ошибка службы Tobii", { lastError: message, deviceFound: false });
    broadcast({ type: "diagnostic", level: "error", message, updatedAt: Date.now() });
    return;
  }
  writeLine(`error:${message}`);
}

function writeResponse (id, ok, payload = {}, client) {
  const message = { type: "response", id, ok, ...payload };
  if (serviceMode) {
    if (client) writeFrame(client, message);
    else broadcast(message);
    return;
  }
  writeLine(JSON.stringify(message));
}

function logDiagnostic (message, data) {
  process.stderr.write(`[diagnostic] ${message}${data === undefined ? "" : ` ${JSON.stringify(data)}`}\n`);
  if (serviceMode) {
    broadcast({ type: "diagnostic", level: "info", message, data, updatedAt: Date.now() });
  }
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
  if (!sample) {
    if (serviceMode) broadcast({ type: "invalid", reason: "missing_gaze_sample", updatedAt: Date.now() });
    else writeLine("invalid");
    return;
  }
  const point = bestGazePoint(sample);
  lastServiceSampleAt = Date.now();
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
    if (serviceMode) {
      broadcast({ type: "invalid", reason: "eyes_not_detected", updatedAt: Date.now() });
      return;
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
  if (serviceMode) {
    if (currentStatus.state !== "tracking") {
      setStatus("tracking", "Tobii передаёт данные взгляда", { lastGazeAt: lastServiceSampleAt });
    }
    broadcast({ type: "gaze", x: point.x, y: point.y, timestamp: lastServiceSampleAt });
    return;
  }
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

async function createDirectUsbSource () {
  const { Tobii } = await import(sdkModule);
  source = await Tobii.fromUsb();
  await ensureDisplayArea();
  source.subscribeToGaze(writeSample);
}

async function closeSource () {
  const current = source;
  source = undefined;
  if (!current?.close) return;
  try {
    await current.close();
  } catch (error) {
    logDiagnostic("source close failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function startDirectUsbMode () {
  await createDirectUsbSource();

  process.on("SIGTERM", () => {
    void closeSource().finally(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    void closeSource().finally(() => process.exit(0));
  });

  writeLine("ready");
}

async function handleCommand (message, client) {
  const id = message.id;
  if (message.command === "status.get") {
    if (typeof id === "number") writeResponse(id, true, { status: currentStatus }, client);
    else if (serviceMode && client) writeFrame(client, currentStatus);
    return;
  }
  if (message.command === "subscribe.gaze") {
    if (serviceMode && client) writeFrame(client, currentStatus);
    if (typeof id === "number") writeResponse(id, true, {}, client);
    return;
  }
  if (typeof id !== "number") return;
  if (!source) {
    writeResponse(id, false, { error: "Tobii source is not ready" }, client);
    return;
  }

  try {
    if (message.command === "calibration.start") {
      await source.startCalibration();
      writeResponse(id, true, {}, client);
      return;
    }
    if (message.command === "calibration.addPoint") {
      await source.addCalibrationPoint(message.x, message.y);
      writeResponse(id, true, {}, client);
      return;
    }
    if (message.command === "calibration.finish") {
      const blob = await source.finishCalibration();
      writeResponse(id, true, { blobBase64: Buffer.from(blob).toString("base64") }, client);
      return;
    }
    if (message.command === "calibration.apply") {
      await source.calApply(Buffer.from(message.blobBase64, "base64"));
      writeResponse(id, true, {}, client);
      return;
    }
    writeResponse(id, false, { error: `Unknown command: ${message.command}` }, client);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    writeResponse(id, false, { error: messageText }, client);
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

async function startServiceMode () {
  if (!serviceSocketPath) throw new Error("Missing --socket for Tobii service mode");

  await mkdir(dirname(serviceSocketPath), { recursive: true });
  await rm(serviceSocketPath, { force: true });

  serviceServer = net.createServer((client) => {
    serviceClients.add(client);
    writeFrame(client, currentStatus);
    let buffer = "";
    client.setEncoding("utf8");
    client.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          void handleCommand(JSON.parse(line), client);
        } catch (error) {
          writeError(error);
        }
      }
    });
    client.on("close", () => serviceClients.delete(client));
    client.on("error", () => serviceClients.delete(client));
  });

  serviceServer.on("error", (error) => {
    writeError(error);
    process.exitCode = 1;
  });

  await new Promise((resolve, reject) => {
    serviceServer.once("error", reject);
    serviceServer.listen(serviceSocketPath, () => {
      serviceServer.off("error", reject);
      resolve();
    });
  });

  setStatus("service_starting", "Служба Tobii запущена", { socketPath: serviceSocketPath });
  void runServiceUsbLoop();
}

async function runServiceUsbLoop () {
  while (!serviceStopping) {
    try {
      serviceReconnectAttempt += 1;
      setStatus("connecting", "Подключение к Tobii", { deviceFound: false });
      lastServiceSampleAt = Date.now();
      await closeSource();
      await createDirectUsbSource();
      serviceReconnectAttempt = 0;
      setStatus("connected", "Tobii подключён", { deviceFound: true });
      await waitForServiceStaleOrStop();
      if (!serviceStopping) {
        setStatus("reconnecting", "Поток Tobii остановился, переподключаюсь", { deviceFound: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missingDevice = message.includes("ET5 not found") || message.includes("not found");
      setStatus(missingDevice ? "waiting_device" : "reconnecting", missingDevice ? "Tobii не найден. Подключите айтрекер." : "Ошибка Tobii, переподключаюсь", {
        deviceFound: false,
        lastError: message
      });
    } finally {
      await closeSource();
    }
    await delay(Math.min(SERVICE_RETRY_MAX_MS, 500 * Math.max(1, serviceReconnectAttempt)));
  }
}

function waitForServiceStaleOrStop () {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (serviceStopping) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - lastServiceSampleAt < SERVICE_SAMPLE_STALE_MS) return;
      clearInterval(timer);
      logDiagnostic("gaze stream stale", { lastServiceSampleAt });
      resolve();
    }, 3000);
  });
}

function delay (durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function stopService () {
  serviceStopping = true;
  for (const client of serviceClients) client.destroy();
  serviceClients.clear();
  await closeSource();
  if (serviceServer) {
    await new Promise((resolve) => serviceServer.close(resolve));
  }
  if (serviceSocketPath) await rm(serviceSocketPath, { force: true });
}

try {
  if (serviceMode) {
    process.on("SIGTERM", () => void stopService().finally(() => process.exit(0)));
    process.on("SIGINT", () => void stopService().finally(() => process.exit(0)));
    await startServiceMode();
  } else {
    startCommandReader();
    if (daemonUrl) {
      await startDaemonMode(daemonUrl);
    } else {
      await startDirectUsbMode();
    }
  }
} catch (error) {
  writeError(error);
  process.exitCode = 1;
}
