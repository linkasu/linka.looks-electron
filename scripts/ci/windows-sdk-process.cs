using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// Suspended start prevents descendants escaping before assignment to the kill-on-close job.
public static class WindowsSdkProcess
{
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong readOperations,writeOperations,otherOperations,readBytes,writeBytes,otherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long processTime,jobTime; public uint flags; public UIntPtr minWorkingSet,maxWorkingSet; public uint activeProcessLimit; public UIntPtr affinity; public uint priority,scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Limits {
        public BasicLimits basic; public IO io; public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long userTime,kernelTime,periodUserTime,periodKernelTime; public uint faults,total,active,terminated;
    }
    [StructLayout(LayoutKind.Sequential)] struct Security { public int size; public IntPtr descriptor; public int inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct Startup {
        public int size; public string reserved,desktop,title; public uint x,y,w,h,xc,yc,fill,flags;
        public short show,reservedSize; public IntPtr reservedPtr,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a, string b);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j, int c, ref Limits l, int n);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr j, int c, out Accounting a, int n, IntPtr r);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr j, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr p, uint code);
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(
        string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags,
        IntPtr env, string cwd, ref Startup s, out ProcessInfo p);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr r, out IntPtr w, ref Security s, int n);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetHandleInformation(IntPtr h, uint mask, uint flags);
    [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr t);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr p, uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr p, out uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern uint SetErrorMode(uint mode);

    public sealed class Result {
        public uint ExitCode; public bool TimedOut, OutputLimit, Cleanup;
        public string Stdout, Stderr;
    }
    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static Task<string> Read(IntPtr handle) {
        return Task.Run(() => {
            using (var stream = new FileStream(new SafeFileHandle(handle, true), FileAccess.Read)) {
                var bytes = new byte[8193]; int total = 0, count;
                while (total < bytes.Length && (count = stream.Read(bytes, total, bytes.Length-total)) > 0) total += count;
                return Encoding.UTF8.GetString(bytes, 0, total);
            }
        });
    }
    public static Result Run(string executable, string arguments, string cwd, string environment, uint timeout) {
        IntPtr job = IntPtr.Zero, outputRead = IntPtr.Zero, outputWrite = IntPtr.Zero;
        IntPtr errorRead = IntPtr.Zero, errorWrite = IntPtr.Zero, env = IntPtr.Zero;
        var p = new ProcessInfo(); bool assigned = false;
        try {
            SetErrorMode(0x8003); // No critical-error/GP-fault/open-file dialogs on the ephemeral runner.
            job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
            var limits = new Limits(); limits.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            Check(SetInformationJobObject(job, 9, ref limits, Marshal.SizeOf(limits)));
            var security = new Security { size = Marshal.SizeOf(typeof(Security)), inherit = 1 };
            Check(CreatePipe(out outputRead, out outputWrite, ref security, 0));
            Check(CreatePipe(out errorRead, out errorWrite, ref security, 0));
            Check(SetHandleInformation(outputRead, 1, 0)); Check(SetHandleInformation(errorRead, 1, 0));
            using (var input = new FileStream("NUL", FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
                Check(SetHandleInformation(input.SafeFileHandle.DangerousGetHandle(), 1, 1));
                var startup = new Startup { size = Marshal.SizeOf(typeof(Startup)), flags = 0x100,
                    input = input.SafeFileHandle.DangerousGetHandle(), output = outputWrite, error = errorWrite };
                env = Marshal.StringToHGlobalUni(environment + "\0\0");
                Check(CreateProcess(executable, new StringBuilder("\"" + executable + "\" " + arguments),
                    IntPtr.Zero, IntPtr.Zero, true, 0x08000404, env, cwd, ref startup, out p));
            }
            Check(AssignProcessToJobObject(job, p.process)); assigned = true;
            CloseHandle(outputWrite); outputWrite = IntPtr.Zero; CloseHandle(errorWrite); errorWrite = IntPtr.Zero;
            var stdout = Read(outputRead); outputRead = IntPtr.Zero;
            var stderr = Read(errorRead); errorRead = IntPtr.Zero;
            Check(ResumeThread(p.thread) != UInt32.MaxValue);
            var result = new Result(); var watch = Stopwatch.StartNew();
            while (WaitForSingleObject(p.process, 20) == 258) {
                if ((stdout.IsCompleted && stdout.Result.Length > 8192) || (stderr.IsCompleted && stderr.Result.Length > 8192)) {
                    result.OutputLimit = true; break;
                }
                if (watch.ElapsedMilliseconds >= timeout) { result.TimedOut = true; break; }
            }
            // Always terminate descendants, even if the root exits first.
            Check(TerminateJobObject(job, 1));
            watch.Restart();
            Accounting accounting;
            do {
                Check(QueryInformationJobObject(job, 1, out accounting, Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
                if (accounting.active == 0) break;
                WaitForSingleObject(p.process, 20);
            } while (watch.ElapsedMilliseconds < 5000);
            result.Cleanup = accounting.active == 0;
            Check(GetExitCodeProcess(p.process, out result.ExitCode));
            if (!Task.WaitAll(new Task[] {stdout, stderr}, 5000)) throw new Exception("Output pipes did not close");
            result.Stdout = stdout.Result; result.Stderr = stderr.Result;
            result.OutputLimit |= result.Stdout.Length > 8192 || result.Stderr.Length > 8192;
            return result;
        } finally {
            if (p.process != IntPtr.Zero && !assigned) { Check(TerminateProcess(p.process, 1)); Check(WaitForSingleObject(p.process, 5000) == 0); }
            foreach (var handle in new[] {job,p.process,p.thread,outputRead,outputWrite,errorRead,errorWrite})
                if (handle != IntPtr.Zero) Check(CloseHandle(handle));
            if (env != IntPtr.Zero) Marshal.FreeHGlobal(env);
        }
    }
}
