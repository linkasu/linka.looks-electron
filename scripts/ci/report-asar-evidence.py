"""Runner-only byte comparison; publish only a closed, path-free numeric schema."""
import importlib.util
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import time

spec = importlib.util.spec_from_file_location("asar_evidence", Path(__file__).with_name("asar-evidence.py"))
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)
require = evidence.require
APP = "25a967bbefce93ff2e5dd17623cd10568b9dea76"
MAX_FILE = 1024 ** 3
MAX_TOTAL = 4 * MAX_FILE
MAX_COUNT = 100000
MAX_REPORT = 16 * 1024 ** 2
CATEGORIES = ("signature", "signing_command", "uuid", "load_command", "mach_header",
              "section_code", "section_data", "section_const", "section_debug",
               "symbol_table", "linkedit", "unknown")
REASONS = ("none", "missing", "unknown_magic", "unsupported_magic", "unsupported_cpu", "malformed_layout",
           "unsupported_load_command", "architecture_mismatch")
MAGICS = {b"\xcf\xfa\xed\xfe": "thin64le", b"\xfe\xed\xfa\xcf": "thin64be",
          b"\xce\xfa\xed\xfe": "thin32le", b"\xfe\xed\xfa\xce": "thin32be",
          b"\xca\xfe\xba\xbe": "fat32be", b"\xbe\xba\xfe\xca": "fat32le",
          b"\xca\xfe\xba\xbf": "fat64be", b"\xbf\xba\xfe\xca": "fat64le"}


class UnsupportedCommand(ValueError):
    pass


def bounded_tree(root):
    """Bound work before the existing lossless inspector reads any payload."""
    root = evidence.no_symlink_parents(root)
    count = total = 0
    pending = [(root, 0)]
    while pending:
        directory, depth = pending.pop()
        require(depth <= 128)
        for path in directory.iterdir():
            count += 1
            require(count <= MAX_COUNT and not path.is_symlink())
            if path.is_dir():
                pending.append((path, depth + 1))
            else:
                require(path.is_file())
                size = path.stat().st_size
                total += size
                require(size <= MAX_FILE and total <= MAX_TOTAL)
                if path.name == "app.asar":
                    with path.open("rb") as source:
                        header = source.read(16)
                    require(len(header) == 16)
                    require(struct.unpack_from("<I", header, 4)[0] <= 64 * 1024 ** 2)


def changed(left, right):
    # Equal chunks take the C fast path; every unequal byte, including tails, counts.
    count = abs(len(left) - len(right))
    for start in range(0, min(len(left), len(right)), 1024 * 1024):
        a, b = left[start:start + 1024 * 1024], right[start:start + 1024 * 1024]
        size = min(len(a), len(b))
        if a[:size] != b[:size]:
            count += sum(x != y for x, y in zip(a[:size], b[:size]))
    return count


