// Test-only owned-child Job Object guard; stdin stays open until assignment succeeds.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

public static class WindowsModelJob
{
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true, EntryPoint="QueryInformationJobObject")]
    static extern bool QueryLimits(IntPtr job, int type, out ExtendedLimits info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true, EntryPoint="QueryInformationJobObject")]
    static extern bool QueryAccounting(IntPtr job, int type, out Accounting info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr handle);

    public sealed class Result {
        public int ExitCode;
        public ulong PeakPrivateCommitBytes;
        public uint ActiveProcessesAfterExit;
        public string Output;
        public double ElapsedMilliseconds;
    }
    static void Check(bool value) {
        if (!value) throw new InvalidOperationException("Windows Job API failed: " + Marshal.GetLastWin32Error());
    }
    static async Task<string> Drain(StreamReader reader, int limit, Process process) {
        var text = new StringBuilder();
        var chars = new char[1024];
        int n;
        while ((n = await reader.ReadAsync(chars, 0, chars.Length)) != 0) {
            if (text.Length + n > limit) {
                try { process.Kill(); } catch (InvalidOperationException) { }
                throw new InvalidOperationException("Owned child output exceeded bound");
            }
            text.Append(chars, 0, n);
        }
        return text.ToString();
    }
    public static Result Run(string executable, string argument, string input, ulong limit, int expectedExit) {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        Check(job != IntPtr.Zero);
        Process p = null;
        try {
            var limits = new ExtendedLimits();
            limits.Basic.Flags = 0x100 | 0x2000; // PROCESS_MEMORY | KILL_ON_JOB_CLOSE
            limits.ProcessMemoryLimit = new UIntPtr(limit);
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
            if (argument.IndexOf('"') >= 0) throw new InvalidOperationException("Invalid argument");
            var info = new ProcessStartInfo(executable, "\"" + argument + "\"");
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardInput = info.RedirectStandardOutput = info.RedirectStandardError = true;
            info.StandardOutputEncoding = info.StandardErrorEncoding = new UTF8Encoding(false);
            var watch = Stopwatch.StartNew();
            p = Process.Start(info);
            // lp-electron reads stdin to EOF before Model.load. Never close/write before attach.
            Check(AssignProcessToJobObject(job, p.Handle));
            var output = Drain(p.StandardOutput, 65536, p);
            var error = Drain(p.StandardError, 4096, p);
            // Write UTF-8 directly: Windows Framework StandardInputEncoding is not configurable.
            byte[] bytes = new UTF8Encoding(false).GetBytes(input);
            var inputTask = Task.Run(async () => {
                await p.StandardInput.BaseStream.WriteAsync(bytes, 0, bytes.Length);
                p.StandardInput.Close();
            });
            if (!inputTask.Wait(10000)) throw new InvalidOperationException("Owned child stdin timed out");
            if (!p.WaitForExit(10000)) throw new InvalidOperationException("Owned child timed out");
            if (!Task.WaitAll(new Task[] { output, error }, 5000)) throw new InvalidOperationException("Pipe drain timed out");
            watch.Stop();
            Check(QueryLimits(job, 9, out limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)), IntPtr.Zero));
            Accounting accounting = new Accounting();
            // Process exit can precede the Job Object's active-process accounting update.
            if (!SpinWait.SpinUntil(() => {
                Check(QueryAccounting(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
                return accounting.ActiveProcesses == 0;
            }, 2000)) throw new InvalidOperationException("Owned job processes did not drain: active=" + accounting.ActiveProcesses);
            ulong peak = limits.PeakProcessMemoryUsed.ToUInt64();
            if (p.ExitCode != expectedExit || peak == 0 || peak > limit || accounting.ActiveProcesses != 0)
                throw new InvalidOperationException("Owned child check failed: exit=" + p.ExitCode +
                    "; expected=" + expectedExit + "; peak=" + peak + "; limit=" + limit +
                    "; active=" + accounting.ActiveProcesses);
            if (error.Result.Length != 0) throw new InvalidOperationException("Unexpected owned child stderr");
            return new Result { ExitCode = p.ExitCode, PeakPrivateCommitBytes = peak,
                ActiveProcessesAfterExit = accounting.ActiveProcesses, Output = output.Result,
                ElapsedMilliseconds = watch.Elapsed.TotalMilliseconds };
        } finally {
            try {
                if (p != null) {
                    try {
                        if (!p.HasExited) {
                            try { p.Kill(); } catch (InvalidOperationException) { }
                            if (!p.WaitForExit(5000)) throw new InvalidOperationException("Owned child did not stop");
                        }
                    } finally { p.Dispose(); }
                }
            } finally { Check(CloseHandle(job)); }
        }
    }
    // Compiled only into an owned allocation fixture by the Windows qualification script.
    public static int Main(string[] args) {
        Console.In.ReadToEnd();
        try {
            var bytes = new byte[int.Parse(args[0]) * 1024 * 1024];
            for (int i = 0; i < bytes.Length; i += 4096) bytes[i] = 1;
            Console.Write("allocated");
            GC.KeepAlive(bytes);
            return 0;
        } catch (OutOfMemoryException) { return 42; }
    }
}
