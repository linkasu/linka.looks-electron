param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][string]$Descriptor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
# This script installs per-machine software. Never relax this boundary for a developer PC.
if ($env:OS -ne "Windows_NT" -or $env:GITHUB_ACTIONS -ne "true" -or
    $env:RUNNER_ENVIRONMENT -ne "github-hosted" -or $env:ImageOS -ne "win22" -or
    $env:GITHUB_REPOSITORY -ne "linkasu/linka.looks-electron") {
  throw "Only the disposable Microsoft-hosted windows-2022 qualification runner is allowed"
}
if (-not $env:RUNNER_TEMP -or -not $env:GITHUB_WORKSPACE) { throw "Missing runner paths" }
foreach ($name in @("TEST_USER_DATA_DIR", "LINKA_HOME_DIR", "UPDATE_TEST_MODE", "NODE_OPTIONS")) {
  if (Test-Path "Env:$name") { throw "Unexpected inherited override: $name" }
}
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if ((Get-Location).Path -ne $repoRoot) { throw "Run this harness from the repository root" }
$candidate = (Resolve-Path $CandidateDirectory).Path
$env:UPGRADE_DESCRIPTOR = (Resolve-Path $Descriptor).Path
& node (Join-Path $PSScriptRoot "real-upgrade-contract.cjs") $candidate
if ($LASTEXITCODE -ne 0) { throw "Candidate execution guard failed" }

