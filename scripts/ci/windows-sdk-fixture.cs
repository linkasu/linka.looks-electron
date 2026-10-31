using System;
using System.Diagnostics;
using System.Threading;

public static class SdkFixture {
    public static int Main(string[] args) {
        switch (args[0]) {
            case "clean": return 0;
            case "stdin": return Console.Read() == -1 ? 0 : 7;
            case "crash": throw new InvalidOperationException("synthetic crash");
            case "architecture": return unchecked((int)0xc000007b);
            case "bad-image": Console.Error.WriteLine("Tobii.Interaction BadImageFormatException Host..ctor"); return 1;
            case "output": Console.WriteLine("unexpected"); return 0;
            case "overflow": while (true) Console.Write(new string('x', 1024));
            case "environment":
                foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables()) {
                    if (!String.Equals((string)entry.Key, "SystemRoot", StringComparison.OrdinalIgnoreCase) &&
                        !String.Equals((string)entry.Key, "WINDIR", StringComparison.OrdinalIgnoreCase)) return 9;
                }
                return 0;
            case "tree":
                var child = Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, "hang") {UseShellExecute=false});
                Console.WriteLine(child.Id); return 0;
            case "hang": Thread.Sleep(Timeout.Infinite); return 0;
            default: return 8;
        }
    }
}
