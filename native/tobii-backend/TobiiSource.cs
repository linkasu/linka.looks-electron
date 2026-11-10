using System;
using System.Diagnostics;
using System.Threading;
using Tobii.Interaction;
using Tobii.Interaction.Framework;

namespace Linka.TobiiBackend
{
    internal sealed class TobiiSource : IDisposable
    {
        private readonly object _sync = new object();
        private readonly object _sdkSync = new object();
        private readonly LatestSample _latest = new LatestSample();
        private readonly Timer _timer;
        private Host _host;
        private Action _unsubscribe;
        private long _attemptAt;
        private int _generation;
        private bool _disposed;
        private string _error;
        private Bounds _bounds;

        public TobiiSource()
        {
            _attemptAt = Stopwatch.GetTimestamp();
            _timer = new Timer(Reconnect, null, 0, 10000);
        }

        private void Reconnect(object state)
        {
            if (!Monitor.TryEnter(_sdkSync)) return;
            try
            {
                int generation;
                lock (_sync)
                {
                    if (_disposed) return;
                    var now = Stopwatch.GetTimestamp();
                    var sample = _latest.Snapshot(now);
                    var silence = sample == null ? (now - _attemptAt) * 1000.0 / Stopwatch.Frequency : sample.AgeMs;
                    if (_host != null && silence <= 10000) return;
                    generation = ++_generation;
                    _latest.ResetGeneration();
                    _error = null;
                    _attemptAt = now;
                }
                try
                {
                    StopHost();
                    var host = new Host();
                    _host = host;
                    host.EnableConnection();
                    var stream = host.Streams.CreateGazePointDataStream();
                    EventHandler<StreamData<GazePointData>> onGaze = (sender, sample) =>
                    {
                        lock (_sync)
                        {
                            if (!_disposed && generation == _generation)
                                _latest.Accept(sample.Data.X, sample.Data.Y, Stopwatch.GetTimestamp(), sample.Data.Timestamp);
                        }
                    };
                    stream.Next += onGaze;
                    _unsubscribe = () => stream.Next -= onGaze;
                }
                catch (Exception)
                {
                    lock (_sync) { _generation++; _latest.Clear(); _error = "SDK_UNAVAILABLE"; }
                    try { StopHost(); } catch (Exception) { /* Retry at the next timer tick. */ }
                }
            }
            finally { Monitor.Exit(_sdkSync); }
        }

        public Reply Snapshot(double id, Bounds bounds)
        {
            lock (_sync)
            {
                if (bounds != null && !bounds.SameAs(_bounds)) _latest.Clear();
                if (bounds != null) _bounds = bounds;
                var sample = _latest.Snapshot(Stopwatch.GetTimestamp());
                return new Reply { Id = id, Sample = sample,
                    Status = _error != null ? "unavailable" : LatestSample.Status(sample), ErrorCode = _error };
            }
        }

        private void StopHost()
        {
            var unsubscribe = _unsubscribe;
            var host = _host;
            _unsubscribe = null;
            _host = null;
            try { unsubscribe?.Invoke(); }
            finally { host?.Dispose(); }
        }

        public void Dispose()
        {
            lock (_sync) { _disposed = true; _generation++; _latest.Clear(); }
            _timer.Dispose();
            lock (_sdkSync)
            {
                try { StopHost(); } catch (Exception) { /* Teardown must still release the mutex. */ }
            }
        }
    }
}
