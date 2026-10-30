"""Fail-closed resource/native gate; all paths and original bytes stay on runner."""
import importlib.util
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile

spec = importlib.util.spec_from_file_location("report", Path(__file__).with_name("report-asar-evidence.py"))
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)
evidence = report.evidence
require = evidence.require
TEAM = "29HEQ626X2"
NAME = "LINKa. смотри.app"


def codesign(*args):
    return subprocess.run(["codesign", *map(str, args)], check=True, capture_output=True).stderr


def identity(path, arch=None):
    codesign("--verify", "--strict", "--all-architectures", path)
    detail = codesign("--display", "--verbose=4", *(["--arch", arch] if arch else []), path)
    require(re.search(rb"^Authority=Developer ID Application: .+ \(" + TEAM.encode() + rb"\)$",
                      detail, re.M) is not None)
    require(b"TeamIdentifier=" + TEAM.encode() in detail.splitlines())


def native_equal(left, right):
    a, b = left.read_bytes(), right.read_bytes()
    result = report.native_diff(a, b)
    require(result["supported"] and result["sliceComparisons"])
    require(all(s["codeHashEqual"] and s["sectionsHashEqual"] and s["nOsoHashEqual"]
                for s in result["sliceComparisons"]))
    for item in result["after"]["slices"]:
        identity(right, {0x1000007: "x86_64", 0x100000c: "arm64"}[item["cpuType"]])
    # Compare every byte, including load commands, UUID, symbols, padding and FAT layout.
    # Only Apple's signature removal on disposable copies may normalize signing metadata.
    with tempfile.TemporaryDirectory() as tmp:
        normalized = []
        for index, source in enumerate((left, right)):
            target = Path(tmp) / str(index)
            shutil.copy2(source, target)
            data = source.read_bytes()
            _, layouts = report.native_layout(data)
            if any(category == "signing_command" for layout in layouts for _, _, category in layout):
                codesign("--remove-signature", target)
            normalized.append(target.read_bytes())
        # codesign allocates __LINKEDIT VM in 16 KiB pages and removal retains it.
        # Permit only sizes derived from each original file, never arbitrary VM changes.
        for index, data in enumerate(normalized):
            side, _ = report.native_layout(data)
            require(side["unsupportedReason"] == "none")
            normalized[index] = bytearray(data)
        sides = [report.native_layout(data)[0] for data in normalized]
        require(sides[0]["slices"] == sides[1]["slices"])
        for item in sides[0]["slices"]:
            base = item["offset"]
            position = base + 32
            for _ in range(struct.unpack_from("<I", normalized[0], base + 16)[0]):
                command, size = struct.unpack_from("<II", normalized[0], position)
                if command == 0x19 and normalized[0][position + 8:position + 24].rstrip(b"\0") == b"__LINKEDIT":
                    old_vm = struct.unpack_from("<Q", normalized[0], position + 32)[0]
                    new_vm = struct.unpack_from("<Q", normalized[1], position + 32)[0]
                    page = 4096 if item["cpuType"] == 0x1000007 else 16384
                    if old_vm != new_vm:
                        for original, vm, pages in ((a, old_vm, (page, 16384)), (b, new_vm, (16384,))):
                            original_side, _ = report.native_layout(original)
                            original_slice = next(s for s in original_side["slices"]
                                                  if (s["cpuType"], s["cpuSubtype"]) ==
                                                  (item["cpuType"], item["cpuSubtype"]))
                            original_pos = original_slice["offset"] + position - base
                            require(struct.unpack_from("<II", original, original_pos) == (0x19, size))
                            require(original[original_pos + 8:original_pos + 24].rstrip(b"\0") == b"__LINKEDIT")
                            require(struct.unpack_from("<Q", original, original_pos + 32)[0] == vm)
                            fileoff = struct.unpack_from("<Q", original, original_pos + 40)[0]
                            filesize = struct.unpack_from("<Q", original, original_pos + 48)[0]
                            require(fileoff + filesize == original_slice["size"])
                            require(vm in {(filesize + p - 1) // p * p for p in pages})
                        struct.pack_into("<Q", normalized[0], position + 32, new_vm)
                position += size
        require(normalized[0] == normalized[1])


def resources(left, right, signing=False):
    left, right = (Path(p) / "Contents/Resources" for p in (left, right))
    manifests = [evidence.unpacked_manifest(p) for p in (left, right)]
    require(manifests[0].keys() == manifests[1].keys())
    for name, before in manifests[0].items():
        after = manifests[1][name]
        require(before["kind"] == after["kind"] and before["mode"] == after["mode"])
        if before["kind"] != "file":
            require(before == after)
            continue
        a, b = left / name, right / name
        with a.open("rb") as source:
            magic = source.read(4)
        if signing and magic in report.MAGICS:
            native_equal(a, b)
        else:
            require(before == after)  # Raw ASAR, JS, unknown formats and every extra resource.


def verify(root, app):
    root, app = evidence.no_symlink_parents(root), evidence.no_symlink_parents(app)
    for arch, directory in (("x64", "mac"), ("arm64", "mac-arm64")):
        before = root / "apps/unsigned-before" / arch / NAME
        after = root / "apps/signed-rebuild" / arch / NAME
        current = app / "dist" / directory / NAME
        require(before.is_dir() and after.is_dir() and current.is_dir())
        expected = "x86_64" if arch == "x64" else "arm64"
        executable = current / "Contents/MacOS/LINKa. смотри"
        actual = subprocess.run(["lipo", "-archs", str(executable)], check=True, capture_output=True).stdout
        require(actual.strip() == expected.encode())
        identity(after)
        identity(current)
        resources(before, after, signing=True)
        resources(after, current)
        # Hook execution alone never proves signing or notarization.
        for bundle in (after, current):
            subprocess.run(["xcrun", "stapler", "validate", str(bundle)], check=True, capture_output=True)
            subprocess.run(["spctl", "--assess", "--type", "execute", str(bundle)],
                           check=True, capture_output=True)


if __name__ == "__main__":
    try:
        if len(sys.argv) == 4 and sys.argv[1] == "resources-equal":
            resources(*sys.argv[2:])
        elif len(sys.argv) == 3:
            verify(*sys.argv[1:])
        else:
            raise ValueError()
    except Exception:
        sys.exit("macOS payload verification rejected")
