param(
  [string]$OldVersion = "2.7.0",
  [string]$NewVersion = "2.8.0",
  [int]$Port = 37831
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$workRoot = Join-Path $env:RUNNER_TEMP "linka-update-smoke"
$downloadDir = Join-Path $workRoot "downloads"
New-Item -ItemType Directory -Force -Path $downloadDir | Out-Null

function Set-PackageVersion {
  param([string]$Version)
  $packagePath = Join-Path $repoRoot "package.json"
  $packageJson = Get-Content $packagePath -Raw | ConvertFrom-Json
  $packageJson.version = $Version
  $packageJson | ConvertTo-Json -Depth 20 | Set-Content -Path $packagePath -Encoding UTF8
}

function Build-Installer {
  param(
    [string]$Version,
    [string]$OutputDir,
    [switch]$IncludeLatest
  )
  $distDir = Join-Path $repoRoot "dist_electron"
  if (Test-Path $distDir) {
    Remove-Item -Path $distDir -Recurse -Force
  }

  Write-Host "Building version $Version..."
  Set-PackageVersion -Version $Version
  Push-Location $repoRoot
  try {
    yarn electron:build -- -p never
  } finally {
    Pop-Location
  }

  $latestPath = Join-Path $distDir "latest.yml"
  if (-not (Test-Path $latestPath)) {
    throw "latest.yml not found after build"
  }

  $latestContent = Get-Content $latestPath -Raw
  $lines = $latestContent -split "`r?`n"
  $pathLine = $lines | Where-Object { $_ -match "^\s*path:\s*" } | Select-Object -First 1
  if (-not $pathLine) {
    $pathLine = $lines | Where-Object { $_ -match "^\s*url:\s*" } | Select-Object -First 1
  }
  if (-not $pathLine) {
    Write-Host "latest.yml content:"
    Write-Host $latestContent
    throw "Could not parse installer path from latest.yml"
  }
  $installerName = ($pathLine -replace "^\s*(path|url):\s*", "").Trim().Trim('"')
  $installerPath = Join-Path $distDir $installerName
  if (-not (Test-Path $installerPath)) {
    $foundInstaller = Get-ChildItem -Path $distDir -Recurse -File -Filter $installerName -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($foundInstaller) {
      $installerPath = $foundInstaller.FullName
    } else {
      Write-Host "Installer not found at expected path. dist_electron contents:"
      Get-ChildItem -Path $distDir -Recurse -File | Select-Object FullName | Write-Host
      throw "Installer not found: $installerPath"
    }
  }

  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
  Copy-Item -Path $installerPath -Destination (Join-Path $OutputDir $installerName) -Force

  if ($IncludeLatest) {
    Copy-Item -Path $latestPath -Destination (Join-Path $OutputDir "latest.yml") -Force
  }

  return (Join-Path $OutputDir $installerName)
}

$server = $null
$logPath = Join-Path $workRoot "update.log"

try {
  $packageBackup = Get-Content (Join-Path $repoRoot "package.json") -Raw
  $feedDir = Join-Path $downloadDir "feed"
  $oldDir = Join-Path $downloadDir "old"

  $oldInstallerPath = Build-Installer -Version $OldVersion -OutputDir $oldDir
  $newInstallerPath = Build-Installer -Version $NewVersion -OutputDir $feedDir -IncludeLatest

  Write-Host "Starting local update feed on port $Port..."
  $server = Start-Process -FilePath python -ArgumentList "-m","http.server",$Port,"--directory",$feedDir -WindowStyle Hidden -PassThru

  Write-Host "Installing old version $OldVersion..."
  Start-Process -FilePath $oldInstallerPath -ArgumentList "/S" -Wait

  function Find-InstallExecutable {
    $roots = @(
      "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
      "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
      "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
    )

    foreach ($root in $roots) {
      if (-not (Test-Path $root)) {
        continue
      }
      foreach ($item in Get-ChildItem $root) {
        $props = Get-ItemProperty $item.PSPath -ErrorAction SilentlyContinue
        if (-not $props) {
          continue
        }
        $displayName = $props.DisplayName
        if (-not $displayName -or $displayName -notmatch "linka") {
          continue
        }

        if ($props.DisplayIcon) {
          $iconPath = $props.DisplayIcon.Trim('"').Split(",")[0]
          if (Test-Path $iconPath) {
            return $iconPath
          }
        }

        if ($props.InstallLocation) {
          $candidate = Get-ChildItem -Path $props.InstallLocation -File -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "linka" } |
            Select-Object -First 1
          if ($candidate) {
            return $candidate.FullName
          }
        }
      }
    }

    $fallbackRoots = @(
      (Join-Path $env:LOCALAPPDATA "Programs"),
      ${env:ProgramFiles},
      ${env:ProgramFiles(x86)}
    )

    foreach ($path in $fallbackRoots) {
      if (-not $path -or -not (Test-Path $path)) {
        continue
      }
      $candidate = Get-ChildItem -Path $path -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "linka" } |
        Select-Object -First 1
      if ($candidate) {
        return $candidate.FullName
      }
    }

    return $null
  }

  $exePath = Find-InstallExecutable

  if (-not $exePath) {
    throw "Installed executable not found in registry or known install paths"
  }

  Write-Host "Launching app from $exePath to trigger update..."
  $env:UPDATE_FEED_URL = "http://127.0.0.1:$Port"
  $env:UPDATE_TEST_MODE = "1"
  $env:UPDATE_LOG_PATH = $logPath
  Start-Process -FilePath $exePath -Wait

  Start-Sleep -Seconds 45

  Write-Host "Checking installed version..."
  $env:PRINT_APP_VERSION = "1"
  $versionOutput = & $exePath 2>&1
  $versionOutput = $versionOutput.Trim()

  if ($versionOutput -ne $NewVersion) {
    throw "Expected version $NewVersion, got '$versionOutput'"
  }

  Write-Host "Update smoke test passed: $versionOutput"
} finally {
  if ($packageBackup) {
    Set-Content -Path (Join-Path $repoRoot "package.json") -Value $packageBackup -Encoding UTF8
  }
  if ($server) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $logPath) {
    Copy-Item -Path $logPath -Destination (Join-Path $env:GITHUB_WORKSPACE "update-smoke.log") -Force
    Get-Content $logPath
  }
}