def macho_ranges(data):
    """Conservative thin little-endian Mach-O 64 layout; never decode symbol strings."""
    require(len(data) >= 32)
    magic, cpu, _, filetype, ncmds, cmdbytes, _, _ = struct.unpack_from("<8I", data)
    require(magic == 0xfeedfacf and cpu in (0x1000007, 0x100000c))
    require(filetype in (2, 6, 8) and ncmds <= 4096 and 32 + cmdbytes <= len(data))
    ranges = [(0, 32, "mach_header")]

    def add(offset, size, category):
        require(0 <= offset <= offset + size <= len(data))
        if size:
            require(len(ranges) < MAX_COUNT)
            ranges.append((offset, offset + size, category))

    position = 32
    for _ in range(ncmds):
        require(position + 8 <= 32 + cmdbytes)
        command, size = struct.unpack_from("<II", data, position)
        require(size >= 8 and size % 8 == 0 and position + size <= 32 + cmdbytes)
        category = "load_command"
        if command == 0x19:
            require(size >= 72)
            fileoff, filesize = struct.unpack_from("<QQ", data, position + 40)
            require(fileoff + filesize <= len(data))
            sections = struct.unpack_from("<I", data, position + 64)[0]
            require(sections <= 4096 and size == 72 + 80 * sections)
            for index in range(sections):
                section = position + 72 + 80 * index
                length = struct.unpack_from("<Q", data, section + 40)[0]
                offset = struct.unpack_from("<I", data, section + 48)[0]
                flags = struct.unpack_from("<I", data, section + 64)[0]
                if flags & 0xff not in (1, 0xc, 0x12):  # zerofill has no file bytes
                    require(fileoff <= offset <= offset + length <= fileoff + filesize)
                    name = data[section:section + 16].rstrip(b"\0")
                    segment = data[section + 16:section + 32].rstrip(b"\0")
                    section_class = "unknown"
                    if flags & (0x80000000 | 0x400):
                        section_class = "section_code"
                    elif segment == b"__DWARF":
                        section_class = "section_debug"
                    elif name in (b"__const", b"__cstring", b"__literal4", b"__literal8", b"__literal16"):
                        section_class = "section_const"
                    elif segment in (b"__DATA", b"__DATA_CONST"):
                        section_class = "section_data"
                    add(offset, length, section_class)
        elif command == 0x1d:  # LC_CODE_SIGNATURE, not all of __LINKEDIT
            require(size == 16)
            add(*struct.unpack_from("<II", data, position + 8), "signature")
            category = "signing_command"
        elif command == 0x1b:
            require(size == 24)
            add(position, 8, "load_command")
            add(position + 8, 16, "uuid")
            position += size
            continue
        elif command == 2:  # Includes N_OSO values; never output strings.
            require(size == 24)
            symoff, nsyms, stroff, strsize = struct.unpack_from("<4I", data, position + 8)
            require(nsyms <= MAX_COUNT)
            add(symoff, nsyms * 16, "symbol_table")
            add(stroff, strsize, "symbol_table")
        elif command in (0x22, 0x80000022):
            require(size == 48)
            values = struct.unpack_from("<10I", data, position + 8)
            for index in range(0, 10, 2):
                add(values[index], values[index + 1], "linkedit")
        elif command in (0x1e, 0x26, 0x29, 0x2b, 0x2e, 0x80000033, 0x80000034):
            require(size == 16)
            add(*struct.unpack_from("<II", data, position + 8), "linkedit")
        elif command == 0xb:
            require(size == 80)
            values = struct.unpack_from("<18I", data, position + 8)
            for index, width in ((6, 8), (8, 56), (10, 4), (12, 4), (14, 8), (16, 8)):
                add(values[index], values[index + 1] * width, "linkedit")
        elif command in (0x24, 0x25, 0x2a, 0x2d, 0x80000028):
            require(size == {0x24: 16, 0x25: 16, 0x2a: 16,
                             0x2d: 16, 0x80000028: 24}[command])
        elif command == 0x32:
            require(size >= 24)
            require(size == 24 + 8 * struct.unpack_from("<I", data, position + 20)[0])
        elif command in (0xc, 0xd, 0x80000018, 0x8000001f, 0xe, 0x8000001c):
            minimum = 24 if command in (0xc, 0xd, 0x80000018, 0x8000001f) else 12
            require(size >= minimum)
            string_offset = struct.unpack_from("<I", data, position + 8)[0]
            require(minimum <= string_offset < size)
            require(b"\0" in data[position + string_offset:position + size])
        else:
            raise UnsupportedCommand("unsupported native layout")
        add(position, size, category)
        position += size
    require(position == 32 + cmdbytes)
    ranges.sort()
    require(all(a[1] <= b[0] for a, b in zip(ranges, ranges[1:])))
    return ranges


