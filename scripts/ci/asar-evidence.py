"""Local, lossless ASAR snapshots and structural diffs; never sign or upload."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import struct
import sys
import tempfile


def require(condition):
    if not condition:
        raise ValueError("invalid evidence")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(value):
    require(isinstance(value, str) and bool(value))
    require(not value.startswith("/") and "\\" not in value and ":" not in value)
    require(all(part not in ("", ".", "..") for part in value.split("/")))
    require(not any(ord(c) < 32 or ord(c) == 127 for c in value))
    return value


def no_symlink_parents(path):
    path = Path(path).absolute()
    require(all(not p.is_symlink() for p in (path, *path.parents)))
    return path


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result)
        result[key] = value
    return result


def load(data):
    return json.loads(data, object_pairs_hook=unique_object)


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def unpacked_manifest(root):
    root = no_symlink_parents(root)
    require(root.is_dir())
    entries = {}

    def visit(directory):
        for path in sorted(directory.iterdir()):
            name = safe_path(path.relative_to(root).as_posix())
            info = path.lstat()
            record = {"mode": stat.S_IMODE(info.st_mode)}
            if stat.S_ISLNK(info.st_mode):
                target = os.readlink(path)
                safe_path(target)
                require(path.resolve().is_relative_to(root.resolve()))
                record.update(kind="link", link=target)
            elif stat.S_ISDIR(info.st_mode):
                record.update(kind="directory")
                visit(path)
            else:
                require(stat.S_ISREG(info.st_mode))
                data = path.read_bytes()
                record.update(kind="file", size=len(data), contentSHA256=sha(data))
            entries[name] = record

    visit(root)
    return entries


def inspect(archive):
    archive = no_symlink_parents(archive)
    require(archive.is_file())
    data = archive.read_bytes()
    require(len(data) >= 16)
    pickle_size, header_size, payload_size, json_size = struct.unpack_from("<IIII", data)
    start = 8 + header_size
    require(pickle_size == 4 and payload_size + 4 == header_size)
    require(header_size % 4 == 0 and 16 + json_size <= start <= len(data))
    header = load(data[16:16 + json_size])
    unpacked_root = Path(str(archive) + ".unpacked")
    unpacked = unpacked_manifest(unpacked_root)
    entries = {}

    def visit(tree, prefix=""):
        require(isinstance(tree, dict) and isinstance(tree.get("files"), dict))
        for name, entry in tree["files"].items():
            safe_path(name)
            require("/" not in name and isinstance(entry, dict))
            path = prefix + name
            record = {"metadata": {k: v for k, v in entry.items() if k != "files"}}
            if "files" in entry:
                require("link" not in entry and "size" not in entry)
                record["kind"] = "directory"
                entries[path] = record
                visit(entry, path + "/")
                continue
            if "link" in entry:
                safe_path(entry["link"])
                record.update(kind="link", link=entry["link"])
            else:
                require(type(entry.get("size")) is int and entry["size"] >= 0)
                require(type(entry.get("unpacked", False)) is bool)
                if entry.get("unpacked"):
                    actual = unpacked.get(path)
                    require(actual is not None and actual["kind"] == "file")
                    size, content_hash = actual["size"], actual["contentSHA256"]
                else:
                    offset = entry.get("offset")
                    require(isinstance(offset, str) and offset.isascii() and offset.isdecimal())
                    begin, end = start + int(offset), start + int(offset) + entry["size"]
                    require(start <= begin <= end <= len(data))
                    size, content_hash = end - begin, sha(data[begin:end])
                record.update(kind="file", size=size, contentSHA256=content_hash,
                              unpacked=entry.get("unpacked", False),
                              sizeMatchesMetadata=size == entry["size"])
                integrity = entry.get("integrity", {})
                if integrity.get("algorithm") == "SHA256":
                    record["hashMatchesMetadata"] = content_hash == integrity.get("hash")
            entries[path] = record

    visit(header)
    for record in entries.values():
        if record["kind"] == "link":
            require(record["link"] in entries)
    return {"schemaVersion": 1, "bytes": len(data), "sha256": sha(data),
            "headerBytes": start, "headerSHA256": sha(data[:start]),
            "entryOrder": list(entries), "entries": entries, "unpackedEntries": unpacked}, data[:start]


def compare(left, right):
    result = {"sameArchive": left["sha256"] == right["sha256"],
              "sameHeader": left["headerSHA256"] == right["headerSHA256"],
              "sameEntryOrder": left["entryOrder"] == right["entryOrder"]}
    for key in ("entries", "unpackedEntries"):
        result[key] = [{"path": path, "before": left[key].get(path), "after": right[key].get(path)}
                       for path in sorted(left[key].keys() | right[key].keys())
                       if left[key].get(path) != right[key].get(path)]
    return result


def capture(app, root, stage):
    require(stage in ("unsigned-before", "signed-rebuild"))
    app, root = no_symlink_parents(app), no_symlink_parents(root)
    require(not root.is_relative_to(app))
    root.mkdir(parents=True, exist_ok=True)
    require(not (root / stage).exists())
    # Publish a stage only after both architectures are captured and rehashed.
    with tempfile.TemporaryDirectory(prefix=".capture-", dir=root) as tmp:
        for arch, directory in (("x64", "mac"), ("arm64", "mac-arm64")):
            source = app / "dist" / directory / "LINKa. смотри.app/Contents/Resources/app.asar"
            before, _ = inspect(source)
            output = Path(tmp) / arch
            output.mkdir()
            shutil.copy2(source, output / "app.asar")
            shutil.copytree(str(source) + ".unpacked", output / "app.asar.unpacked", symlinks=True)
            manifest, raw_header = inspect(output / "app.asar")
            require(manifest == before)
            (output / "header.bin").write_bytes(raw_header)
            write_json(output / "manifest.json", manifest)
        Path(tmp).rename(root / stage)


def diff(root):
    root = no_symlink_parents(root)
    for arch in ("x64", "arm64"):
        manifests = []
        for stage in ("unsigned-before", "signed-rebuild"):
            path = root / stage / arch
            manifest, header = inspect(path / "app.asar")
            require(manifest == load((path / "manifest.json").read_bytes()))
            require(header == (path / "header.bin").read_bytes())
            manifests.append(manifest)
        write_json(root / ("diff-" + arch + ".json"), compare(*manifests))


def main():
    if len(sys.argv) == 5 and sys.argv[1] == "capture":
        capture(*sys.argv[2:])
    elif len(sys.argv) == 3 and sys.argv[1] == "diff":
        diff(sys.argv[2])
    else:
        raise ValueError("invalid command")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Never echo untrusted paths, file contents or parser exceptions.
        sys.exit("ASAR evidence rejected")
