"""Synthetic mutation controls; optional macOS ad-hoc test uses no identity/secrets."""
import importlib.util
from pathlib import Path
import shutil
import struct
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


def linkedit_pair(cpu, old_vm=None):
    """Unsigned, signed and signature-removed bytes with retained signed VM allocation."""
    before = bytearray(4608)
    vm = (4096 if cpu == 0x1000007 else 16384) if old_vm is None else old_vm
    struct.pack_into("<8I", before, 0, 0xfeedfacf, cpu, 3 if cpu == 0x1000007 else 0,
                     6, 3, 248, 0, 0)
    struct.pack_into("<II16sQQQQIIII", before, 32, 0x19, 152, b"__TEXT",
                     0, 4096, 0, 512, 7, 5, 1, 0)
    struct.pack_into("<16s16sQQIIIIIIII", before, 104, b"__text", b"__TEXT",
                     320, 32, 320, 0, 0, 0, 0x80000400, 0, 0, 0)
    struct.pack_into("<II16sQQQQIIII", before, 184, 0x19, 72, b"__LINKEDIT",
                     4096, vm, 512, 4096, 7, 1, 0, 0)
    struct.pack_into("<II16s", before, 256, 0x1b, 24, b"u" * 16)
    removed = bytearray(before)
    struct.pack_into("<Q", removed, 216, 32768)
    signed = bytearray(removed + b"s" * 12416)
    struct.pack_into("<II", signed, 16, 4, 264)
    struct.pack_into("<Q", signed, 232, 16512)
    struct.pack_into("<IIII", signed, 280, 0x1d, 16, 4608, 12416)
    return before, signed, removed


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

    def compare_linkedit(self, before, signed, removed):
        left, right = self.left / "native", self.right / "native"
        left.write_bytes(before)
        right.write_bytes(signed)
        def remove_signature(*args):
            self.assertEqual(args[0], "--remove-signature")
            self.assertEqual(Path(args[1]).read_bytes(), signed)
            Path(args[1]).write_bytes(removed)
        with patch.object(gate, "identity"), patch.object(gate, "codesign", side_effect=remove_signature) as remove:
            gate.native_equal(left, right)
            self.assertEqual(remove.call_count, 1)

    def test_linkedit_vm_only_rounding_x64_and_arm64(self):
        for cpu, old_vm in ((0x1000007, 4096), (0x1000007, 16384), (0x100000c, 16384)):
            with self.subTest(cpu=cpu, old_vm=old_vm):
                self.compare_linkedit(*linkedit_pair(cpu, old_vm))

    def test_linkedit_invalid_vm_original_eof_and_sizes_block(self):
        for cpu in (0x1000007, 0x100000c):
            # Mutate original geometry as well as removal output where appropriate.
            for side, offset, value in ((0, 216, 8192), (1, 216, 24576),
                                        (1, 216, 65536),
                                        (0, 232, 4095), (1, 232, 16511),
                                        (0, 224, 511), (1, 224, 511)):
                with self.subTest(cpu=cpu, side=side, offset=offset):
                    parts = list(linkedit_pair(cpu))
                    struct.pack_into("<Q", parts[side], offset, value)
                    if side == 1 and offset != 232:
                        struct.pack_into("<Q", parts[2], offset, value)
                    with self.assertRaises(ValueError):
                        self.compare_linkedit(*parts)
            before, signed, removed = linkedit_pair(cpu)
            struct.pack_into("<Q", signed, 216, 65536)
            with self.assertRaises(ValueError):
                self.compare_linkedit(before, signed, removed)
        with self.assertRaises(ValueError):
            self.compare_linkedit(*linkedit_pair(0x100000c, 4096))

    def test_linkedit_rounding_does_not_hide_other_bytes(self):
        for cpu in (0x1000007, 0x100000c):
            # Section, unknown padding, UUID, segment load command, section header,
            # and normalized LINKEDIT fileoff/filesize all remain byte-exact.
            for offset in (320, 400, 264, 40, 104, 224, 232):
                with self.subTest(cpu=cpu, offset=offset):
                    before, signed, removed = linkedit_pair(cpu)
                    signed[offset] ^= 1
                    removed[offset] ^= 1
                    with self.assertRaises(ValueError):
                        self.compare_linkedit(before, signed, removed)

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