def native_layout(data):
    """Only numeric identity escapes; untrusted strings are never decoded."""
    kind = MAGICS.get(bytes(data[:4]), "unknown" if data else "missing")
    result = {"magicKind": kind, "sliceCount": 0, "slices": [], "unsupportedReason": "none"}
    layouts = []
    reason = "malformed_layout"
    try:
        require(len(data) <= MAX_FILE)
        if kind in ("unknown", "missing"):
            reason = "unknown_magic" if data else "missing"
            raise ValueError()
        entries = []
        if kind.startswith("fat"):
            endian = ">" if kind.endswith("be") else "<"
            wide = kind.startswith("fat64")
            width = 32 if wide else 20
            require(len(data) >= 8)
            count = struct.unpack_from(endian + "I", data, 4)[0]
            require(1 <= count <= 32 and 8 + count * width <= len(data))
            for index in range(count):
                values = struct.unpack_from(endian + ("IIQQII" if wide else "IIIII"),
                                            data, 8 + index * width)
                cpu, subtype, offset, size, align = values[:5]
                require(not wide or values[5] == 0)
                require(align <= 31 and offset % (1 << align) == 0)
                require(8 + count * width <= offset < offset + size <= len(data))
                entries.append((cpu, subtype, offset, size))
            ordered = sorted(entries, key=lambda item: item[2])
            require(all(a[2] + a[3] <= b[2] for a, b in zip(ordered, ordered[1:])))
            require(len({(e[0], e[1]) for e in entries}) == count)
        else:
            require(len(data) >= 12)
            endian = "<" if kind.endswith("le") else ">"
            cpu, subtype = struct.unpack_from(endian + "II", data, 4)
            entries = [(cpu, subtype, 0, len(data))]
        for cpu, subtype, offset, size in entries:
            part = data[offset:offset + size]
            slice_kind = MAGICS.get(bytes(part[:4]), "unknown")
            require(slice_kind.startswith("thin") and len(part) >= 12)
            endian = "<" if slice_kind.endswith("le") else ">"
            require(struct.unpack_from(endian + "II", part, 4) == (cpu, subtype))
            result["slices"].append({"magicKind": slice_kind, "cpuType": cpu,
                                     "cpuSubtype": subtype, "offset": offset, "size": size})
        result["sliceCount"] = len(entries)
        for entry, identity in zip(entries, result["slices"]):
            cpu, _, offset, size = entry
            if identity["magicKind"] != "thin64le" or cpu not in (0x1000007, 0x100000c):
                reason = "unsupported_magic" if identity["magicKind"] != "thin64le" else "unsupported_cpu"
                raise ValueError()
            layouts.append(macho_ranges(data[offset:offset + size]))
    except UnsupportedCommand:
        result["unsupportedReason"] = "unsupported_load_command"
        layouts = []
    except (ValueError, struct.error):
        result["sliceCount"] = len(result["slices"])
        result["unsupportedReason"] = reason
        layouts = []
    return result, layouts


def slice_metadata(data, ranges):
    """Hash comparisons stay local, including N_OSO strings and values."""
    oso = []
    sections = hashlib.sha256()
    position = 32
    ncmds = struct.unpack_from("<I", data, 16)[0]
    for _ in range(ncmds):
        command, size = struct.unpack_from("<II", data, position)
        if command == 0x19:
            # All file-backed sections count, independently of coverage classification.
            count = struct.unpack_from("<I", data, position + 64)[0]
            for index in range(count):
                section = position + 72 + 80 * index
                length, offset = struct.unpack_from("<QI", data, section + 40)
                flags = struct.unpack_from("<I", data, section + 64)[0]
                if flags & 0xff not in (1, 0xc, 0x12):
                    sections.update(struct.pack("<Q", length))
                    sections.update(data[offset:offset + length])
        elif command == 2:
            symoff, count, stroff, strsize = struct.unpack_from("<4I", data, position + 8)
            for index in range(count):
                record = data[symoff + index * 16:symoff + (index + 1) * 16]
                if record[4] == 0x66:  # N_OSO, not the whole symbol/string table
                    string_index = struct.unpack_from("<I", record)[0]
                    require(string_index < strsize)
                    end = data.find(b"\0", stroff + string_index, stroff + strsize)
                    require(end >= 0)
                    oso.append(record + data[stroff + string_index:end])
        position += size

    def digest(categories):
        h = hashlib.sha256()
        for start, end, category in ranges:
            if category in categories:
                h.update(category.encode())
                h.update(struct.pack("<Q", end - start))
                h.update(data[start:end])
        return h.digest()

    return {"code": digest(("section_code",)),
            "sections": sections.digest(),
            "signature": digest(("signature", "signing_command")),
            "loadCommands": digest(("load_command",)), "oso": tuple(oso)}


