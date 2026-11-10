# Tobii headless backend

Windows x64, .NET Framework 4.8, Tobii Interaction 0.7.3. No windows or settings.

Build with the .NET SDK (also cross-compiles on macOS):

```sh
dotnet restore native/tobii-backend/TobiiBackend.csproj --locked-mode
dotnet build native/tobii-backend/TobiiBackend.csproj -c Release --no-restore
dotnet run --project native/tobii-backend/Checks/Checks.csproj -c Release
```

Distribute the **entire** `bin/Release/net48/` folder, including Tobii's native
dependencies; launch `Linka.TobiiBackend.exe` directly on Windows. The Tobii
runtime/driver must already be installed. Do not copy only the executable.

stdin/stdout are UTF-8 newline JSON. Input records are limited to 4096 characters;
invalid records return `INVALID_REQUEST` with null id and are drained to newline.
Commands have numeric `id` and `type`: `hello`, `getLatest`, `shutdown`.
Only commands produce replies; stdout is never a sample stream. `shutdown`
replies before teardown, and EOF also stops the process. No coordinates are logged.

`getLatest` returns physical primary-monitor bounds and the latest finite sample,
or null. Sample age uses Stopwatch, not the wall clock. Samples older than 300 ms
are `stale`. Geometry changes clear the old sample until another callback arrives.
Initialization/reconnection runs in the background, so hello never waits for SDK
startup. A 10-second timer retries initialization or reconnects after more than
10 seconds without samples; reconnect clears the sample. Sequence never resets.

`Local\LINKa.Bubble` is held throughout initialization and reconnect, and released
by the owning stdin/main thread. If already owned, the first valid command gets
`legacy-conflict` / `LEGACY_CONFLICT`, then the process exits without starting SDK.
`SDK_UNAVAILABLE` means initialization failed; `DISPLAY_UNAVAILABLE` means monitor
bounds could not be read. Successful SDK creation without gaze remains `connecting`.

Checks run without Tobii hardware. The same command also
executes the real stdin/mutex program with a compile-time fake source, testing EOF,
hello framing, shutdown with stdin still open, mutex conflict without SDK startup,
and mutex release. Test processes use unique mutex names, not the product mutex;
on Windows these use the same `Local\` namespace as the product mutex.
Windows still needs a smoke test of
the packaged folder, mutex conflict, EOF/shutdown, DPI/monitor changes and SDK
reconnect with actual hardware. Invalid coordinates/timestamps clear the current
sample immediately. Only a strictly increasing SDK timestamp can renew freshness;
the timestamp watermark resets on SDK reconnect, not on monitor geometry changes.
