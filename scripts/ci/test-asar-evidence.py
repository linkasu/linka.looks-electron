"""Synthetic fixtures only: no build, signing, credentials or network."""
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("check_asar_evidence", HERE / "check-asar-evidence.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
evidence = check.evidence


def archive(path, content=b"hello", name="index.js", extra=None):
    files = {name: {"size": len(content), "offset": "0"},
             "native.node": {"size": 3, "unpacked": True},
             "alias": {"link": name}}
    files.update(extra or {})
    encoded = json.dumps({"files": files}).encode()
    payload = struct.pack("<I", len(encoded)) + encoded
    payload += b"\0" * (-len(payload) % 4)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(struct.pack("<III", 4, len(payload) + 4, len(payload)) + payload + content)
    unpacked = Path(str(path) + ".unpacked")
    unpacked.mkdir(exist_ok=True)
    (unpacked / "native.node").write_bytes(b"abc")


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.app, self.bundle = self.root / "app", self.root / "payload"
        for directory in ("mac", "mac-arm64"):
            archive(self.app / "dist" / directory / "LINKa. смотри.app/Contents/Resources/app.asar")

    def bundle_fixture(self):
        for stage in ("unsigned-before", "signed-rebuild"):
            evidence.capture(self.app, self.bundle, stage)
        evidence.diff(self.bundle)
        evidence.write_json(self.bundle / "provenance.json", {
            "app": "25a967bbefce93ff2e5dd17623cd10568b9dea76", "tooling": "845ff7172cc2283da3c22dfbbdd6022370500e12"})

    def test_lossless_complete_bundle_and_diff_zero(self):
        self.bundle_fixture()
        allowlist = check.check(self.bundle)
        self.assertEqual(len(allowlist), 19)
        source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar"
        saved = self.bundle / "unsigned-before/x64/app.asar"
        self.assertEqual(source.read_bytes(), saved.read_bytes())
        self.assertEqual(evidence.inspect(source), evidence.inspect(saved))
        result = evidence.load((self.bundle / "diff-x64.json").read_bytes())
        self.assertTrue(result["sameArchive"] and result["sameHeader"])
        self.assertEqual(result["entries"], [])
        self.assertEqual(result["unpackedEntries"], [])

    def test_unpacked_native_change_kept_even_with_unchanged_raw_asar(self):
        evidence.capture(self.app, self.bundle, "unsigned-before")
        source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar.unpacked/native.node"
        source.write_bytes(b"signed native bytes")
        evidence.capture(self.app, self.bundle, "signed-rebuild")
        evidence.diff(self.bundle)
        diff = evidence.load((self.bundle / "diff-x64.json").read_bytes())
        self.assertTrue(diff["sameArchive"])
        self.assertEqual(diff["entries"][0]["path"], "native.node")
        self.assertFalse(diff["entries"][0]["after"]["sizeMatchesMetadata"])
        self.assertEqual(diff["unpackedEntries"][0]["path"], "native.node")

    def test_header_and_packed_changes_not_normalized(self):
        source = self.root / "single.asar"
        archive(source)
        before, _ = evidence.inspect(source)
        archive(source, b"other", extra={"signature": {"size": 0, "offset": "5"}})
        after, _ = evidence.inspect(source)
        diff = evidence.compare(before, after)
        self.assertFalse(diff["sameArchive"])
        self.assertFalse(diff["sameHeader"])
        self.assertEqual({x["path"] for x in diff["entries"]}, {"index.js", "signature"})

    def test_path_escape_and_malformed_archives_rejected(self):
        source = self.root / "bad.asar"
        for name in ("../escape", "/escape", "a/../../escape", "a\\escape", "C:escape", "a\nsecret"):
            with self.subTest(case="unsafe-path"):
                archive(source, name=name)
                with self.assertRaises(ValueError):
                    evidence.inspect(source)
        archive(source)
        source.write_bytes(source.read_bytes()[:-1])
        with self.assertRaises(ValueError):
            evidence.inspect(source)
        source.write_bytes(b"not an archive")
        with self.assertRaises(ValueError):
            evidence.inspect(source)
        with self.assertRaises(ValueError):
            evidence.load('{"files":{},"files":{}}')

    def test_links_retained_but_escape_and_external_preflight_rejected(self):
        source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar.unpacked"
        (source / "local-link").symlink_to("native.node")
        evidence.capture(self.app, self.bundle, "unsigned-before")
        saved = self.bundle / "unsigned-before/x64/app.asar.unpacked/local-link"
        self.assertTrue(saved.is_symlink())
        (source / "escape").symlink_to(self.root / "outside")
        with self.assertRaises(ValueError):
            evidence.capture(self.app, self.bundle, "signed-rebuild")
        self.assertFalse((self.bundle / "signed-rebuild").exists())

    def test_snapshot_no_overwrite_and_missing_arch_is_failure(self):
        evidence.capture(self.app, self.bundle, "unsigned-before")
        with self.assertRaises(ValueError):
            evidence.capture(self.app, self.bundle, "unsigned-before")
        source = self.app / "dist/mac-arm64/LINKa. смотри.app/Contents/Resources/app.asar"
        source.unlink()
        with self.assertRaises(ValueError):
            evidence.capture(self.app, self.bundle, "signed-rebuild")
        self.assertFalse((self.bundle / "signed-rebuild").exists())

    def test_secret_and_certificate_values_never_printed(self):
        fake = b"ghp_" + b"SYNTHETICNOTAREALKEY" * 3
        for secret in (fake, b"-----BEGIN PRIVATE KEY-----\n" + fake,
                       b"-----BEGIN CERTIFICATE-----\n" + fake,
                       b"CSC_KEY_PASSWORD=" + fake, b"CLIENT_SECRET='" + fake + b"'",
                       (b"-----BEGIN PRIVATE KEY-----".decode().encode("utf-16-le"))):
            with self.subTest(case="synthetic-secret"):
                source = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar"
                archive(source, secret)
                target = self.root / ("reject-" + str(len(list(self.root.glob('reject-*')))))
                old = self.bundle
                self.bundle = target
                self.bundle_fixture()
                result = subprocess.run([sys.executable, str(HERE / "check-asar-evidence.py"), str(target)],
                                        capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, b"")
                self.assertEqual(result.stderr, b"Evidence disclosure preflight rejected\n")
                self.bundle = old

    def test_known_package_runtime_names_still_scan_content(self):
        paths = (
            "node_modules/@vue/devtools-api/lib/cjs/env.js",
            "node_modules/@vue/devtools-api/lib/esm/env.js",
            "node_modules/axios/lib/env",
            "node_modules/axios/lib/env/README.md",
            "node_modules/axios/lib/env/classes",
            "node_modules/axios/lib/env/classes/FormData.js",
            "node_modules/axios/lib/env/data.js",
            "node_modules/debug",
            "node_modules/debug/LICENSE",
            "node_modules/debug/package.json",
            "node_modules/debug/src",
            "node_modules/debug/src/browser.js",
            "node_modules/debug/src/common.js",
            "node_modules/debug/src/index.js",
            "node_modules/debug/src/node.js",
            "node_modules/follow-redirects/debug.js",
            "node_modules/nopt/lib/debug.js",
            "node_modules/semver/internal/debug.js"
        )
        for path in paths:
            with self.subTest(case="known-runtime-name"):
                check.scan(path, b"module.exports = {};")
                for data in (b"PASSWORD='synthetic-secret'", b"/Users/synthetic/private",
                             b"-----BEGIN PRIVATE KEY-----"):
                    with self.assertRaises(ValueError):
                        check.scan(path, data)
        for path in ("node_modules/debug/.env", "node_modules/debug/src/builder-debug.js",
                     "node_modules/debug/credentials.json", "node_modules/other/debug.js",
                     "node_modules/debug/src/unknown.js"):
            with self.assertRaises(ValueError):
                check.scan(path, b"")

    def test_observed_password_reference_is_not_a_literal_secret(self):
        check.scan("index.js", b"const password = configAuth.password || '';")
        for data in (b"password = 'configAuth.password'", b"password = configAuth.passwordSECRET",
                     b"password = synthetic-secret", b"password = configAuth.password;",
                     b"password = configAuth.password\nPASSWORD='synthetic-secret'",
                     b"password = configAuth.password\nGITHUB_TOKEN='synthetic-token'",
                     b"password = configAuth.password\n-----BEGIN PRIVATE KEY-----",
                     b"password = configAuth.password\n/Users/synthetic/private"):
            with self.assertRaises(ValueError):
                check.scan("index.js", data)

    def test_deny_names_extras_symlinks_and_tampered_manifest(self):
        self.bundle_fixture()
        for name in (".env", "env.txt", "cert.p12", "cert.pem", "login.keychain-db", "builder-debug.yml", "debug.txt"):
            path = self.bundle / name
            path.write_bytes(b"synthetic")
            with self.assertRaises(ValueError):
                check.check(self.bundle)
            path.unlink()
            with self.assertRaises(ValueError):
                check.scan("node_modules/nested/" + name, b"")
        extra = self.bundle / "extra.txt"
        extra.write_bytes(b"not on allowlist")
        with self.assertRaises(ValueError):
            check.check(self.bundle)
        extra.unlink()
        extra.symlink_to("provenance.json")
        with self.assertRaises(ValueError):
            check.check(self.bundle)
        extra.unlink()
        manifest = self.bundle / "unsigned-before/x64/manifest.json"
        manifest.write_text("{}")
        with self.assertRaises(ValueError):
            check.check(self.bundle)

    def test_secrets_in_native_bytes_and_unknown_provenance_rejected(self):
        native = self.app / "dist/mac/LINKa. смотри.app/Contents/Resources/app.asar.unpacked/native.node"
        native.write_bytes(b"native\0-----BEGIN PRIVATE KEY-----\0synthetic")
        self.bundle_fixture()
        with self.assertRaises(ValueError):
            check.check(self.bundle)
        evidence.write_json(self.bundle / "provenance.json", {
            "app": "25a967bbefce93ff2e5dd17623cd10568b9dea76", "tooling": "8" * 40,
            "environment": "must not be accepted"})
        with self.assertRaises(ValueError):
            check.check(self.bundle)

    def test_symlink_bundle_root_and_dist_destination_rejected(self):
        alias = self.root / "alias"
        self.bundle.mkdir()
        alias.symlink_to(self.bundle, target_is_directory=True)
        with self.assertRaises(ValueError):
            evidence.capture(self.app, alias, "unsigned-before")
        with self.assertRaises(ValueError):
            evidence.capture(self.app, self.app / "dist/evidence", "unsigned-before")

    def test_exact_upload_paths_and_provenance(self):
        self.bundle_fixture()
        sha = "845ff7172cc2283da3c22dfbbdd6022370500e12"
        with self.assertRaises(ValueError):
            check.check(self.bundle, "0" * 40)
        output = self.root / "outputs"
        result = subprocess.run([sys.executable, str(HERE / "check-asar-evidence.py"),
                                 "evidence/payload", sha, str(output)], cwd=self.root,
                                capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())
        (self.root / "evidence").mkdir()
        self.bundle.rename(self.root / "evidence/payload")
        self.bundle = self.root / "evidence/payload"
        result = subprocess.run([sys.executable, str(HERE / "check-asar-evidence.py"),
                                 "evidence/payload", sha, str(output)], cwd=self.root,
                                capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(output.read_text().splitlines()[1:-1],
                         ["evidence/payload/" + name for name in check.check(self.bundle, sha)])

    def test_globs_and_private_paths_rejected(self):
        for name in ("a*.node", "a?.node", "[a].node", "!exclude", "{a,b}"):
            with self.assertRaises(ValueError):
                check.scan(name, b"")
        for data in (b"/Users/synthetic/private", b"/home/synthetic/private",
                     b"C:\\Users\\synthetic\\private"):
            with self.assertRaises(ValueError):
                check.scan("native.node", data)

    def test_workflow_strict_gate_order_and_guarded_uploader(self):
        workflow = (HERE.parent.parent / ".github/workflows/macos-330-signing-recovery.yml").read_text()
        gate = "shasum -a 256 -c evidence/app-asar-before.sha256"
        self.assertEqual(workflow.count(gate), 1)
        self.assertLess(workflow.index("capture app evidence/payload unsigned-before"), workflow.index("Build signed and notarized"))
        self.assertLess(workflow.index("capture app evidence/payload signed-rebuild"), workflow.index(gate))
        self.assertNotIn("continue-on-error", workflow)
        self.assertEqual(workflow.count("uses: actions/upload-artifact@v4"), 2)
        self.assertIn("if: always() && steps.disclosure.outcome == 'success'", workflow)
        self.assertIn('check-asar-evidence.py evidence/payload "$GITHUB_SHA" "$GITHUB_OUTPUT"', workflow)
        self.assertIn("path: ${{ steps.disclosure.outputs.paths }}", workflow)
        self.assertEqual(workflow.count("retention-days: 3"), 2)
        self.assertIn("if: success()", workflow)
        self.assertNotIn("            evidence/", workflow)
        upload = workflow[workflow.index("      - name: Fail-closed evidence disclosure"):]
        self.assertNotIn("app/dist/*", upload)
        self.assertIn("APP_SHA: 25a967bbefce93ff2e5dd17623cd10568b9dea76", workflow)


if __name__ == "__main__":
    unittest.main()
