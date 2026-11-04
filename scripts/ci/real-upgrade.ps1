param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory
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
$evidence = Join-Path $repoRoot "release-evidence/400"
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$old = Join-Path $work "linka.looks-3.3.1-win-x64.exe"
$oldJson = & node -e "process.stdout.write(JSON.stringify(require(process.argv[1]).OLD))" (Join-Path $PSScriptRoot "real-upgrade-contract.cjs")
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
    if ($item.Key -match '^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|USERNAME|USERDOMAIN|PUBLIC|ALLUSERSPROFILE)$') {
      $start.Environment[$item.Key] = $item.Value
    }
  }
  $installer = [System.Diagnostics.Process]::Start($start)
  if (-not $installer.WaitForExit(180000)) { throw "Old installer exceeded deadline" }
  if ($installer.ExitCode -ne 0) { throw "Old installer failed: $($installer.ExitCode)" }
  if (-not (Test-Path -LiteralPath $exe)) { throw "Exact installed executable missing" }
  if ((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion -notmatch '^3\.3\.1(?:\.|$)') {
    throw "Historical installed version is not 3.3.1"
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
  $_ | Out-String | Set-Content -LiteralPath (Join-Path $evidence "upgrade-launcher-error.txt")
  throw
} finally {
  $remaining = @(Get-CimInstance Win32_Process | Where-Object { @($exe, $rollbackExe) -contains $_.ExecutablePath })
  # A failed cleanup must not reopen network access; this runner and its rule are disposable.
  if ($succeeded -and $remaining.Count -eq 0) {
    Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
  }
}