foreach ($root in @($env:APPDATA, $env:LOCALAPPDATA)) {
  if (Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -match "linka" }) {
    throw "Runner already contains LINKa application data; refusing to touch it"
  }
}
$homeDir = Join-Path $env:USERPROFILE "Documents/LINKa"
if (Test-Path -LiteralPath $homeDir) { throw "Runner already contains LINKa documents" }
$work = Join-Path $env:RUNNER_TEMP "linka-real-upgrade"
if (Test-Path -LiteralPath $work) { throw "Qualification work directory is not fresh" }
New-Item -ItemType Directory -Path $work | Out-Null
$evidence = Join-Path $repoRoot "release-evidence/qualification"
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
trap {
  $evidenceVariable = Get-Variable -Name evidence -ErrorAction SilentlyContinue
  if ($null -ne $evidenceVariable -and (Test-Path -LiteralPath $evidenceVariable.Value)) {
    $message = $_ | Out-String
    $message.Substring(0, [Math]::Min(8192, $message.Length)) | Set-Content -LiteralPath (Join-Path $evidenceVariable.Value "upgrade-launcher-error.txt")
  }
  break
}
$old = Join-Path $work "baseline-installer.exe"
$oldJson = & node -e "const fs=require('node:fs');process.stdout.write(JSON.stringify(require(process.argv[1]).candidateConfiguration(JSON.parse(fs.readFileSync(process.env.UPGRADE_DESCRIPTOR,'utf8'))).old))" (Join-Path $PSScriptRoot "real-upgrade-contract.cjs")
if ($LASTEXITCODE -ne 0) { throw "Historical release contract missing" }
$oldRelease = $oldJson | ConvertFrom-Json
Invoke-WebRequest -Uri $oldRelease.url -OutFile $old
if ((Get-Item -LiteralPath $old).Length -ne $oldRelease.size -or
    (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant() -ne
    $oldRelease.sha256) {
  throw "Published historical installer size/hash mismatch"
}
$install = Join-Path $work "installed"
if ($install -match '\s') { throw "NSIS /D target must be an unquoted runner path without spaces" }
$exe = Join-Path $install "LINKa. смотри.exe"
# Block real services before first execution, including an unexpected installer auto-launch.
$rule = "LINKa-U01-$env:GITHUB_RUN_ID"
$rollbackExe = Join-Path $work "historical-reader/LINKa. смотри.exe"
foreach ($program in @($exe, $rollbackExe)) {
  New-NetFirewallRule -DisplayName $rule -Direction Outbound -Program $program -Action Block -RemoteAddress @(
    "0.0.0.0/2", "64.0.0.0/3", "96.0.0.0/4", "112.0.0.0/5",
    "120.0.0.0/6", "124.0.0.0/7", "126.0.0.0/8", "128.0.0.0/1",
    "::/1", "8000::/1"
  ) | Out-Null
}
$succeeded = $false
try {
  $start = [System.Diagnostics.ProcessStartInfo]::new($old)
  $start.UseShellExecute = $false
  $start.ArgumentList.Add("/S")
  $start.ArgumentList.Add("/D=$install")
  $start.Environment.Clear()
  foreach ($item in [Environment]::GetEnvironmentVariables().GetEnumerator()) {
    if ($item.Key -match '^(PATH|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMW6432|COMMONPROGRAMFILES(?:\(X86\))?|COMMONPROGRAMW6432|PROGRAMDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|USERNAME|USERDOMAIN|PUBLIC|ALLUSERSPROFILE)$') {
      $start.Environment[$item.Key] = $item.Value
    }
  }
  $installStarted = Get-Date
  $installer = [System.Diagnostics.Process]::Start($start)
  $installerExited = $installer.WaitForExit(180000)
  Get-ChildItem -LiteralPath $env:TEMP -Filter "dd_vcredist_x86_*.log" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $installStarted -and $_.Length -le 8MB } |
    Select-Object -First 8 | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $evidence "upgrade-prerequisite-$($_.Name)")
    }
  if (-not $installerExited) {
    $processes = @(Get-CimInstance Win32_Process)
    $owned = [System.Collections.Generic.HashSet[uint32]]::new()
    [void]$owned.Add([uint32]$installer.Id)
    do {
      $count = $owned.Count
      foreach ($item in $processes) {
        if ($owned.Contains([uint32]$item.ParentProcessId)) { [void]$owned.Add([uint32]$item.ProcessId) }
      }
    } while ($owned.Count -ne $count)
    @($processes | Where-Object { $owned.Contains([uint32]$_.ProcessId) } | ForEach-Object {
      $native = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      $title = if ($native) { $native.MainWindowTitle } else { $null }
      $responding = if ($native) { $native.Responding } else { $null }
      [PSCustomObject]@{ pid = $_.ProcessId; parent = $_.ParentProcessId; name = $_.Name;
        executable = $_.ExecutablePath; title = $title; responding = $responding }
    }) | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidence "upgrade-installer-processes.json")
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bitmap = [System.Drawing.Bitmap]::new($screen.Width, $screen.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($screen.Left, $screen.Top, 0, 0, $bitmap.Size)
      $bitmap.Save((Join-Path $evidence "upgrade-installer-desktop.png"))
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    throw "Old installer exceeded deadline; owned process/window diagnostics retained"
  }
  if ($installer.ExitCode -ne 0) { throw "Old installer failed: $($installer.ExitCode)" }
  if (-not (Test-Path -LiteralPath $exe)) { throw "Exact installed executable missing" }
  if ((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion -notmatch ('^' + [regex]::Escape($oldRelease.version) + '(?:\.|$)')) {
    throw "Historical installed version does not match pinned baseline"
  }
  if (Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $exe }) {
    throw "Old silent installer unexpectedly auto-launched the app; refusing uninstrumented bootstrap"
  }
  $env:UPGRADE_EXECUTABLE = $exe
  $env:UPGRADE_WORK = $work
  $env:UPGRADE_CANDIDATE = $candidate
  $env:UPGRADE_EVIDENCE = $evidence
  & node (Join-Path $PSScriptRoot "real-upgrade.cjs")
  if ($LASTEXITCODE -ne 0) { throw "Real upgrade qualification failed; see upgrade-result.json" }
  $succeeded = $true
} catch {
  $message = $_ | Out-String
  $message.Substring(0, [Math]::Min(8192, $message.Length)) | Set-Content -LiteralPath (Join-Path $evidence "upgrade-launcher-error.txt")
  throw
} finally {
  $remaining = @(Get-CimInstance Win32_Process | Where-Object { @($exe, $rollbackExe) -contains $_.ExecutablePath })
  # A failed cleanup must not reopen network access; this runner and its rule are disposable.
  if ($succeeded -and $remaining.Count -eq 0) {
    Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
  }
}
