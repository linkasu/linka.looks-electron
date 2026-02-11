param(
  [string]$OldVersion = "2.7.0",
  [string]$NewVersion = "2.8.0",
  [string]$Repo = "linkasu/linka.looks-electron",
  [int]$Port = 37831
)

$ErrorActionPreference = "Stop"

$workRoot = Join-Path $env:RUNNER_TEMP "linka-update-smoke"
$downloadDir = Join-Path $workRoot "downloads"
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

Write-Host "Downloading release assets from $Repo..."
$oldInstaller = "linka.looks-setup-$OldVersion.exe"
$newInstaller = "linka.looks-setup-$NewVersion.exe"

& gh release download "v$OldVersion" -R $Repo -p $oldInstaller -D $downloadDir | Out-Null
& gh release download "v$NewVersion" -R $Repo -p "latest.yml" -p $newInstaller -p "$newInstaller.blockmap" -D $downloadDir | Out-Null

$server = $null
$logPath = Join-Path $workRoot "update.log"

try {
  Write-Host "Starting local update feed on port $Port..."
  $server = Start-Process -FilePath python -ArgumentList "-m","http.server",$Port,"--directory",$downloadDir -WindowStyle Hidden -PassThru

  Write-Host "Installing old version $OldVersion..."
  $installerPath = Join-Path $downloadDir $oldInstaller
  Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait

  $installRoot = Join-Path $env:LOCALAPPDATA "Programs"
  $exe = Get-ChildItem -Path $installRoot -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "linka" } |
    Select-Object -First 1

  if (-not $exe) {
    throw "Installed executable not found under $installRoot"
  }

  Write-Host "Launching app from $($exe.FullName) to trigger update..."
  $env:UPDATE_FEED_URL = "http://127.0.0.1:$Port"
  $env:UPDATE_TEST_MODE = "1"
  $env:UPDATE_LOG_PATH = $logPath
  Start-Process -FilePath $exe.FullName -Wait

  Start-Sleep -Seconds 20

  Write-Host "Checking installed version..."
  $env:PRINT_APP_VERSION = "1"
  $versionOutput = & $exe.FullName 2>&1
  $versionOutput = $versionOutput.Trim()

  if ($versionOutput -ne $NewVersion) {
    throw "Expected version $NewVersion, got '$versionOutput'"
  }

  Write-Host "Update smoke test passed: $versionOutput"
} finally {
  if ($server) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $logPath) {
    Copy-Item -Path $logPath -Destination (Join-Path $env:GITHUB_WORKSPACE "update-smoke.log") -Force
    Get-Content $logPath
  }
}
