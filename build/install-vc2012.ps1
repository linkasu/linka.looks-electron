$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$urls = @{ 
  x86 = "https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x86.exe"
  x64 = "https://download.microsoft.com/download/1/6/B/16B06F60-3B20-4FF2-B699-5E9B7962F9AE/VSU_4/vcredist_x64.exe"
}
$temp = Join-Path $env:TEMP "vc2012_$arch.exe"
Invoke-WebRequest $urls[$arch] -OutFile $temp
Start-Process -FilePath $temp -ArgumentList '/install','/quiet','/norestart' -Wait
Remove-Item $temp
