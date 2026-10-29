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


class ReportTests(unittest.TestCase):
    setUp = fixtures.EvidenceTests.setUp
    bundle_fixture = fixtures.EvidenceTests.bundle_fixture
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