def native_diff(left, right):
    counts = dict.fromkeys(CATEGORIES, 0)
    total = changed(left, right)
    before, left_layouts = native_layout(left)
    after, right_layouts = native_layout(right)
    reason = next((s["unsupportedReason"] for s in (before, after)
                   if s["unsupportedReason"] != "none"), "none")
    identities = [{(s["cpuType"], s["cpuSubtype"]) for s in side["slices"]}
                  for side in (before, after)]
    if reason == "none" and identities[0] != identities[1]:
        reason = "architecture_mismatch"
    comparisons = []
    if reason in ("none", "architecture_mismatch"):
        try:
            mapped = []
            for data, side, layouts in ((left, before, left_layouts), (right, after, right_layouts)):
                mapped.append({(s["cpuType"], s["cpuSubtype"]): slice_metadata(
                    data[s["offset"]:s["offset"] + s["size"]], layout)
                    for s, layout in zip(side["slices"], layouts)})
            for cpu, subtype in sorted(identities[0] & identities[1]):
                a, b = (side[(cpu, subtype)] for side in mapped)
                comparisons.append({"cpuType": cpu, "cpuSubtype": subtype,
                                    "codeHashEqual": a["code"] == b["code"],
                                    "sectionsHashEqual": a["sections"] == b["sections"],
                                    "signatureHashEqual": a["signature"] == b["signature"],
                                    "loadCommandsHashEqual": a["loadCommands"] == b["loadCommands"],
                                    "nOsoBeforeCount": len(a["oso"]), "nOsoAfterCount": len(b["oso"]),
                                    "nOsoHashEqual": a["oso"] == b["oso"]})
        except (ValueError, struct.error):
            reason = "malformed_layout"
            comparisons = []
    details = {"before": before, "after": after, "unsupportedReason": reason,
               "sliceComparisons": comparisons}
    if reason != "none":
        counts["unknown"] = total
        return {"supported": False, "changedBytes": total, "coverage": counts, **details}
    layouts = [sorted((s["offset"] + start, s["offset"] + end, category)
                      for s, ranges in zip(side["slices"], ranges_list)
                      for start, end, category in ranges)
               for side, ranges_list in ((before, left_layouts), (after, right_layouts))]
    boundaries = sorted({0, len(left), len(right)} | {
        edge for layout in layouts for start, end, _ in layout for edge in (start, end)})
    indices = [0, 0]
    for start, end in zip(boundaries, boundaries[1:]):
        labels = []
        for side, layout in enumerate(layouts):
            while indices[side] < len(layout) and layout[indices[side]][1] <= start:
                indices[side] += 1
            item = layout[indices[side]] if indices[side] < len(layout) else None
            if start < len((left, right)[side]):
                labels.append(item[2] if item and item[0] <= start and end <= item[1] else "unknown")
        category = labels[0] if labels and len(set(labels)) == 1 else "unknown"
        counts[category] += changed(left[start:end], right[start:end])
    require(sum(counts.values()) == total)
    return {"supported": True, "changedBytes": total, "coverage": counts, **details}


def file_bytes(directory, manifest, name, archive, header):
    record = manifest["entries"].get(name)
    if record is None or record["kind"] != "file":
        return b""
    if record["unpacked"]:
        return (directory / "app.asar.unpacked" / name).read_bytes()
    offset = header + int(record["metadata"]["offset"])
    return archive[offset:offset + record["size"]]


