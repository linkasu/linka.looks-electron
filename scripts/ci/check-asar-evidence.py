"""Fail-closed disclosure preflight emitting only validated literal upload paths."""
import importlib.util
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location("asar_evidence", Path(__file__).with_name("asar-evidence.py"))
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)

DENIED_NAME = re.compile(
    r"(^|/)(\.env[^/]*|env(?:\.[^/]*)?|[^/]*(keychain|debug|environment|credentials|certificate)[^/]*)(/|$)"
    r"|\.(pem|key|p12|pfx|cer|crt|der|mobileprovision|log|env|debug)$", re.I)
DENIED_CONTENT = re.compile(
    rb"-----BEGIN [A-Z0-9 ]*(PRIVATE KEY|CERTIFICATE)-----"
    rb"|(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})"
    rb"|(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})"
    rb"|(?:CSC_LINK|CSC_KEY_PASSWORD|APPLE_APP_SPECIFIC_PASSWORD|GITHUB_TOKEN|"
    rb"\b[A-Z0-9_]{0,64}(?:API_KEY|ACCESS_TOKEN|PRIVATE_KEY|CLIENT_SECRET|PASSWORD))"
    rb"[\s\x00\"']*[:=][\s\x00\"']*[^\s\x00\"']{4,}", re.I)
PRIVATE_PATH = re.compile(rb"/(?:Users|home)/[^/\s\x00]+|[A-Z]:\\Users\\", re.I)


def scan(path, data):
    evidence.safe_path(path)
    evidence.require(not any(c in path for c in "!*?[]{}"))
    evidence.require(not DENIED_NAME.search(path))
    # shortcut: known plaintext/UTF-16 markers only, add independent review before disclosure.
    # Also recognize UTF-16 ASCII markers; do not print a match or its location.
    evidence.require(not DENIED_CONTENT.search(data.replace(b"\x00", b"")))
    evidence.require(not PRIVATE_PATH.search(data.replace(b"\x00", b"")))


def check(root, tooling_sha=None):
    root = evidence.no_symlink_parents(root)
    expected = {"diff-x64.json", "diff-arm64.json", "provenance.json"}
    provenance = evidence.load((root / "provenance.json").read_bytes())
    evidence.require(set(provenance) == {"app", "tooling"})
    evidence.require(provenance["app"] == "25a967bbefce93ff2e5dd17623cd10568b9dea76")
    evidence.require(isinstance(provenance["tooling"], str)
                     and re.fullmatch(r"[a-f0-9]{40}", provenance["tooling"]))
    if tooling_sha is not None:
        evidence.require(provenance["tooling"] == tooling_sha)
    for stage in ("unsigned-before", "signed-rebuild"):
        for arch in ("x64", "arm64"):
            prefix = stage + "/" + arch + "/"
            directory = root / stage / arch
            manifest, header = evidence.inspect(directory / "app.asar")
            evidence.require(manifest == evidence.load((directory / "manifest.json").read_bytes()))
            evidence.require(header == (directory / "header.bin").read_bytes())
            expected.update(prefix + name for name in ("app.asar", "header.bin", "manifest.json"))
            for name in manifest["entries"]:
                scan(name, b"")
            for name, entry in manifest["unpackedEntries"].items():
                scan(name, b"")
                # Retain links locally, but never hand uploader a dereferenceable link.
                evidence.require(entry["kind"] != "link")
                if entry["kind"] == "file":
                    expected.add(prefix + "app.asar.unpacked/" + name)
    actual = set()
    for path in root.rglob("*"):
        evidence.require(not path.is_symlink())
        name = path.relative_to(root).as_posix()
        scan(name, b"")
        if path.is_file():
            actual.add(name)
            scan(name, path.read_bytes())
        else:
            evidence.require(path.is_dir())
            evidence.require(any(item.startswith(name + "/") for item in expected))
    evidence.require(actual == expected)
    for arch in ("x64", "arm64"):
        left, right = [evidence.load((root / stage / arch / "manifest.json").read_bytes())
                       for stage in ("unsigned-before", "signed-rebuild")]
        evidence.require(evidence.load((root / ("diff-" + arch + ".json")).read_bytes())
                         == evidence.compare(left, right))
    return sorted(expected)


if __name__ == "__main__":
    try:
        evidence.require(len(sys.argv) in (2, 4))
        root = Path(sys.argv[1])
        paths = check(root, sys.argv[2] if len(sys.argv) == 4 else None)
        if len(sys.argv) == 4:
            evidence.require(root.as_posix() == "evidence/payload")
            with open(sys.argv[3], "a", encoding="utf-8") as output:
                output.write("paths<<VALIDATED_EVIDENCE_PATHS\n")
                output.writelines(root.as_posix() + "/" + name + "\n" for name in paths)
                output.write("VALIDATED_EVIDENCE_PATHS\n")
    except Exception:
        sys.exit("Evidence disclosure preflight rejected")
    print("Evidence disclosure preflight passed; no upload performed")
