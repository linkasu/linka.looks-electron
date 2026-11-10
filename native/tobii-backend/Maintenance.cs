using System;
using System.Diagnostics;
using System.IO;

namespace Linka.TobiiBackend
{
    internal static class Maintenance
    {
        // Read-only wait: never kill another installation or user session.
        public static int WaitForExit(string directory, string executable)
        {
            if (!Path.IsPathRooted(directory) || Path.GetFileName(executable) != executable ||
                !executable.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return 2;
            var root = Path.GetFullPath(directory);
            var paths = new[] {
                Path.Combine(root, executable),
                Path.Combine(root, "resources", "extraResources", "bubble-backend", "Linka.TobiiBackend.exe"),
                Path.Combine(root, "resources", "extraResources", "bin", "EyeLog.exe")
            };
            var elapsed = Stopwatch.StartNew();
            try
            {
                using (var current = Process.GetCurrentProcess())
                foreach (var path in paths)
                foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(path)))
                using (process)
                {
                    if (process.Id == current.Id || process.HasExited) continue;
                    // If identity cannot be inspected, fail closed instead of guessing ownership.
                    if (!String.Equals(Path.GetFullPath(process.MainModule.FileName), path,
                        StringComparison.OrdinalIgnoreCase)) continue;
                    var remaining = Math.Max(0, 15000 - (int)elapsed.ElapsedMilliseconds);
                    if (!process.WaitForExit(remaining)) return 2;
                }
                return 0;
            }
            catch (Exception) { return 2; }
        }
    }
}
