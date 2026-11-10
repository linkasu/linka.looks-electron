using System;
using System.Runtime.InteropServices;

namespace Linka.TobiiBackend
{
    internal static class PrimaryMonitor
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct Point { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Rect { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)]
        private struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }

        [DllImport("user32.dll")] private static extern IntPtr MonitorFromPoint(Point point, uint flags);
        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);

        public static Bounds Read()
        {
            var info = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
            if (!GetMonitorInfo(MonitorFromPoint(new Point(), 1), ref info))
                throw new InvalidOperationException("Primary monitor unavailable.");
            return new Bounds { Left = info.Monitor.Left, Top = info.Monitor.Top,
                Width = info.Monitor.Right - info.Monitor.Left,
                Height = info.Monitor.Bottom - info.Monitor.Top };
        }
    }
}
