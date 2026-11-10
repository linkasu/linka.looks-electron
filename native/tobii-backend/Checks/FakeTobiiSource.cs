using System;

namespace Linka.TobiiBackend
{
    // Checks compile the real stdin/mutex lifecycle against this SDK-free source.
    internal sealed class TobiiSource : IDisposable
    {
        internal static bool Created, Disposed;

        public TobiiSource() { Created = true; }

        public Reply Snapshot(double id, Bounds bounds) => new Reply { Id = id, Status = "connecting" };

        public void Dispose() { Disposed = true; }
    }
}
