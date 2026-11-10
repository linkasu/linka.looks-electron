using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using Linka.TobiiBackend;

internal static class LifecycleChecks
{
    public static int RunChild(string mutexName, bool conflict)
    {
        int code = Linka.TobiiBackend.Program.Run(mutexName);
        if (code != 0 || TobiiSource.Created != !conflict || TobiiSource.Disposed != !conflict)
            throw new Exception("Source must be disposed on EOF/shutdown and never created on conflict.");
        return 0;
    }

    public static void Run()
    {
        string name = (OperatingSystem.IsWindows() ? @"Local\" : "") +
            "LinkaTobiiChecks-" + Guid.NewGuid().ToString("N");
        Probe(name, "", true, false, null);
        Probe(name, "{\"id\":71,\"type\":\"hello\"}\n", true, false, "connecting");
        // stdin stays open: shutdown must exit without waiting for EOF or another request.
        Probe(name, "{\"id\":71,\"type\":\"shutdown\"}\n", false, false, "connecting");
        using (var mutex = new Mutex(false, name))
        {
            if (!mutex.WaitOne(0)) throw new Exception("Test mutex unexpectedly owned.");
            try { Probe(name, "{\"id\":71,\"type\":\"hello\"}\n", false, true, "legacy-conflict"); }
            finally { mutex.ReleaseMutex(); }
        }
        Probe(name, "{\"id\":71,\"type\":\"shutdown\"}\n", false, false, "connecting");
        Console.WriteLine("SDK-free executable checks passed: EOF, hello framing, shutdown, mutex conflict/release.");
    }

    private static void Probe(string name, string input, bool closeInput, bool conflict, string status)
    {
        var start = new ProcessStartInfo(Environment.ProcessPath)
        {
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        if (string.Equals(Path.GetFileNameWithoutExtension(start.FileName), "dotnet", StringComparison.OrdinalIgnoreCase))
            start.ArgumentList.Add(typeof(LifecycleChecks).Assembly.Location);
        start.ArgumentList.Add("--lifecycle");
        start.ArgumentList.Add(name);
        start.ArgumentList.Add(conflict ? "conflict" : "owned");
        using (var process = Process.Start(start))
        {
            var output = process.StandardOutput.ReadToEndAsync();
            var errors = process.StandardError.ReadToEndAsync();
            process.StandardInput.Write(input);
            process.StandardInput.Flush();
            if (closeInput) process.StandardInput.Close();
            if (!process.WaitForExit(5000))
            {
                process.Kill(true);
                process.WaitForExit(5000);
                throw new Exception("SDK-free backend failed to exit on EOF/shutdown/conflict.");
            }
            string text = output.GetAwaiter().GetResult();
            string error = errors.GetAwaiter().GetResult();
            if (process.ExitCode != 0 || error.Length != 0)
                throw new Exception("SDK-free backend lifecycle failed: " + error);
            var lines = text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            if (status == null ? text.Length != 0 : lines.Length != 1 ||
                !lines[0].Contains("\"status\":\"" + status + "\"") || !lines[0].Contains("\"id\":71") ||
                !lines[0].Contains("\"protocol\":1") ||
                (conflict && !lines[0].Contains("\"errorCode\":\"LEGACY_CONFLICT\"")))
                throw new Exception("Unexpected lifecycle response framing/status.");
        }
    }
}
