param([Parameter(Mandatory)][string]$Executable, [string]$Arguments = "", [int]$TimeoutMs = 10000)
$ErrorActionPreference = "Stop"
Add-Type -Path "$PSScriptRoot/windows-sdk-process.cs"
# Never inherit the runner's token, proxy, signing, user profile or Node environment.
$environment = "SystemRoot=$env:SystemRoot`0WINDIR=$env:SystemRoot"
$result = [WindowsSdkProcess]::Run($Executable, $Arguments, (Split-Path $Executable), $environment, $TimeoutMs)
$result | ConvertTo-Json -Compress