def pair(left_directory, right_directory):
    manifests, archives, headers = [], [], []
    for directory in (left_directory, right_directory):
        manifest, header = evidence.inspect(directory / "app.asar")
        require(len(manifest["entries"]) <= MAX_COUNT)
        require(manifest == evidence.load((directory / "manifest.json").read_bytes()))
        require(header == (directory / "header.bin").read_bytes())
        manifests.append(manifest)
        archives.append((directory / "app.asar").read_bytes())
        headers.append(len(header))
    left, right = manifests
    names = sorted(left["entries"].keys() | right["entries"].keys())
    require(len(names) <= MAX_COUNT)
    differences = []
    for ordinal, name in enumerate(names):
        records = [m["entries"].get(name) for m in manifests]
        data = [file_bytes(d, m, name, a, h) for d, m, a, h in zip(
            (left_directory, right_directory), manifests, archives, headers)]
        if records[0] == records[1] and data[0] == data[1]:
            continue
        native = name.endswith((".node", ".dylib", ".so")) or any(
            value[:4] in (b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\x7fELF") for value in data)
        result = native_diff(*data)
        differences.append({"ordinal": ordinal, "native": native,
                            "beforeBytes": len(data[0]), "afterBytes": len(data[1]), **result})
    # Extras outside the ASAR header are compared too; never use the header as an allowlist.
    unpacked = []
    for ordinal, name in enumerate(sorted(left["unpackedEntries"].keys() | right["unpackedEntries"].keys())):
        records = [m["unpackedEntries"].get(name) for m in manifests]
        data = [(d / "app.asar.unpacked" / name).read_bytes()
                if r and r["kind"] == "file" else b""
                for d, r in zip((left_directory, right_directory), records)]
        if records[0] == records[1] and data[0] == data[1]:
            continue
        result = native_diff(*data)
        unpacked.append({"ordinal": ordinal, "beforeBytes": len(data[0]),
                         "afterBytes": len(data[1]), **result})
    return {"beforeBytes": len(archives[0]), "afterBytes": len(archives[1]),
            "archiveChangedBytes": changed(*archives),
            "headerChangedBytes": changed(archives[0][:headers[0]], archives[1][:headers[1]]),
            "entryCounts": [len(m["entries"]) for m in manifests],
            "unpackedCounts": [len(m["unpackedEntries"]) for m in manifests],
            "entryDifferences": differences, "unpackedDifferences": unpacked,
            "strictPayloadEqual": left == right,
            "diagnosisBlocking": left != right or bool(differences or unpacked)}


def integer(value, limit=MAX_TOTAL):
    require(type(value) is int and 0 <= value <= limit)


def keys(value, expected):
    require(type(value) is dict and set(value) == set(expected.split()))


def validate_native(item):
    require(item["unsupportedReason"] in REASONS)
    require(type(item["supported"]) is bool)
    require(item["supported"] == (item["unsupportedReason"] == "none"))
    identities = []
    reasons = []
    for name, byte_count in (("before", item["beforeBytes"]), ("after", item["afterBytes"])):
        side = item[name]
        keys(side, "magicKind sliceCount slices unsupportedReason")
        require(side["magicKind"] in (*MAGICS.values(), "unknown", "missing"))
        require(side["unsupportedReason"] in REASONS)
        kind, reason = side["magicKind"], side["unsupportedReason"]
        require(reason != "architecture_mismatch")
        reasons.append(reason)
        integer(byte_count, MAX_FILE)
        integer(side["sliceCount"], 32)
        require(type(side["slices"]) is list and len(side["slices"]) == side["sliceCount"])
        if kind in ("unknown", "missing"):
            require(not side["slices"])
            require(reason == ("missing" if kind == "missing" else "unknown_magic"))
            require((byte_count == 0) == (kind == "missing"))
        else:
            require(byte_count > 0 and reason not in ("missing", "unknown_magic"))
            if reason != "malformed_layout":
                require(side["sliceCount"] > 0)
        if kind.startswith("thin"):
            require(side["sliceCount"] <= 1)
        if reason == "none":
            require(kind == "thin64le" or kind.startswith("fat"))
        seen = set()
        spans = []
        for entry in side["slices"]:
            keys(entry, "magicKind cpuType cpuSubtype offset size")
            require(entry["magicKind"] in ("thin64le", "thin64be", "thin32le", "thin32be"))
            for field in ("cpuType", "cpuSubtype"):
                integer(entry[field], 0xffffffff)
            for field in ("offset", "size"):
                integer(entry[field], MAX_FILE)
            require(entry["size"] > 0 and entry["offset"] + entry["size"] <= byte_count)
            require(entry["size"] >= 12)
            if kind.startswith("thin"):
                require(entry["magicKind"] == kind and entry["offset"] == 0
                        and entry["size"] == byte_count)
            elif kind.startswith("fat"):
                width = 32 if kind.startswith("fat64") else 20
                require(entry["offset"] >= 8 + width * side["sliceCount"])
            if reason == "none":
                require(entry["magicKind"] == "thin64le" and entry["size"] >= 32)
                require(entry["cpuType"] in (0x1000007, 0x100000c))
            identity = (entry["cpuType"], entry["cpuSubtype"])
            require(identity not in seen)
            seen.add(identity)
            spans.append((entry["offset"], entry["offset"] + entry["size"]))
        spans.sort()
        require(all(a[1] <= b[0] for a, b in zip(spans, spans[1:])))
        if reason == "unsupported_magic":
            require(any(s["magicKind"] != "thin64le" for s in side["slices"]))
        if reason == "unsupported_cpu":
            require(any(s["magicKind"] == "thin64le" and s["cpuType"] not in (0x1000007, 0x100000c)
                        for s in side["slices"]))
        identities.append(seen)
    first_reason = next((reason for reason in reasons if reason != "none"), "none")
    if first_reason != "none":
        require(item["unsupportedReason"] == first_reason)
    else:
        require(item["unsupportedReason"] in ("none", "architecture_mismatch", "malformed_layout"))
    values = item["sliceComparisons"]
    require(type(values) is list and len(values) <= 32)
    if not item["supported"] and item["unsupportedReason"] != "architecture_mismatch":
        require(not values)
        return
    if item["supported"]:
        require(identities[0] == identities[1])
    else:
        require(identities[0] != identities[1])
    require(len(values) == len(identities[0] & identities[1]))
    require(all(item[name]["unsupportedReason"] == "none" for name in ("before", "after")))
    previous = (-1, -1)
    for value in values:
        keys(value, "cpuType cpuSubtype codeHashEqual sectionsHashEqual signatureHashEqual loadCommandsHashEqual nOsoBeforeCount nOsoAfterCount nOsoHashEqual")
        identity = (value["cpuType"], value["cpuSubtype"])
        require(identity in identities[0] & identities[1] and identity > previous)
        previous = identity
        for field in ("cpuType", "cpuSubtype"):
            integer(value[field], 0xffffffff)
        for field in ("codeHashEqual", "sectionsHashEqual", "signatureHashEqual",
                      "loadCommandsHashEqual", "nOsoHashEqual"):
            require(type(value[field]) is bool)
        for field in ("nOsoBeforeCount", "nOsoAfterCount"):
            integer(value[field], MAX_FILE // 16)
        if value["nOsoHashEqual"]:
            require(value["nOsoBeforeCount"] == value["nOsoAfterCount"])


def validate(report, tooling):
    """No arbitrary strings, paths, private-content hashes, or extra fields accepted."""
    keys(report, "schemaVersion app tooling provenance strictGate architectures phaseMilliseconds")
    require(type(report["schemaVersion"]) is int and report["schemaVersion"] == 2)
    require(report["app"] == APP and report["tooling"] == tooling)
    require(type(tooling) is str and re.fullmatch(r"[a-f0-9]{40}", tooling))
    require(report["provenance"] in ("ci-unsigned-signed", "local-unsigned-pair"))
    require(report["strictGate"] == "blocking-independent")
    keys(report["phaseMilliseconds"], "bounds comparison")
    for value in report["phaseMilliseconds"].values():
        integer(value, 86400000)
    keys(report["architectures"], "x64 arm64")
    for arch in report["architectures"].values():
        keys(arch, "beforeBytes afterBytes archiveChangedBytes headerChangedBytes entryCounts unpackedCounts entryDifferences unpackedDifferences strictPayloadEqual diagnosisBlocking")
        require(type(arch["strictPayloadEqual"]) is bool)
        require(type(arch["diagnosisBlocking"]) is bool)
        if not arch["strictPayloadEqual"] or arch["entryDifferences"] or arch["unpackedDifferences"]:
            require(arch["diagnosisBlocking"])
        for name in ("beforeBytes", "afterBytes", "archiveChangedBytes", "headerChangedBytes"):
            integer(arch[name])
        require(arch["archiveChangedBytes"] <= max(arch["beforeBytes"], arch["afterBytes"]))
        if arch["strictPayloadEqual"]:
            require(arch["beforeBytes"] == arch["afterBytes"] and arch["archiveChangedBytes"] == 0)
            require(arch["headerChangedBytes"] == 0)
            require(not arch["entryDifferences"] and not arch["unpackedDifferences"])
        for name in ("entryCounts", "unpackedCounts"):
            require(type(arch[name]) is list and len(arch[name]) == 2)
            for value in arch[name]:
                integer(value, MAX_COUNT)
        for name in ("entryDifferences", "unpackedDifferences"):
            values = arch[name]
            require(type(values) is list and len(values) <= MAX_COUNT)
            previous = -1
            for item in values:
                keys(item, "ordinal beforeBytes afterBytes supported changedBytes coverage before after unsupportedReason sliceComparisons" +
                     (" native" if name == "entryDifferences" else ""))
                if name == "entryDifferences":
                    require(type(item["native"]) is bool)
                integer(item["ordinal"], MAX_COUNT)
                require(item["ordinal"] > previous)
                previous = item["ordinal"]
                require(type(item["supported"]) is bool)
                for key in ("beforeBytes", "afterBytes", "changedBytes"):
                    integer(item[key])
                validate_native(item)
                keys(item["coverage"], " ".join(CATEGORIES))
                for value in item["coverage"].values():
                    integer(value)
                require(sum(item["coverage"].values()) == item["changedBytes"])
                require(item["changedBytes"] <= max(item["beforeBytes"], item["afterBytes"]))
                if not item["supported"]:
                    require(item["coverage"]["unknown"] == item["changedBytes"])
    encoded = json.dumps(report, indent=2).encode() + b"\n"
    require(len(encoded) <= MAX_REPORT)
    return encoded


def generate(root, tooling, provenance):
    start = time.monotonic()
    bounded_tree(root)
    bounded = time.monotonic()
    source = evidence.load((root / "provenance.json").read_bytes())
    require(source == {"app": APP, "tooling": tooling})
    report = {"schemaVersion": 2, "app": APP, "tooling": tooling,
              "provenance": provenance, "strictGate": "blocking-independent",
              "architectures": {arch: pair(root / "unsigned-before" / arch,
                                            root / "signed-rebuild" / arch)
                                for arch in ("x64", "arm64")},
              "phaseMilliseconds": {"bounds": int((bounded - start) * 1000),
                                    "comparison": int((time.monotonic() - bounded) * 1000)}}
    validate(report, tooling)
    return report


def main():
    require(len(sys.argv) == 5 and sys.argv[1] in ("generate", "validate"))
    operation, source, tooling, destination = sys.argv[1:]
    if operation == "generate":
        require(destination == "evidence/report/diagnostic.json")
        output = evidence.no_symlink_parents(destination)
        require(not output.exists())
        report = generate(Path(source), tooling, "ci-unsigned-signed")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(validate(report, tooling))
    else:
        path = evidence.no_symlink_parents(source)
        require(source == "evidence/report/diagnostic.json" and path.stat().st_size <= MAX_REPORT)
        report = evidence.load(path.read_bytes())
        require(report["provenance"] == "ci-unsigned-signed")
        require(path.read_bytes() == validate(report, tooling))
        with open(destination, "a", encoding="utf-8") as output:
            output.write("paths=evidence/report/diagnostic.json\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit("Sanitized ASAR report rejected")
    print("Sanitized ASAR report validated; strict gates unchanged")
