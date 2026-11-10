const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const installerPath = path.resolve(__dirname, "../../build/installer.nsh");

test("installer cooperatively checks processes and embeds the required runtimes", async () => {
  const source = await fs.readFile(installerPath, "utf8");
  assert.match(source, /!macro customCheckAppRunning\b/);
  assert.doesNotMatch(source, /taskkill|Stop-Process|nsProcess::KillProcess/i);
  assert.match(
    source,
    /SetRegView 64\s+ReadRegDWORD \$1 HKLM "SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" "Release"/
  );
  assert.match(source, /\$\{If\} \$1 < 528040/);
  for (const filename of ["ndp48.exe", "vcredist_x64.exe"]) {
    assert.ok(
      source.includes(
        `File /oname=$PLUGINSDIR\\${filename} "\${BUILD_RESOURCES_DIR}\\prerequisites\\${filename}"`
      )
    );
  }
  assert.match(source, /VisualStudio\\11\.0\\VC\\Runtimes\\x64" "Installed"/);
  assert.match(
    source,
    /\$\{StdUtils\.ExecShellAsUser\} \$0 "\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" "open" "--bubble-resume"/
  );
});

for (const uninstall of [false, true]) {
  test(`real NSIS syntax compilation: ${uninstall ? "BUILD_UNINSTALLER" : "installer"}`, async (t) => {
    const version = spawnSync("makensis", ["-VERSION"], { encoding: "utf8" });
    if (version.error?.code === "ENOENT") {
      t.skip(
        "makensis is not on PATH; electron-builder's private NSIS does not necessarily expose it"
      );
      return;
    }
    assert.ifError(version.error);
    assert.equal(version.status, 0, version.stderr);

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bubble-installer-test-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const resources = path.join(directory, "build");
    const backend = path.join(directory, "extraResources", "bubble-backend");
    await fs.mkdir(path.join(resources, "prerequisites"), { recursive: true });
    await fs.mkdir(backend, { recursive: true });
    for (const filename of ["ndp48.exe", "vcredist_x64.exe"]) {
      await fs.writeFile(path.join(resources, "prerequisites", filename), "synthetic runtime");
    }
    await fs.writeFile(path.join(resources, "vcredist_x86.exe"), "synthetic x86 runtime");
    await fs.writeFile(path.join(backend, "fixture.dat"), "synthetic backend");

    // These stubs check macro syntax only, not either Windows plugin's behavior.
    const fixture = `
!include LogicLib.nsh
!define BUILD_RESOURCES_DIR "${resources}"
!define APP_EXECUTABLE_FILENAME "Looks.exe"
${uninstall ? "!define BUILD_UNINSTALLER" : ""}
!macro StubExecShellAsUser result executable verb arguments
  StrCpy \${result} 0
!macroend
!define StdUtils.ExecShellAsUser '!insertmacro StubExecShellAsUser'
!macro StubFindProcess executable result
  StrCpy \${result} 603
!macroend
!define nsProcess::FindProcess '!insertmacro StubFindProcess'
!include "${installerPath}"
Name "Bubble syntax fixture"
OutFile "${path.join(directory, "fixture.exe")}"
InstallDir "$TEMP\\bubble-syntax-fixture"
RequestExecutionLevel user
!insertmacro customHeader
${
  uninstall
    ? `Section
  WriteUninstaller "$INSTDIR\\uninstall.exe"
SectionEnd
Section Uninstall`
    : "Section"
}
  !insertmacro customCheckAppRunning
  !insertmacro customCheckAppRunning
${uninstall ? "" : "  !insertmacro customInstall"}
SectionEnd
`;
    const script = path.join(directory, "fixture.nsi");
    await fs.writeFile(script, fixture);
    const option = process.platform === "win32" ? "/" : "-";
    const runCompiler = (args) => {
      const result = spawnSync("makensis", [...args, script], {
        cwd: directory,
        encoding: "utf8",
        timeout: 30000
      });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return result.stdout;
    };
    const expanded = runCompiler([`${option}PPO`]);
    if (uninstall) {
      assert.doesNotMatch(
        expanded,
        /EnsureBubbleRuntime|ndp48\.exe|vcredist|ExecWait|--bubble-resume/
      );
      assert.match(expanded, /Close LINKa and Bubble before uninstalling/);
    } else {
      assert.match(expanded, /Function EnsureBubbleRuntime/);
      assert.match(expanded, /ndp48\.exe/);
      assert.match(expanded, /vcredist_x64\.exe/);
      assert.match(expanded, /--wait-installation-exit/);
    }
    runCompiler([`${option}V2`]);
    assert.ok((await fs.stat(path.join(directory, "fixture.exe"))).size > 0);
  });
}
