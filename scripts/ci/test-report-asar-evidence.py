"""Report privacy, full byte coverage and fail-closed negative controls."""
import copy
import importlib.util
import json
from pathlib import Path
import random
import struct
import subprocess
import sys
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


report = module("report-asar-evidence")
fixtures = module("test-asar-evidence")
SHA = "845ff7172cc2283da3c22dfbbdd6022370500e12"


def native():
    data = bytearray(512)
    struct.pack_into("<8I", data, 0, 0xfeedfacf, 0x1000007, 3, 8, 3, 192, 0, 0)
    struct.pack_into("<II16sQQQQIIII", data, 32, 0x19, 152, b"__TEXT", 0, 512, 0, 512, 7, 5, 1, 0)
    struct.pack_into("<16s16sQQIIIIIIII", data, 104, b"__text", b"__TEXT", 256, 32, 256,
                     0, 0, 0, 0x80000400, 0, 0, 0)
    struct.pack_into("<II16s", data, 184, 0x1b, 24, b"u" * 16)
    struct.pack_into("<IIII", data, 208, 0x1d, 16, 384, 128)
    return bytes(data)


def fat(parts, wide=False, endian=">"):
    width = 32 if wide else 20
    result = bytearray(4096 * (len(parts) + 1))
    struct.pack_into(endian + "II", result, 0, 0xcafebabf if wide else 0xcafebabe, len(parts))
    for index, part in enumerate(parts):
        cpu, subtype = struct.unpack_from("<II", part, 4)
        offset = 4096 * (index + 1)
        values = (cpu, subtype, offset, len(part), 12)
        struct.pack_into(endian + ("IIQQII" if wide else "IIIII"), result,
                         8 + index * width, *(values + (0,) if wide else values))
        result[offset:offset + len(part)] = part
    return bytes(result)


def arm_native():
    result = bytearray(native())
    struct.pack_into("<II", result, 4, 0x100000c, 0)
    return bytes(result)


