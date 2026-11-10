using System;
using System.IO;
using System.Text;
using System.Threading;

namespace Linka.TobiiBackend
{
    internal static class Program
    {
        private static int Main()
        {
            return Run(@"Local\LINKa.Bubble");
        }

        internal static int Run(string mutexName)
        {
            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);
            using (var mutex = new Mutex(false, mutexName))
            {
                bool owns;
                try { owns = mutex.WaitOne(0); }
                catch (AbandonedMutexException) { owns = true; }
                try
                {
                    using (var source = owns ? new TobiiSource() : null)
                    {
                        Command command;
                        while (Protocol.Read(Console.In, out command))
                        {
                            if (command == null)
                            {
                                Protocol.Write(Console.Out, new Reply { Status = "unavailable", ErrorCode = "INVALID_REQUEST" });
                                continue;
                            }
                            var reply = owns ? source.Snapshot(command.Id, null) : new Reply
                            { Id = command.Id, Status = "legacy-conflict", ErrorCode = "LEGACY_CONFLICT" };
                            if (!owns)
                            {
                                Protocol.Write(Console.Out, reply);
                                break;
                            }
                            if (command.Type == "getLatest")
                            {
                                Bounds bounds = null;
                                try { bounds = PrimaryMonitor.Read(); }
                                catch (Exception)
                                {
                                    reply.Status = "unavailable";
                                    reply.ErrorCode = "DISPLAY_UNAVAILABLE";
                                    reply.Sample = null;
                                }
                                if (bounds != null) reply = source.Snapshot(command.Id, bounds);
                                Protocol.Write(Console.Out, new LatestReply { Id = command.Id, Status = reply.Status,
                                    ErrorCode = reply.ErrorCode, Sample = reply.Sample, Bounds = bounds });
                            }
                            else Protocol.Write(Console.Out, reply);
                            if (command.Type == "shutdown") break;
                        }
                    }
                }
                catch (IOException) { /* Parent closed the pipe. */ }
                finally { if (owns) mutex.ReleaseMutex(); }
            }
            return 0;
        }
    }
}
