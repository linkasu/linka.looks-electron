const { createHash, randomUUID } = require("node:crypto");
const { createReadStream, createWriteStream } = require("node:fs");
const fs = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

const installer = "linka.looks.setup.exe";
const repository = "linkasu/linka.looks-electron";

function validate(version, sha256) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("An exact stable version and reviewed SHA256 are required");
  }
}

async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

async function sync(file) {
  const handle = await fs.open(file, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function verify(directory) {
  const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
  validate(manifest.version, manifest.sha256);
  const version = JSON.parse(await fs.readFile(path.join(directory, "version.json"), "utf8"));
  const file = path.join(directory, installer);
  if (
    version.version !== manifest.version ||
    (await fs.stat(file)).size !== manifest.size ||
    (await hash(file)) !== manifest.sha256
  )
    throw new Error("Stored installer/manifest mismatch");
  return manifest;
}

async function store(root, version, source, metadata = {}) {
  const sha256 = await hash(source);
  validate(version, sha256);
  const releases = path.join(root, "releases");
  await fs.mkdir(releases, { recursive: true });
  const name = `${version}-${sha256}`;
  const destination = path.join(releases, name);
  try {
    const manifest = await verify(destination);
    if (manifest.sha256 !== sha256) throw new Error("Existing release mismatch");
    return `releases/${name}`;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Refuse to repair an incomplete existing version silently.
    try {
      await fs.stat(destination);
      throw new Error("Incomplete existing release", { cause: error });
    } catch (statError) {
      if (statError.code !== "ENOENT") throw statError;
    }
  }
  const staging = path.join(releases, `.staging-${randomUUID()}`);
  await fs.mkdir(staging);
  await fs.copyFile(source, path.join(staging, installer));
  const size = (await fs.stat(source)).size;
  await fs.writeFile(path.join(staging, "version.json"), JSON.stringify({ version }));
  await fs.writeFile(
    path.join(staging, "manifest.json"),
    JSON.stringify({
      version,
      sha256,
      size,
      installer: `releases/${name}/${installer}`,
      ...metadata
    })
  );
  await verify(staging);
  for (const file of [installer, "version.json", "manifest.json"])
    await sync(path.join(staging, file));
  await sync(staging);
  await fs.rename(staging, destination);
  await sync(releases);
  return `releases/${name}`;
}

async function switchCurrent(root, target) {
  if (!/^releases\/\d+\.\d+\.\d+-[a-f0-9]{64}$/.test(target))
    throw new Error("Invalid release target");
  await verify(path.join(root, target));
  const temporary = path.join(root, `.current-${randomUUID()}`);
  await fs.symlink(target, temporary);
  await fs.rename(temporary, path.join(root, "current"));
  await sync(root);
}

async function locked(root, action) {
  const lock = path.join(root, ".mirror-update.lock");
  await fs.mkdir(lock);
  try {
    return await action();
  } finally {
    await fs.rmdir(lock);
  }
}

async function prepared(root) {
  for (const file of [installer, "version.json", "manifest.json"]) {
    if ((await fs.readlink(path.join(root, file))) !== `current/${file}`)
      throw new Error("Mirror not prepared");
  }
  const target = await fs.readlink(path.join(root, "current"));
  if (!/^releases\/\d+\.\d+\.\d+-[a-f0-9]{64}$/.test(target))
    throw new Error("Invalid current target");
  await verify(path.join(root, target));
  return target;
}

async function prepare(root, version, sha256) {
  validate(version, sha256);
  return locked(root, async () => {
    const existingVersion = JSON.parse(await fs.readFile(path.join(root, "version.json"), "utf8"));
    if (
      existingVersion.version !== version ||
      (await hash(path.join(root, installer))) !== sha256
    ) {
      throw new Error("Legacy installer/version changed; stop and review");
    }
    // Bootstrap aliases one at a time, but they all resolve to the identical old pair.
    const target = await store(root, version, path.join(root, installer), {
      source: "preserved legacy mirror"
    });
    if (target !== `releases/${version}-${sha256}`)
      throw new Error("Legacy installer changed during snapshot");
    try {
      if ((await fs.readlink(path.join(root, "manifest.json"))) !== "current/manifest.json") {
        throw new Error("Unexpected existing manifest");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      if ((await fs.readlink(path.join(root, "current"))) !== target)
        throw new Error("Unexpected existing current");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await switchCurrent(root, target);
    }
    for (const file of [installer, "version.json", "manifest.json"]) {
      const temporary = path.join(root, `.alias-${randomUUID()}`);
      await fs.symlink(`current/${file}`, temporary);
      await fs.rename(temporary, path.join(root, file));
      await sync(root);
    }
    return target;
  });
}

async function updateMirror({
  root,
  version,
  sha256,
  dryRun = false,
  releaseMetadata,
  fetchImpl = fetch
}) {
  validate(version, sha256);
  const perform = async () => {
    const previous = await prepared(root);
    const url = `https://api.github.com/repos/${repository}/releases/tags/v${version}`;
    let release = releaseMetadata;
    if (!release) {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Release HTTP ${response.status}`);
      release = await response.json();
    }
    const name = `linka.looks-${version}-win-x64.exe`;
    const assets = release.assets?.filter((asset) => asset.name === name);
    if (
      release.tag_name !== `v${version}` ||
      release.draft ||
      release.prerelease ||
      assets?.length !== 1
    ) {
      throw new Error("Release tag/state/asset mismatch");
    }
    const asset = assets[0];
    const assetUrl = `https://github.com/${repository}/releases/download/v${version}/${name}`;
    if (
      asset.browser_download_url !== assetUrl ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      (asset.digest && asset.digest !== `sha256:${sha256}`)
    )
      throw new Error("Asset metadata mismatch");
    const temporary = await fs.mkdtemp(path.join(tmpdir(), "linka-mirror-"));
    try {
      const download = await fetchImpl(assetUrl, { signal: AbortSignal.timeout(300000) });
      if (!download.ok || !download.body) throw new Error(`Download HTTP ${download.status}`);
      const file = path.join(temporary, installer);
      await pipeline(Readable.fromWeb(download.body), createWriteStream(file, { flags: "wx" }));
      if ((await fs.stat(file)).size !== asset.size || (await hash(file)) !== sha256) {
        throw new Error("Downloaded installer size/SHA256 mismatch");
      }
      const result = { version, sha256, size: asset.size, previous, assetUrl, dryRun };
      if (!dryRun) {
        const target = await store(root, version, file, { assetUrl, previous });
        await switchCurrent(root, target);
        result.current = target;
      }
      return result;
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  };
  return dryRun ? perform() : locked(root, perform);
}

async function rollback(root, version, sha256) {
  validate(version, sha256);
  return locked(root, async () => {
    await prepared(root);
    const target = `releases/${version}-${sha256}`;
    await switchCurrent(root, target);
    return { current: target };
  });
}

module.exports = { prepare, updateMirror, rollback };

if (require.main === module || module.id === "[stdin]") {
  const [command, root, version, sha256, flag] = process.argv.slice(2);
  const actions = {
    prepare,
    rollback,
    update: (root, version, sha256) =>
      updateMirror({
        root,
        version,
        sha256,
        dryRun: flag === "--dry-run",
        releaseMetadata: process.env.MIRROR_RELEASE_B64
          ? JSON.parse(Buffer.from(process.env.MIRROR_RELEASE_B64, "base64").toString("utf8"))
          : undefined
      })
  };
  if (
    !actions[command] ||
    !root ||
    (flag && flag !== "--dry-run") ||
    (flag && command !== "update")
  ) {
    console.error("Usage: node update.cjs prepare|update|rollback ROOT VERSION SHA256 [--dry-run]");
    process.exitCode = 1;
  } else {
    actions[command](path.resolve(root), version, sha256).then(
      (result) => console.log(JSON.stringify(result)),
      (error) => {
        console.error(error.message);
        process.exitCode = 1;
      }
    );
  }
}