class ReportTests(unittest.TestCase):
    setUp = fixtures.EvidenceTests.setUp
    bundle_fixture = fixtures.EvidenceTests.bundle_fixture
    def test_fat_slices_match_by_architecture_not_container_order(self):
        for wide in (False, True):
            for endian in ("<", ">"):
                result = report.native_diff(fat([native(), arm_native()], wide, endian),
                                            fat([arm_native(), native()], wide, endian))
                self.assertTrue(result["supported"])
                self.assertEqual(result["before"]["sliceCount"], 2)
                self.assertEqual(len(result["sliceComparisons"]), 2)
                self.assertTrue(all(s["codeHashEqual"] for s in result["sliceComparisons"]))
                self.assertTrue(all(s["sectionsHashEqual"] for s in result["sliceComparisons"]))
                result.update(beforeBytes=12288, afterBytes=12288)
                report.validate_native(result)

    def test_fat_malformed_and_architecture_controls(self):
        cases = []
        for offset, value in ((4, 1000), (16, 0), (20, 0xffffffff), (8, 0x100000c),
                              (36, 4096), (24, 32)):
            data = bytearray(fat([native(), arm_native()]))
            struct.pack_into(">I", data, offset, value)
            cases.append(bytes(data))
        cases += [fat([native(), native()]), fat([native()])[:100], b"\xca\xfe\xba\xbe"]
        for data in cases:
            result = report.native_diff(data, native())
            self.assertFalse(result["supported"])
            self.assertEqual(result["before"]["unsupportedReason"], "malformed_layout")
        result = report.native_diff(native(), arm_native())
        self.assertFalse(result["supported"])
        self.assertEqual(result["unsupportedReason"], "architecture_mismatch")
        changed_subtype = bytearray(native())
        struct.pack_into("<I", changed_subtype, 8, 4)
        self.assertEqual(report.native_diff(native(), changed_subtype)["unsupportedReason"],
                         "architecture_mismatch")

    def test_unsupported_command_keeps_safe_slice_identity(self):
        data = bytearray(native())
        struct.pack_into("<I", data, 208, 0x7777)
        result = report.native_diff(data, native())
        self.assertEqual(result["before"]["unsupportedReason"], "unsupported_load_command")
        self.assertEqual(result["before"]["slices"][0]["cpuType"], 0x1000007)

    def test_fat_changed_code_signature_and_missing_arch_are_not_ignored(self):
        modified = bytearray(arm_native())
        modified[260] ^= 1
        modified[400] ^= 1
        result = report.native_diff(fat([native(), arm_native()]), fat([native(), modified]))
        self.assertTrue(result["sliceComparisons"][0]["codeHashEqual"])
        self.assertFalse(result["sliceComparisons"][1]["codeHashEqual"])
        self.assertFalse(result["sliceComparisons"][1]["sectionsHashEqual"])
        self.assertFalse(result["sliceComparisons"][1]["signatureHashEqual"])
        result = report.native_diff(fat([native(), arm_native()]), native())
        self.assertFalse(result["supported"])
        self.assertEqual(result["unsupportedReason"], "architecture_mismatch")
        self.assertEqual(len(result["sliceComparisons"]), 1)
        self.assertEqual(result["coverage"]["unknown"], result["changedBytes"])

    def test_n_oso_metadata_is_separate_and_never_emitted(self):
        data = bytearray(native())
        struct.pack_into("<I", data, 16, 4)
        struct.pack_into("<I", data, 20, 216)
        struct.pack_into("<6I", data, 224, 2, 24, 288, 1, 304, 48)
        struct.pack_into("<IBBHQ", data, 288, 0, 0x66, 0, 0, 1)
        data[304:352] = b"/Users/private/source.o\0".ljust(48, b"\0")
        other = bytearray(data)
        other[311] ^= 1
        result = report.native_diff(bytes(data), bytes(other))
        self.assertTrue(result["supported"])
        value = result["sliceComparisons"][0]
        self.assertFalse(value["nOsoHashEqual"])
        self.assertEqual(value["nOsoBeforeCount"], 1)
        self.assertTrue(value["codeHashEqual"])
        self.assertNotIn("private", json.dumps(result))
        struct.pack_into("<I", other, 288, 1000)
        self.assertEqual(report.native_diff(data, other)["unsupportedReason"], "malformed_layout")

    def test_unknown_file_backed_section_is_hashed_without_reclassifying_coverage(self):
        before = bytearray(native())
        struct.pack_into("<I", before, 168, 0)
        after = bytearray(before)
        after[260] ^= 1
        result = report.native_diff(before, after)
        self.assertTrue(result["supported"])
        self.assertEqual(result["coverage"]["unknown"], 1)
        self.assertTrue(result["sliceComparisons"][0]["codeHashEqual"])
        self.assertFalse(result["sliceComparisons"][0]["sectionsHashEqual"])

    def test_native_schema_rejects_contradictory_supported_layouts(self):
        for left, right in ((native(), native()), (native(), arm_native())):
            original = report.native_diff(left, right)
            original.update(beforeBytes=len(left), afterBytes=len(right))
            report.validate_native(original)
            for side in ("before", "after"):
                for field, value in (("magicKind", "unknown"), ("magicKind", "missing"),
                                     ("magicKind", "thin64be"), ("magicKind", "fat32be"),
                                     ("unsupportedReason", "unsupported_cpu")):
                    result = copy.deepcopy(original)
                    result[side][field] = value
                    with self.subTest(side=side, field=field, value=value):
                        with self.assertRaises(ValueError):
                            report.validate_native(result)
                for field, value in (("magicKind", "thin32le"), ("cpuType", 7),
                                     ("offset", 1), ("size", 511), ("size", 12)):
                    result = copy.deepcopy(original)
                    result[side]["slices"][0][field] = value
                    with self.subTest(side=side, field=field, value=value):
                        with self.assertRaises(ValueError):
                            report.validate_native(result)
            result = copy.deepcopy(original)
            for side in ("before", "after"):
                result[side].update(magicKind="unknown", slices=[], sliceCount=0)
            result["sliceComparisons"] = []
            with self.assertRaises(ValueError):
                report.validate_native(result)

        original = report.native_diff(native(), native())
        original.update(beforeBytes=512, afterBytes=512)
        for magic, cpu in (("thin64le", 7), ("thin32le", 0x1000007)):
            result = copy.deepcopy(original)
            for side in ("before", "after"):
                result[side]["magicKind"] = magic
                result[side]["slices"][0].update(magicKind=magic, cpuType=cpu)
            result["sliceComparisons"][0]["cpuType"] = cpu
            with self.subTest(magic=magic, cpu=cpu):
                with self.assertRaises(ValueError):
                    report.validate_native(result)

        original = report.native_diff(fat([native(), arm_native()]), fat([native(), arm_native()]))
        original.update(beforeBytes=12288, afterBytes=12288)
        for kind, offset in (("thin64le", 4096), ("fat32be", 8), ("fat64le", 40)):
            result = copy.deepcopy(original)
            result["before"]["magicKind"] = kind
            result["before"]["slices"][0]["offset"] = offset
            with self.subTest(kind=kind, offset=offset):
                with self.assertRaises(ValueError):
                    report.validate_native(result)

    def test_native_schema_preserves_generated_unsupported_layouts(self):
        unsupported_cpu = bytearray(native())
        struct.pack_into("<I", unsupported_cpu, 4, 7)
        unsupported_magic = bytearray(native())
        unsupported_magic[:4] = b"\xce\xfa\xed\xfe"
        unknown_command = bytearray(native())
        struct.pack_into("<I", unknown_command, 208, 0x7777)
        for data in (b"", b"invalid", native()[:8], fat([native()])[:100],
                     unsupported_cpu, unsupported_magic, unknown_command):
            for left, right in ((data, native()), (native(), data)):
                result = report.native_diff(left, right)
                result.update(beforeBytes=len(left), afterBytes=len(right))
                report.validate_native(result)
        for data in (b"", b"invalid"):
            original = report.native_diff(data, native())
            original.update(beforeBytes=len(data), afterBytes=len(native()))
            result = copy.deepcopy(original)
            result["before"]["unsupportedReason"] = "none"
            with self.assertRaises(ValueError):
                report.validate_native(result)

    def test_native_schema_rejects_nested_disclosure_and_invalid_geometry(self):
        original = report.native_diff(fat([native(), arm_native()]), fat([arm_native(), native()]))
        original.update(beforeBytes=12288, afterBytes=12288)
        report.validate_native(original)
        changes = [("before", "magicKind", "/Users/private"),
                   ("before", "unsupportedReason", "private failure"),
                   ("before", "sliceCount", True)]
        for side, field, value in changes:
            result = copy.deepcopy(original)
            result[side][field] = value
            with self.assertRaises(ValueError):
                report.validate_native(result)
        for field, value in (("offset", 12288), ("size", -1), ("cpuType", True),
                             ("path", "/Users/private")):
            result = copy.deepcopy(original)
            result["before"]["slices"][0][field] = value
            with self.assertRaises(ValueError):
                report.validate_native(result)
        result = copy.deepcopy(original)
        result["sliceComparisons"][0]["codeHashEqual"] = "private"
        with self.assertRaises(ValueError):
            report.validate_native(result)

    def test_fat_report_roundtrip_remains_blocking(self):
        source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar.unpacked/native.node"
        source.write_bytes(fat([native(), arm_native()]))
        report.evidence.capture(self.app, self.bundle, "unsigned-before")
        source.write_bytes(fat([arm_native(), native()]))
        report.evidence.capture(self.app, self.bundle, "signed-rebuild")
        report.evidence.write_json(self.bundle / "provenance.json", {"app": report.APP, "tooling": SHA})
        result = report.generate(self.bundle, SHA, "local-unsigned-pair")
        encoded = report.validate(result, SHA)
        self.assertEqual(json.loads(encoded)["schemaVersion"], 2)
        arch = result["architectures"]["x64"]
        self.assertTrue(arch["diagnosisBlocking"])
        self.assertFalse(arch["strictPayloadEqual"])
        self.assertTrue(arch["unpackedDifferences"][0]["supported"])
        self.assertGreater(arch["unpackedDifferences"][0]["coverage"]["unknown"], 0)
    def test_report_has_no_names_content_or_private_hashes(self):
        private = "private-owner-secret.js"
        token = b"ghp_" + b"FAKENEVERREAL" * 4
        source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar"
        fixtures.archive(source, token + b"/Users/private-owner/project", name=private)
        self.bundle_fixture()
        result = report.generate(self.bundle, SHA, "local-unsigned-pair")
        encoded = report.validate(result, SHA)
        self.assertTrue(all(value not in encoded for value in (
            private.encode(), token, b"private-owner", report.evidence.sha(token).encode())))
        self.assertTrue(result["architectures"]["x64"]["strictPayloadEqual"])

    def test_native_signing_is_separate_from_code_uuid_and_unknown(self):
        before = native()
        after = bytearray(before)
        for offset in (200, 260, 350, 400):
            after[offset] ^= 1
        result = report.native_diff(before, bytes(after))
        self.assertTrue(result["supported"])
        self.assertEqual(result["changedBytes"], 4)
        for category in ("uuid", "section_code", "unknown", "signature"):
            self.assertEqual(result["coverage"][category], 1)
        self.assertEqual(sum(result["coverage"].values()), 4)

    def test_signing_load_command_and_added_signature_tail_are_counted(self):
        before = native()
        after = bytearray(before + b"s" * 8)
        struct.pack_into("<I", after, 220, 136)
        result = report.native_diff(before, bytes(after))
        self.assertTrue(result["supported"])
        self.assertEqual(result["coverage"]["signing_command"], 1)
        self.assertEqual(result["coverage"]["signature"], 8)
        self.assertEqual(result["changedBytes"], 9)

    def test_malformed_unsupported_overlap_and_unknown_command(self):
        cases = [b"", b"\xca\xfe\xba\xbe" + b"x" * 100, b"\x7fELF" + b"x" * 100]
        for position, value in ((212, 8), (216, 260), (208, 0x7777), (48, 0)):
            data = bytearray(native())
            struct.pack_into("<I", data, position, value)
            if position == 48:
                data = data[:100]
            cases.append(bytes(data))
        for data in cases:
            with self.subTest(case="unsupported-without-values"):
                result = report.native_diff(data, b"invalid")
                self.assertFalse(result["supported"])
                self.assertEqual(result["coverage"]["unknown"], result["changedBytes"])

    def test_byte_count_matches_naive_and_native_coverage(self):
        rng = random.Random(42)
        for _ in range(50):
            a = native()
            b = bytearray(a)
            for _ in range(30):
                b[rng.randrange(len(b))] = rng.randrange(256)
            b = bytes(b[:rng.randrange(300, 513)])
            expected = sum(x != y for x, y in zip(a, b)) + abs(len(a) - len(b))
            self.assertEqual(report.changed(a, b), expected)
            result = report.native_diff(a, b)
            self.assertEqual(sum(result["coverage"].values()), expected)
            result.update(beforeBytes=len(a), afterBytes=len(b))
            report.validate_native(result)
        a = b"x" * (1024 * 1024 + 10)
        self.assertEqual(report.changed(a, a[:-20]), 20)

    def test_schema_rejects_extra_strings_types_coverage_and_secret_fixtures(self):
        self.bundle_fixture()
        original = report.generate(self.bundle, SHA, "local-unsigned-pair")
        for value in ("/Users/fake/private", "ghp_" + "FAKENEVERREAL" * 4,
                      "-----BEGIN PRIVATE KEY-----", "C:\\Users\\fake\\project"):
            for field in ("extra", "app", "tooling", "provenance", "strictGate"):
                candidate = copy.deepcopy(original)
                candidate[field] = value
                with self.assertRaises(ValueError):
                    report.validate(candidate, SHA)
        for value in (True, -1, 1.5, "100", 2 ** 64):
            candidate = copy.deepcopy(original)
            candidate["architectures"]["x64"]["beforeBytes"] = value
            with self.assertRaises(ValueError):
                report.validate(candidate, SHA)

    def test_unpacked_extras_and_signing_changes_remain_blocking(self):
        source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar.unpacked"
        (source / "native.node").write_bytes(native())
        report.evidence.capture(self.app, self.bundle, "unsigned-before")
        after = bytearray(native())
        after[400] ^= 1
        (source / "native.node").write_bytes(after)
        (source / "private-extra").write_bytes(b"/Users/fake/secret")
        report.evidence.capture(self.app, self.bundle, "signed-rebuild")
        report.evidence.write_json(self.bundle / "provenance.json", {"app": report.APP, "tooling": SHA})
        result = report.generate(self.bundle, SHA, "local-unsigned-pair")
        arch = result["architectures"]["x64"]
        self.assertTrue(arch["diagnosisBlocking"])
        self.assertFalse(arch["strictPayloadEqual"])
        self.assertEqual(arch["archiveChangedBytes"], 0)
        self.assertEqual(len(arch["unpackedDifferences"]), 2)
        self.assertEqual(arch["unpackedDifferences"][0]["coverage"]["signature"], 1)
        self.assertNotIn(b"private-extra", report.validate(result, SHA))
        bad = copy.deepcopy(result)
        bad["architectures"]["x64"]["unpackedDifferences"][0]["coverage"]["signature"] = 0
        with self.assertRaises(ValueError):
            report.validate(bad, SHA)

    def test_bounds_and_symlinks_fail_closed(self):
        self.bundle_fixture()
        for limit in ("MAX_FILE", "MAX_TOTAL", "MAX_COUNT"):
            with patch.object(report, limit, 1):
                with self.assertRaises(ValueError):
                    report.generate(self.bundle, SHA, "local-unsigned-pair")
        (self.bundle / "extra").symlink_to("provenance.json")
        with self.assertRaises(ValueError):
            report.generate(self.bundle, SHA, "local-unsigned-pair")

    def test_cli_never_echoes_values_and_only_emits_fixed_report_path(self):
        self.bundle_fixture()
        command = [sys.executable, str(HERE / "report-asar-evidence.py")]
        result = subprocess.run(command + ["generate", str(self.bundle), SHA,
                                "evidence/report/diagnostic.json"], cwd=self.root, capture_output=True)
        self.assertEqual(result.returncode, 0)
        output = self.root / "outputs"
        validate = command + ["validate", "evidence/report/diagnostic.json", SHA, str(output)]
        result = subprocess.run(validate, cwd=self.root, capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(output.read_text(), "paths=evidence/report/diagnostic.json\n")
        output.unlink()
        path = self.root / "evidence/report/diagnostic.json"
        path.write_text(json.dumps({"/Users/fake/private": "ghp_" + "FAKENEVERREAL" * 4}))
        result = subprocess.run(validate, cwd=self.root, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(result.stderr, b"Sanitized ASAR report rejected\n")
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
