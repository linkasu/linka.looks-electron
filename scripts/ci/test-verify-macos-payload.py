"""Synthetic mutation controls; optional macOS ad-hoc test uses no identity/secrets."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


gate = module("verify-macos-payload")
fixtures = module("test-report-asar-evidence")


class PayloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.left, self.right = self.root / "left", self.root / "right"
        for path in (self.left, self.right):
            path.mkdir()
            (path / "native").write_bytes(fixtures.fat([fixtures.native(), fixtures.arm_native()]))

    def test_sections_unknown_bytes_uuid_load_commands_and_cpu_changes_block(self):
        for offset in (4096 + 260, 4096 + 300, 4096 + 200, 4096 + 40, 8192 + 260, 8):
            original = (self.left / "native").read_bytes()
            changed = bytearray(original)
            changed[offset] ^= 1
            (self.right / "native").write_bytes(changed)
            with patch.object(gate, "identity"), patch.object(gate, "codesign"):
                with self.assertRaises(ValueError):
                    gate.native_equal(self.left / "native", self.right / "native")

    def test_unsupported_even_when_unchanged_is_blocking(self):
        for path in (self.left, self.right):
            (path / "native").write_bytes(b"\xcf\xfa\xed\xfe" + bytes(100))
        with self.assertRaises(ValueError):
            gate.native_equal(self.left / "native", self.right / "native")

    def test_identity_is_not_inferred_from_after_sign(self):
        valid = b"Authority=Developer ID Application: Synthetic (29HEQ626X2)\nTeamIdentifier=29HEQ626X2\n"
        for detail in (b"", b"Signature=adhoc\n", valid.replace(b"29HEQ626X2", b"OTHERTEAM0")):
            with patch.object(gate, "codesign", return_value=detail):
                with self.assertRaises(ValueError):
                    gate.identity(self.right)
        with patch.object(gate, "codesign", return_value=valid):
            gate.identity(self.right)

    def test_resource_and_zip_comparison_rejects_additions_modes_and_js(self):
        for path in (self.left, self.right):
            resource = path / "Contents/Resources"
            resource.mkdir(parents=True)
            (resource / "app.asar").write_bytes(b"raw ASAR")
        gate.resources(self.left, self.right)
        target = self.right / "Contents/Resources/app.asar"
        for change in (lambda: target.write_bytes(b"header mutation"), lambda: target.chmod(0o700)):
            change()
            with self.assertRaises(ValueError):
                gate.resources(self.left, self.right, signing=True)
            target.write_bytes(b"raw ASAR")
            target.chmod(0o644)
        target.with_name("extra.js").write_bytes(b"extra")
        with self.assertRaises(ValueError):
            gate.resources(self.left, self.right)

    @unittest.skipUnless(sys.platform == "darwin" and shutil.which("clang"), "macOS clang required")
    def test_local_thin_and_universal_signature_removal_preserves_every_other_byte(self):
        source = self.root / "fixture.c"
        source.write_text("int fixture(void) { return 42; }\n")
        parts = []
        for arch in ("x86_64", "arm64"):
            output = self.root / (arch + ".dylib")
            subprocess.run(["clang", "-arch", arch, "-dynamiclib", str(source), "-o", str(output)],
                           check=True, capture_output=True)
            parts.append(output)
        universal = self.root / "universal.dylib"
        subprocess.run(["lipo", "-create", *map(str, parts), "-output", str(universal)],
                       check=True, capture_output=True)
        for source in (*parts, universal):
            before, after = self.left / "native", self.right / "native"
            shutil.copy2(source, before)
            shutil.copy2(source, after)
            gate.codesign("--force", "--sign", "-", after)
            # Only identity is mocked: ad-hoc is NEVER accepted by the production gate.
            with patch.object(gate, "identity"):
                gate.native_equal(before, after)


if __name__ == "__main__":
    unittest.main()
