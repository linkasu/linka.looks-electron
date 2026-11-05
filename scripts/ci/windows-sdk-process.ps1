param([Parameter(Mandatory)][string]$Executable, [string]$Arguments = "", [int]$TimeoutMs = 10000)
$ErrorActionPreference = "Stop"
[Console]::Error.WriteLine("[DEBUG-sdk] PowerShell ready; starting Add-Type")
$watch = [System.Diagnostics.Stopwatch]::StartNew()
Add-Type -Path "$PSScriptRoot/windows-sdk-process.cs"
[Console]::Error.WriteLine("[DEBUG-sdk] Add-Type complete at $($watch.ElapsedMilliseconds)ms; starting containment")
# Never inherit the runner's token, proxy, signing, user profile or Node environment.
$environment = "SystemRoot=$env:SystemRoot`0WINDIR=$env:SystemRoot"
$result = [WindowsSdkProcess]::Run($Executable, $Arguments, (Split-Path $Executable), $environment, $TimeoutMs)
[Console]::Error.WriteLine("[DEBUG-sdk] containment complete at $($watch.ElapsedMilliseconds)ms")
$result | ConvertTo-Json -Compress
