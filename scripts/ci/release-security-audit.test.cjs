const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createHash } = require("node:crypto");
const { verify } = require("./release-security-audit.cjs");

function fixture() {
  const lock = Buffer.from(
    JSON.stringify({
      packages: {
        "node_modules/vue": { version: "3.5.44" },
        "node_modules/@vue/server-renderer": { version: "3.5.44" },
        "node_modules/@linkasu/tobii-electron": {
          version: "0.2.17",
          resolved:
            "https://github.com/linkasu/linka-tobii-electron/releases/download/v0.2.17/linkasu-tobii-electron-0.2.17.tgz",
          integrity:
            "sha512-LqhUCB90euN/QR/aGY9A+mP7j7Wq8no2qrxN682JvrxV7oP8IQx/9/VxU6u3cAe6DFHbi39J3R+N0swgLrjmgQ=="
        },
        "node_modules/minimatch": { version: "3.1.5" },
        "node_modules/readdir-glob/node_modules/minimatch": { version: "5.1.9" },
        "node_modules/glob": { version: "7.2.3" },
        "node_modules/archiver": { version: "5.3.2" },
        "node_modules/archiver-utils": { version: "2.1.0" },
        "node_modules/zip-stream/node_modules/archiver-utils": { version: "3.0.4" },
        "node_modules/readdir-glob": { version: "1.1.3" },
        "node_modules/zip-stream": { version: "4.1.1" },
        "node_modules/node-gyp": { version: "11.5.0", dev: true }
      }
    })
  );
  const installer = { name: "linka.looks-4.0.0-win-x64.exe", sha256: "c".repeat(64) };
  const inventory = {
    schema: 1,
    builder: "26.16.1",
    app: "a".repeat(40),
    tooling: "b".repeat(40),
    lockSha256: createHash("sha256").update(lock).digest("hex"),
    pins: Object.entries(JSON.parse(lock).packages).map(([path, pkg]) => ({ path, ...pkg })),
    installers: [installer],
    packaged: [
      {
        target: "dist/win-unpacked/resources",
        asarSha256: "d".repeat(64),
        packages: [
          { path: "package.json", name: "linka.looks", version: "4.0.0" },
          { path: "node_modules/minimatch/package.json", name: "minimatch", version: "3.1.5" },
          {
            path: "node_modules/@linkasu/tobii-electron/native/tobiifree-native/package.json",
            name: "@linka/tobiifree-native",
            version: "0.0.1"
          },
          {
            path: "node_modules/@linkasu/tobii-electron/package.json",
            name: "@linkasu/tobii-electron",
            version: "0.2.17"
          }
        ]
      }
    ]
  };
  const provenance = {
    schema: 1,
    version: "4.0.0",
    platform: "windows",
    run: "123",
    app: inventory.app,
    tooling: inventory.tooling,
    files: [installer]
  };
  const audit = {
    auditReportVersion: 2,
    metadata: { vulnerabilities: { total: 6 } },
    vulnerabilities: {
      archiver: {
        name: "archiver",
        severity: "moderate",
        nodes: ["node_modules/archiver"],
        via: ["archiver-utils", "readdir-glob", "zip-stream"]
      },
      "archiver-utils": {
        name: "archiver-utils",
        severity: "moderate",
        nodes: [
          "node_modules/archiver-utils",
          "node_modules/zip-stream/node_modules/archiver-utils"
        ],
        via: ["glob"]
      },
      glob: {
        name: "glob",
        severity: "moderate",
        nodes: ["node_modules/glob"],
        via: ["minimatch"]
      },
      "readdir-glob": {
        name: "readdir-glob",
        severity: "moderate",
        nodes: ["node_modules/readdir-glob"],
        via: ["minimatch"]
      },
      "zip-stream": {
        name: "zip-stream",
        severity: "moderate",
        nodes: ["node_modules/zip-stream"],
        via: ["archiver-utils"]
      },
      minimatch: {
        name: "minimatch",
        severity: "moderate",
        nodes: ["node_modules/minimatch", "node_modules/readdir-glob/node_modules/minimatch"],
        via: [
          {
            name: "minimatch",
            dependency: "minimatch",
            severity: "moderate",
            url: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
            range: "<11.0.1"
          }
        ]
      }
    }
  };
  return { inventory, provenance, audit, lock };
}

test("binds reviewed findings to inventory, exact lock and provenance without accepting release risk", () => {
  const f = fixture();
  const result = verify(f);
  assert.equal(result.status, "REVIEWED_SOURCE_ONLY");
  assert.equal(result.remainingFindings, 6);
  assert.equal(result.sourceSubpackages[0].classification, "SOURCE_SUBPACKAGE");
  assert.equal(
    result.sourceSubpackages[0].parentArchiveSha256,
    "10a66998baa78e273a5d33ce183f2a18d22bd660561dcd07e5662d5cfc292fb2"
  );
});

function changeLock(f, mutate) {
  const lock = JSON.parse(f.lock);
  mutate(lock.packages);
  f.lock = Buffer.from(JSON.stringify(lock));
  f.inventory.lockSha256 = createHash("sha256").update(f.lock).digest("hex");
  f.inventory.pins = Object.entries(lock.packages).map(([path, pkg]) => ({ path, ...pkg }));
}

