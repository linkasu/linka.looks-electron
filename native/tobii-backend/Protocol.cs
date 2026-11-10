using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Xml;

namespace Linka.TobiiBackend
{
    [DataContract]
    internal sealed class Command
    {
        [DataMember(Name = "id", IsRequired = true)] public double Id { get; set; }
        [DataMember(Name = "type", IsRequired = true)] public string Type { get; set; }
    }

    [DataContract]
    internal sealed class Reply
    {
        [DataMember(Name = "id")] public double? Id { get; set; }
        [DataMember(Name = "protocol")] public int Protocol { get; set; } = 1;
        [DataMember(Name = "status")] public string Status { get; set; }
        [DataMember(Name = "errorCode")] public string ErrorCode { get; set; }
        public Sample Sample { get; set; }
    }

    // getLatest must include an explicit null sample, unlike hello.
    [DataContract]
    internal sealed class LatestReply
    {
        [DataMember(Name = "id")] public double Id { get; set; }
        [DataMember(Name = "protocol")] public int Protocol { get; set; } = 1;
        [DataMember(Name = "status")] public string Status { get; set; }
        [DataMember(Name = "errorCode")] public string ErrorCode { get; set; }
        [DataMember(Name = "sample")] public Sample Sample { get; set; }
        [DataMember(Name = "bounds")] public Bounds Bounds { get; set; }
    }

    [DataContract]
    internal sealed class Sample
    {
        [DataMember(Name = "x")] public double X { get; set; }
        [DataMember(Name = "y")] public double Y { get; set; }
        [DataMember(Name = "sequence")] public long Sequence { get; set; }
        [DataMember(Name = "ageMs")] public double AgeMs { get; set; }
    }

    [DataContract]
    internal sealed class Bounds
    {
        [DataMember(Name = "left")] public int Left { get; set; }
        [DataMember(Name = "top")] public int Top { get; set; }
        [DataMember(Name = "width")] public int Width { get; set; }
        [DataMember(Name = "height")] public int Height { get; set; }

        public bool SameAs(Bounds other) => other != null && Left == other.Left &&
            Top == other.Top && Width == other.Width && Height == other.Height;
    }

    internal static class Protocol
    {
        public static bool Read(TextReader input, out Command command)
        {
            command = null;
            var line = new StringBuilder();
            bool oversized = false;
            int c;
            while ((c = input.Read()) != -1 && c != '\n')
            {
                if (line.Length < 4097) line.Append((char)c);
                else oversized = true;
            }
            if (c == -1 && line.Length == 0 && !oversized) return false;
            if (line.Length != 0 && line[line.Length - 1] == '\r') line.Length--;
            if (oversized || line.Length > 4096) return true;
            var json = line.ToString().Trim();
            // The framework JSON reader ignores trailing root values; commands contain only scalars.
            if (json.Length < 2 || json[0] != '{' || json[json.Length - 1] != '}') return true;
            bool quoted = false;
            for (int i = 1; i < json.Length - 1; i++)
            {
                char value = json[i];
                if (quoted && value == '\\') { i++; continue; }
                if (value == '"') quoted = !quoted;
                else if (!quoted && (value == '{' || value == '}')) return true;
            }
            try
            {
                using (var reader = JsonReaderWriterFactory.CreateJsonReader(
                    Encoding.UTF8.GetBytes(json), XmlDictionaryReaderQuotas.Max))
                {
                    var document = new XmlDocument();
                    document.Load(reader);
                    var root = document.DocumentElement;
                    if (root == null || root.GetAttribute("type") != "object") return true;
                    int ids = 0, types = 0;
                    foreach (XmlNode node in root.ChildNodes)
                    {
                        var field = node as XmlElement;
                        if (field == null) return true;
                        if (field.Name == "id" && field.GetAttribute("type") == "number") ids++;
                        else if (field.Name == "type" && field.GetAttribute("type") == "string") types++;
                        else return true;
                    }
                    if (ids != 1 || types != 1) return true;
                }
                using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                    command = (Command)new DataContractJsonSerializer(typeof(Command)).ReadObject(stream);
                if (command == null || !Finite(command.Id) || command.Id <= 0 ||
                    command.Id > 9007199254740991 || command.Id != Math.Truncate(command.Id) ||
                    (command.Type != "hello" && command.Type != "getLatest" && command.Type != "shutdown"))
                    command = null;
            }
            catch (SerializationException) { command = null; }
            catch (XmlException) { command = null; }
            return true;
        }

        public static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);

        public static void Write(TextWriter output, object reply)
        {
            using (var stream = new MemoryStream())
            {
                new DataContractJsonSerializer(reply.GetType()).WriteObject(stream, reply);
                output.WriteLine(Encoding.UTF8.GetString(stream.ToArray()));
                output.Flush();
            }
        }
    }
}
