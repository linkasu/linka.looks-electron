using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using Linka.TobiiBackend;

static class Checks
{
    static void Assert(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    static int Main(string[] args)
    {
        if (args.Length == 3 && args[0] == "--lifecycle")
            return LifecycleChecks.RunChild(args[1], args[2] == "conflict");
        Command command;
        var input = new StringReader("{\"id\":1,\"type\":\"hello\"}\r\n" + new string('x', 4097) +
            "\n{broken}\n{\"id\":2,\"type\":\"getLatest\"}\n{\"type\":\"hello\"}\n");
        Assert(Protocol.Read(input, out command) && command.Id == 1, "CRLF hello");
        Assert(Protocol.Read(input, out command) && command == null, "bounded frame");
        Assert(Protocol.Read(input, out command) && command == null, "malformed JSON");
        Assert(Protocol.Read(input, out command) && command.Id == 2, "recover framing");
        Assert(Protocol.Read(input, out command) && command == null, "required id");
        Assert(!Protocol.Read(input, out command), "EOF exits reader");
        foreach (var invalid in new[] {
            "{\"id\":null,\"type\":\"hello\"}", "{\"id\":\"1\",\"type\":\"hello\"}",
            "{\"id\":1,\"type\":\"unknown\"}", "{\"id\":1e999,\"type\":\"hello\"}",
            "{\"id\":1,\"id\":2,\"type\":\"hello\"}", "{\"id\":1,\"type\":\"hello\"}{}",
            "[]", "null", "{\"id\":{},\"type\":\"hello\"}", "{\"id\":0,\"type\":\"hello\"}",
            "{\"id\":1.5,\"type\":\"hello\"}", "{\"id\":9007199254740992,\"type\":\"hello\"}" })
            Assert(Protocol.Read(new StringReader(invalid + "\n"), out command) && command == null,
                "reject invalid command: " + invalid);
        var boundary = "{\"id\":3,\"type\":\"shutdown\"}";
        Assert(Protocol.Read(new StringReader(boundary.PadRight(4096) + "\n"), out command) &&
            command.Type == "shutdown", "4096-character boundary");
        Assert(Protocol.Read(new StringReader(boundary.PadRight(4096) + "\r\n"), out command) &&
            command.Type == "shutdown", "4096-character CRLF boundary");
        var output = new StringWriter();
        Protocol.Write(output, new LatestReply { Id = 1, Status = "connecting", Bounds = new Bounds() });
        Assert(output.ToString().Contains("\"sample\":null") && output.ToString().Contains("\"errorCode\":null"), "explicit nulls");
        output = new StringWriter();
        Protocol.Write(output, new Reply { Id = 1, Status = "tracking", Sample = new Sample { X = 7, Y = 8 } });
        Assert(!output.ToString().Contains("sample") && !output.ToString().Contains("bounds"), "hello has no coordinates");
        var samples = new LatestSample();
        var now = Stopwatch.GetTimestamp();
        Assert(samples.Snapshot(now) == null, "initially empty");
        samples.Accept(1, 2, now, 10);
        var latest = samples.Snapshot(now + Stopwatch.Frequency * 2);
        Assert(latest.X == 1 && latest.Y == 2 && latest.Sequence == 1 && latest.AgeMs == 2000, "finite latest and monotonic age");
        samples.Accept(3, 4, now + Stopwatch.Frequency, 10);
        samples.Accept(5, 6, now + Stopwatch.Frequency, 9);
        Assert(samples.Snapshot(now + Stopwatch.Frequency * 2).AgeMs == 2000 &&
            samples.Snapshot(now).Sequence == 1, "duplicate/out-of-order timestamps cannot renew freshness");
        samples.Accept(double.NaN, 3, now, 9);
        Assert(samples.Snapshot(now) == null, "invalid coordinate clears even with old timestamp");
        samples.Accept(4, 5, now, 11);
        samples.Accept(3, double.PositiveInfinity, now, 12);
        Assert(samples.Snapshot(now) == null, "infinite coordinate clears immediately");
        samples.Accept(4, 5, now, 11);
        Assert(samples.Snapshot(now) == null, "older valid callback cannot restore invalidated sample");
        samples.Accept(4, 5, now, 13);
        samples.Clear();
        Assert(samples.Snapshot(now) == null, "geometry/reconnect invalidation");
        samples.Accept(4, 5, now, 13);
        Assert(samples.Snapshot(now) == null, "geometry invalidation requires a new SDK sample");
        samples.Accept(4, 5, now, 14);
        Assert(samples.Snapshot(now).Sequence == 4, "sequence survives invalidation");
        samples.ResetGeneration();
        Assert(samples.Snapshot(now) == null, "reconnect clears previous sample");
        samples.Accept(6, 7, now + Stopwatch.Frequency, 1);
        Assert(samples.Snapshot(now + Stopwatch.Frequency).Sequence == 5, "new SDK generation resets timestamp guard only");
        Assert(samples.Snapshot(now + Stopwatch.Frequency * 2).X == 6 &&
            samples.Snapshot(now + Stopwatch.Frequency * 2).AgeMs == 1000, "only latest sample retained");
        Assert(LatestSample.Status(samples.Snapshot(now + Stopwatch.Frequency + Stopwatch.Frequency * 299 / 1000)) == "tracking" &&
            LatestSample.Status(samples.Snapshot(now + Stopwatch.Frequency + Stopwatch.Frequency * 301 / 1000)) == "stale", "300ms stale threshold");
        samples.Accept(1, 2, now, double.NaN);
        Assert(samples.Snapshot(now) == null, "non-finite SDK timestamp invalidates sample");
        var bounds = new Bounds { Left = -10, Top = 0, Width = 1920, Height = 1080 };
        Assert(!bounds.SameAs(null) && bounds.SameAs(new Bounds { Left = -10, Width = 1920, Height = 1080 }) &&
            !bounds.SameAs(new Bounds { Width = 1920, Height = 1080 }), "geometry comparison");
        using (var mutex = new Mutex(false, "LinkaTobiiChecks-" + Guid.NewGuid()))
        {
            Assert(mutex.WaitOne(0), "main owns mutex");
            bool acquired = true;
            var thread = new Thread(() => { acquired = mutex.WaitOne(0); });
            thread.Start();
            thread.Join();
            Assert(!acquired, "different thread excluded");
            mutex.ReleaseMutex();
        }
        LifecycleChecks.Run();
        Assert(Maintenance.WaitForExit("relative", "looks.exe") == 2 &&
            Maintenance.WaitForExit(Path.GetTempPath(), "../looks.exe") == 2,
            "maintenance accepts only an absolute installation and a plain executable name");
        Console.WriteLine("Checks passed: framing, nulls, finite latest, SDK timestamps, 300ms freshness, invalidation, mutex ownership.");
        return 0;
    }
}
