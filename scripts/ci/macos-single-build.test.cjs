const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const fixture = path.resolve(process.env.BUILDER_FIXTURE || "node_modules/app-builder-lib");

test("26.8.1 public API and normal packing/signing/notarization order", async () => {
  const read = (file) => fs.readFile(path.join(fixture, "out", file), "utf8");
  assert.equal(JSON.parse(await fs.readFile(path.join(fixture, "package.json"))).version, "26.8.1");
  const api = await read("configuration.d.ts");
  assert.match(api, /readonly afterPack\?: Hook<AfterPackContext/);
  assert.match(api, /readonly afterSign\?: Hook<AfterPackContext/);
  const platform = await read("platformPackager.js");
  assert(
    platform.indexOf("await this.info.emitAfterPack(packContext)") <
      platform.indexOf("await this.doSignAfterPack(")
  );
  assert(
    platform.indexOf("await this.signApp(packContext, isAsar)") <
      platform.indexOf("await this.info.emitAfterSign(packContext)")
  );
  const mac = await read("macPackager.js");
  assert(
    mac.indexOf("await this.doSign(signOptions") <
      mac.indexOf("await this.notarizeIfProvided(appPath)")
  );
  assert.match(
    mac,
    /if \(prepackaged == null\) \{\s+await this.doPack\([\s\S]+?this.packageInDistributableFormat/
  );
  const packager = await read("packager.js");
  assert.match(
    packager,
    /for \(const \[arch, targetNames\][\s\S]+?const promise = packager.pack\(/
  );
  assert.match(platform, /await this\.info\.installAppDependencies\(this\.platform, arch\)/);
});

test("per-architecture snapshots are awaited, immutable and reject missing/duplicate/unsupported stages", async (t) => {
  const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "mac-hooks-")));
  const oldCwd = process.cwd();
  const oldRoot = process.env.MACOS_EVIDENCE_ROOT;
  t.after(async () => {
    process.chdir(oldCwd);
    if (oldRoot === undefined) delete process.env.MACOS_EVIDENCE_ROOT;
    else process.env.MACOS_EVIDENCE_ROOT = oldRoot;
    await fs.rm(tmp, { recursive: true });
  });
  const project = path.join(tmp, "app");
  await fs.mkdir(project);
  await fs.writeFile(
    path.join(project, "package.json"),
    JSON.stringify({ build: { productName: "LINKa. смотри" } })
  );
  process.chdir(project);
  process.env.MACOS_EVIDENCE_ROOT = path.join(tmp, "evidence");
  const config = require(path.join(oldCwd, "scripts/ci/macos-single-build.cjs"));
  for (const [arch, directory] of [
    [1, "mac"],
    [3, "mac-arm64"]
  ]) {
    const context = {
      arch,
      electronPlatformName: "darwin",
      appOutDir: path.join(project, "dist", directory),
      packager: { projectDir: project, appInfo: { productFilename: "LINKa. смотри" } }
    };
    const asar = path.join(context.appOutDir, "LINKa. смотри.app/Contents/Resources/app.asar");
    execFileSync("python3", [
      "-c",
      `import sys; sys.path.insert(0, sys.argv[1]); from pathlib import Path; import importlib; f=importlib.import_module('test-asar-evidence'); f.archive(Path(sys.argv[2]), sys.argv[3].encode())`,
      path.join(oldCwd, "scripts/ci"),
      asar,
      directory
    ]);
    await assert.rejects(config.afterSign(context));
    await config.afterPack(context);
    const before = await fs.readFile(asar);
    await fs.writeFile(asar + ".unpacked/native.node", "synthetic signed bytes");
    await config.afterSign(context);
    const key = arch === 1 ? "x64" : "arm64";
    assert.deepEqual(
      await fs.readFile(path.join(tmp, "evidence/payload/unsigned-before", key, "app.asar")),
      before
    );
    assert.equal(
      await fs.readFile(
        path.join(tmp, "evidence/payload/unsigned-before", key, "app.asar.unpacked/native.node"),
        "utf8"
      ),
      "abc"
    );
    assert.equal(
      await fs.readFile(
        path.join(tmp, "evidence/payload/signed-rebuild", key, "app.asar.unpacked/native.node"),
        "utf8"
      ),
      "synthetic signed bytes"
    );
    await assert.rejects(config.afterPack(context));
    await assert.rejects(config.afterSign(context));
    await assert.rejects(config.afterPack({ ...context, arch: 4 }));
    await assert.rejects(config.afterPack({ ...context, appOutDir: project }));
  }
});

test(
  "local pinned builder runs one dependency phase and pack/sign/afterSign per arch",
  {
    skip: !process.env.MACOS_BUILDER_INTEGRATION
  },
  async (t) => {
    const { Packager } = require(path.join(fixture, "out/packager.js"));
    const { MacPackager } = require(path.join(fixture, "out/macPackager.js"));
    const { Platform, Arch } = require(fixture);
    const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "mac-builder-")));
    const oldCwd = process.cwd();
    const oldRoot = process.env.MACOS_EVIDENCE_ROOT;
    t.after(async () => {
      process.chdir(oldCwd);
      if (oldRoot === undefined) delete process.env.MACOS_EVIDENCE_ROOT;
      else process.env.MACOS_EVIDENCE_ROOT = oldRoot;
      await fs.rm(tmp, { recursive: true });
    });
    const project = path.join(tmp, "app");
    await fs.mkdir(project);
    await fs.writeFile(path.join(project, "index.js"), "module.exports = 42;\n");
    await fs.writeFile(
      path.join(project, "package.json"),
      JSON.stringify({
        name: "hook-fixture",
        version: "3.3.0",
        main: "index.js",
        author: "synthetic",
        description: "no native dependencies or signing credentials",
        build: {
          productName: "LINKa. смотри",
          appId: "test.synthetic.hooks",
          files: ["index.js", "package.json"]
        }
      })
    );
    process.chdir(project);
    process.env.MACOS_EVIDENCE_ROOT = path.join(tmp, "evidence");
    const configPath = path.join(oldCwd, "scripts/ci/macos-single-build.cjs");
    delete require.cache[require.resolve(configPath)];
    const hooks = require(configPath);
    const { getConfig } = require(path.join(fixture, "out/util/config/config.js"));
    const loaded = await getConfig(project, configPath);
    assert.equal(loaded.productName, "LINKa. смотри");
    assert.equal(typeof loaded.afterPack, "function");
    assert.equal(typeof loaded.afterSign, "function");
    const events = [];
    class MockSigningMacPackager extends MacPackager {
      async sign(appPath, _outDir, _mas, arch) {
        events.push(`${Arch[arch]}:sign-mock`);
        await fs.writeFile(
          path.join(appPath, "Contents/Resources/app.asar.unpacked/native.node"),
          "signed-mock"
        );
        events.push(`${Arch[arch]}:notarize-mock`);
        return true;
      }
    }
    const packager = new Packager({
      projectDir: project,
      targets: Platform.MAC.createTarget("dir", Arch.x64, Arch.arm64),
      config: {
        ...hooks,
        electronVersion: "42.0.0",
        electronDist: process.env.MACOS_BUILDER_INTEGRATION,
        beforeBuild: ({ arch }) => {
          events.push(`${arch}:dependency-phase`);
          return false;
        },
        afterPack: async (context) => {
          events.push(`${Arch[context.arch]}:afterPack`);
          const unpacked = path.join(
            context.appOutDir,
            "LINKa. смотри.app/Contents/Resources/app.asar.unpacked"
          );
          await fs.mkdir(unpacked);
          await fs.writeFile(path.join(unpacked, "native.node"), "unsigned-mock");
          await hooks.afterPack(context);
        },
        afterSign: async (context) => {
          events.push(`${Arch[context.arch]}:afterSign`);
          await hooks.afterSign(context);
        }
      },
      platformPackagerFactory: (info) => new MockSigningMacPackager(info)
    });
    await packager.build();
    assert.deepEqual(
      events,
      ["x64", "arm64"].flatMap((arch) =>
        ["dependency-phase", "afterPack", "sign-mock", "notarize-mock", "afterSign"].map(
          (event) => `${arch}:${event}`
        )
      )
    );
    for (const arch of ["x64", "arm64"]) {
      for (const stage of ["unsigned-before", "signed-rebuild"]) {
        await fs.access(path.join(tmp, "evidence/payload", stage, arch, "manifest.json"));
      }
    }
  }
);
