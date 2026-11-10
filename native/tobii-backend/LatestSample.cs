using System.Diagnostics;

namespace Linka.TobiiBackend
{
    internal sealed class LatestSample
    {
        private double _x, _y;
        private long _receivedAt, _sequence;
        private bool _hasSample;
        private double? _lastTimestamp;

        // Caller holds the source lock, including for invalidation and snapshot.
        public void Accept(double x, double y, long now, double timestamp)
        {
            bool valid = Protocol.Finite(x) && Protocol.Finite(y) && Protocol.Finite(timestamp);
            if (!valid) Clear();
            if (!Protocol.Finite(timestamp) ||
                (_lastTimestamp.HasValue && timestamp <= _lastTimestamp.Value)) return;
            _lastTimestamp = timestamp;
            if (!valid) return;
            _x = x;
            _y = y;
            _receivedAt = now;
            _sequence++;
            _hasSample = true;
        }

        public void Clear() => _hasSample = false;

        public void ResetGeneration()
        {
            Clear();
            _lastTimestamp = null;
        }

        public static string Status(Sample sample) => sample == null ? "connecting" :
            sample.AgeMs > 300 ? "stale" : "tracking";

        public Sample Snapshot(long now) => !_hasSample ? null : new Sample
        {
            X = _x, Y = _y, Sequence = _sequence,
            AgeMs = System.Math.Max(0, (now - _receivedAt) * 1000.0 / Stopwatch.Frequency)
        };
    }
}