for (const [name, mutate] of [
  [
    "source subpackage without packaged parent",
    (f) => {
      f.inventory.packaged[0].packages.pop();
    }
  ],
  [
    "different Tobii archive",
    (f) =>
      changeLock(f, (packages) => {
        packages["node_modules/@linkasu/tobii-electron"].integrity = "sha512-replaced";
      })
  ],
  [
    "different Tobii URL",
    (f) =>
      changeLock(f, (packages) => {
        packages["node_modules/@linkasu/tobii-electron"].resolved =
          "https://example.com/repacked.tgz";
      })
  ],
  [
    "installed optional native module",
    (f) =>
      changeLock(f, (packages) => {
        packages["node_modules/@linka/tobiifree-native"] = { version: "0.0.1", optional: true };
      })
  ],
  [
    "shipped installed native module",
    (f) => {
      f.inventory.packaged[0].packages[2].path =
        "node_modules/@linka/tobiifree-native/package.json";
    }
  ],
  [
    "changed source subpackage version",
    (f) => {
      f.inventory.packaged[0].packages[2].version = "0.0.2";
    }
  ],
  [
    "returned production node-gyp chain",
    (f) =>
      changeLock(f, (packages) => {
        packages["node_modules/node-gyp"].dev = false;
      })
  ],
  [
    "shipped dev node-gyp",
    (f) => {
      f.inventory.packaged[0].packages.push({
        path: "node_modules/node-gyp/package.json",
        name: "node-gyp",
        version: "11.5.0"
      });
    }
  ],
  [
    "returned G advisory",
    (f) => {
      f.audit.vulnerabilities.glob.via.push({
        name: "glob",
        dependency: "glob",
        severity: "moderate",
        url: "https://github.com/advisories/GHSA-3g3m-2fjr-6pw4",
        range: ">=9.0.0 <=14.0.1"
      });
    }
  ],
  [
    "unknown advisory",
    (f) => {
      f.audit.vulnerabilities.minimatch.via[0].url += "-new";
    }
  ],
  [
    "unknown finding",
    (f) => {
      f.audit.vulnerabilities.other = { name: "other", severity: "moderate", nodes: [], via: [] };
      f.audit.metadata.vulnerabilities.total++;
    }
  ],
  [
    "new severity",
    (f) => {
      f.audit.vulnerabilities.minimatch.severity = "high";
    }
  ],
  [
    "new node",
    (f) => {
      f.audit.vulnerabilities.minimatch.nodes.push("node_modules/new/node_modules/minimatch");
    }
  ],
  [
    "new packaged version",
    (f) => {
      f.inventory.packaged[0].packages[1].version = "3.1.6";
    }
  ],
  [
    "stale lock",
    (f) => {
      f.lock = Buffer.from("{}");
    }
  ],
  [
    "stale pin",
    (f) => {
      f.inventory.pins[0].version = "3.5.34";
    }
  ],
  [
    "different source",
    (f) => {
      f.provenance.app = "e".repeat(40);
    }
  ],
  [
    "different installer",
    (f) => {
      f.provenance.files[0] = { ...f.provenance.files[0], sha256: "f".repeat(64) };
    }
  ],
  [
    "incomplete audit",
    (f) => {
      f.audit.metadata.vulnerabilities.total = 0;
    }
  ]
]) {
  test(`rejects ${name}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => verify(f));
  });
}

test("archiver directory treats glob-looking filenames as names, without compiling matcher patterns", async () => {
  const fs = require("node:fs/promises");
  const { tmpdir } = require("node:os");
  const path = require("node:path");
  const { createRequire } = require("node:module");
  const archiver = require("archiver");
  const AdmZip = require("adm-zip");
  const root = await fs.mkdtemp(path.join(tmpdir(), "linka-a02-"));
  const archiverRequire = createRequire(require.resolve("archiver"));
  const utilsRequire = createRequire(archiverRequire.resolve("archiver-utils"));
  const minimatches = [
    createRequire(utilsRequire.resolve("glob"))("minimatch"),
    createRequire(archiverRequire.resolve("readdir-glob"))("minimatch")
  ];
  const original = minimatches.map((item) => item.Minimatch.prototype.make);
  try {
    for (const item of minimatches)
      item.Minimatch.prototype.make = () => {
        throw new Error("unexpected pattern construction from directory input");
      };
    const filename = "{glob,parts}[x].txt";
    await fs.writeFile(path.join(root, filename), "content");
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks = [];
    const complete = new Promise((resolve, reject) => {
      archive.on("data", (chunk) => chunks.push(chunk));
      archive.once("end", resolve);
      archive.once("error", reject);
    });
    archive.directory(root, false);
    await archive.finalize();
    await complete;
    assert.deepEqual(
      new AdmZip(Buffer.concat(chunks)).getEntries().map((entry) => entry.entryName),
      [filename]
    );
  } finally {
    minimatches.forEach((item, index) => {
      item.Minimatch.prototype.make = original[index];
    });
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("missing runtime node-gyp-build binding throws without spawning a compiler", async () => {
  const fs = require("node:fs/promises");
  const { tmpdir } = require("node:os");
  const { join } = require("node:path");
  const childProcess = require("node:child_process");
  const { createRequire } = require("node:module");
  const trackerRequire = createRequire(require.resolve("@linkasu/tobii-electron/main"));
  const usbRequire = createRequire(trackerRequire.resolve("usb"));
  const root = await fs.mkdtemp(join(tmpdir(), "linka-a02-empty-native-"));
  const methods = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"];
  const original = methods.map((name) => childProcess[name]);
  let calls = 0;
  try {
    for (const name of methods)
      childProcess[name] = () => {
        calls++;
        throw new Error("unexpected runtime compiler process");
      };
    assert.throws(
      () => usbRequire("node-gyp-build/node-gyp-build.js")(root),
      /No native build was found/
    );
    assert.equal(calls, 0);
  } finally {
    methods.forEach((name, index) => {
      childProcess[name] = original[index];
    });
    await fs.rm(root, { recursive: true, force: true });
  }
});
