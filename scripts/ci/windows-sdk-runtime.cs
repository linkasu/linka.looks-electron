using System;
using System.Runtime.InteropServices;

// Compile as x86, matching the pinned SDK. Never search PATH or load arbitrary DLL names.
public static class SdkRuntimeProbe {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr LoadLibraryEx(string name, IntPtr file, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    static int Probe(string name) {
        var module = LoadLibraryEx(name, IntPtr.Zero, 0x800); // LOAD_LIBRARY_SEARCH_SYSTEM32
        if (module == IntPtr.Zero) return Marshal.GetLastWin32Error();
        if (!FreeLibrary(module)) throw new Exception("Runtime probe cleanup failed");
        return 0;
    }
    public static int Main() {
        if (IntPtr.Size != 4) return 7;
        Console.WriteLine("{\"Bits\":32,\"Msvcp110\":" + Probe("MSVCP110.dll") +
            ",\"Msvcr110\":" + Probe("MSVCR110.dll") + "}");
        return 0;
    }
}
