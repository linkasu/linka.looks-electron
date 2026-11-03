$ErrorActionPreference = 'Stop'
if (!$IsWindows -or $env:GITHUB_ACTIONS -ne 'true') { throw 'Windows CI only' }
$source = Join-Path $PSScriptRoot 'windows-model-benchmark.cs'
Add-Type -Path $source
$fixture = Join-Path $env:RUNNER_TEMP "model-allocation-$env:GITHUB_RUN_ID.exe"
$csc = Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $csc /nologo /platform:x64 /target:exe "/out:$fixture" $source
if ($LASTEXITCODE -ne 0) { throw 'Allocation fixture build failed' }
try {
  $limit = [uint64]536870912
  $small = [WindowsModelJob]::Run($fixture, '64', '', $limit, 0)
  if ($small.PeakPrivateCommitBytes -lt 60MB) { throw 'Job peak did not observe allocation' }
  $large = [WindowsModelJob]::Run($fixture, '768', '', [uint64]1073741824, 0)
  if ($large.PeakPrivateCommitBytes -lt 768MB) { throw 'Fixture could not allocate oversized control' }
  $rejected = [WindowsModelJob]::Run($fixture, '768', '', $limit, 42)
  $exe = (Resolve-Path '.windows-model-candidate/lp-electron.exe').Path
  $model = (Resolve-Path '.windows-model-candidate/model.lpk').Path
  $ending = 'я хочу '
  $long = (' ' * (16384 - [Text.Encoding]::UTF8.GetByteCount($ending))) + $ending
  $results = @()
  foreach ($q in @('', 'я', 'я хочу ', 'пожалуйста помогите', $long)) {
    $inputJson = @{q=$q; lang='ru'; limit=5} | ConvertTo-Json -Compress
    $result = [WindowsModelJob]::Run($exe, $model, $inputJson, $limit, 0)
    $response = $result.Output | ConvertFrom-Json
    if ($response.text -isnot [array] -or $response.text.Count -gt 5 -or $response.endOfWord -isnot [bool]) {
      throw 'Invalid native response'
    }
    $results += @{case_index=$results.Count; utf8_bytes=[Text.Encoding]::UTF8.GetByteCount($q);
      peak_private_commit_bytes=$result.PeakPrivateCommitBytes; elapsed_ms=$result.ElapsedMilliseconds;
      active_owned_processes_after_exit=$result.ActiveProcessesAfterExit; suggestions=$response.text.Count}
  }
  @{schema='windows-model-memory-v1'; status='PASS'; scope='sidecar private commit, not whole app or 8GB user PC proof';
    limit_bytes=$limit; method='QueryInformationJobObject PeakProcessMemoryUsed after exit';
    self_check=@{small_peak=$small.PeakPrivateCommitBytes; oversized_control_peak=$large.PeakPrivateCommitBytes;
      oversized_limited_exit=$rejected.ExitCode; oversized_limited_peak=$rejected.PeakPrivateCommitBytes};
    cases=$results; hardware='NOT_TESTED'; production_approved=$false} |
    ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 qualification/memory.json
} finally {
  Remove-Item -LiteralPath $fixture -Force -ErrorAction SilentlyContinue
}
