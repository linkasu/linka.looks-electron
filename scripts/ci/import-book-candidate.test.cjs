const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const sourceRoot = process.env.BOOK_SOURCE_ROOT;
const workflowPath =
  process.env.BOOK_CANDIDATES_WORKFLOW ||
  (sourceRoot && path.join(sourceRoot, ".github/workflows/model-candidates.yml"));
const {
  validateInputs,
  validateRelease,
  validateExecution,
  validateTransport,
  readTransport,
  downloadCandidate,
  verifier
} = require("./import-book-candidate.cjs");

const sha = "a".repeat(40);
const input = {
  repository: "linkasu/predictor",
  sourceSha: sha,
  releaseId: "123",
  archiveSha256: "b".repeat(64),
  archiveBytes: "200",
  appToolingSha: "c".repeat(40)
};
const now = Date.parse("2026-11-04T12:00:00Z");
function capability() {
  return {
    schema: "linka-book-candidate-read-capability-v1",
    release: structuredClone(release),
    download_url:
      "https://release-assets.githubusercontent.com/github-production-release-asset/789/abc-def?sp=r&sr=b&spr=https&se=2026-11-04T12%3A30%3A00Z&sig=SYNTHETIC_SIGNATURE"
  };
}
test("pure execution validator is the same backward-compatible export", () => {
  assert.equal(validateExecution, require("./book-execution-receipt.cjs").validateExecution);
});
test("one-asset operator capability requires exact private draft, repository, bounded read-only expiry and pins", () => {
  const transport = capability();
  assert.equal(validateTransport(transport, input, "789", now).asset.id, 456);
  assert.equal(
    validateTransport(
      { ...transport, release: { ...transport.release, prerelease: true } },
      input,
      "789",
      now
    ).asset.id,
    456
  );
  for (const mutate of [
    (t) => (t.extra = true),
    (t) => (t.schema = "unknown"),
    (t) => (t.release.draft = false),
    (t) => (t.release.target_commitish = "main"),
    (t) => (t.release.body = "unknown payload"),
    (t) => (t.release.assets[0].name = "other.zip"),
    (t) => t.release.assets[0].size++,
    (t) => (t.release.assets[0].extra = true),
    (t) => (t.download_url = "not a URL"),
    (t) =>
      (t.download_url = t.download_url.replace(
        "release-assets.githubusercontent.com",
        "evil.invalid"
      )),
    (t) => (t.download_url = t.download_url.replace("/789/", "/790/")),
    (t) => (t.download_url = t.download_url.replace("https://", "http://")),
    (t) => (t.download_url = t.download_url.replace("https://", "https://user:password@")),
    (t) => (t.download_url = t.download_url.replace(".com/", ".com:443/")),
    (t) => (t.download_url += "#fragment"),
    (t) => (t.download_url += "#"),
    (t) => (t.download_url += "&sp=r"),
    (t) => (t.download_url = t.download_url.replace("sp=r", "sp=rw")),
    (t) => (t.download_url = t.download_url.replace("sr=b", "sr=c")),
    (t) => (t.download_url = t.download_url.replace("spr=https", "spr=http")),
    (t) => (t.download_url = t.download_url.replace("12%3A30", "12%3A00")),
    (t) => (t.download_url = t.download_url.replace("12%3A30", "13%3A01")),
    (t) => (t.download_url = t.download_url.replace("2026-11-04T12%3A30%3A00Z", "never")),
    (t) => (t.download_url = t.download_url.replace("&sig=SYNTHETIC_SIGNATURE", ""))
  ]) {
    const invalid = capability();
    mutate(invalid);
    assert.throws(
      () => validateTransport(invalid, input, "789", now),
      /^Error: BOOK_TRANSPORT_INVALID$/
    );
  }
  assert.throws(() =>
    validateTransport(transport, { ...input, archiveSha256: undefined }, "789", now)
  );
  assert.throws(() => validateTransport(transport, input, undefined, now));
});
test("transport file is private, bounded and strict JSON with no duplicate keys", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-capability-synthetic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "book-candidate-transport.json");
  fs.writeFileSync(file, JSON.stringify(capability()), { mode: 0o600 });
  assert.deepEqual(readTransport(file, root), capability());
  for (const text of [
    "{",
    '{"schema":"first","schema":"second"}',
    '{"release":{"id":123,"id":456}}',
    "x".repeat(65001)
  ]) {
    fs.writeFileSync(file, text);
    assert.throws(() => readTransport(file, root), /^Error: BOOK_TRANSPORT_INVALID$/);
  }
  fs.chmodSync(file, 0o644);
  assert.throws(() => readTransport(file, root));
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(root, "missing"), file);
  assert.throws(() => readTransport(file, root));
  assert.throws(() => readTransport(path.join(root, "other.json"), root));
});
test("operator capability downloads only the selected URL anonymously without redirects, then checks SHA and size", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-capability-synthetic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "book-candidate-transport.json");
  const bytes = Buffer.alloc(200, 7);
  const i = { ...input, archiveSha256: createHash("sha256").update(bytes).digest("hex") };
  const cap = capability();
  const url = new URL(cap.download_url);
  url.searchParams.set(
    "se",
    new Date(Date.now() + 1800000).toISOString().replace(/\.\d{3}Z$/, "Z")
  );
  cap.download_url = url.href;
  fs.writeFileSync(file, JSON.stringify(cap), { mode: 0o600 });
  const options = {
    transportFile: file,
    repositoryId: "789",
    runnerTemp: root,
    token: "SYNTHETIC_NEVER_SENT"
  };
  let calls = 0,
    body = [bytes],
    ok = true;
  t.mock.method(globalThis, "fetch", async (target, init) => {
    calls++;
    assert.equal(target, cap.download_url);
    assert.equal(init.redirect, "error");
    assert.equal(init.headers, undefined);
    return { ok, status: ok ? 200 : 302, body };
  });
  const result = await downloadCandidate(i, options, path.join(root, "valid.zip"));
  assert.equal(result.release.id, 123);
  assert.equal(result.transport.independent_draft_api_read, false);
  assert.equal(result.transport.kind, "operator-granted-one-asset-read-capability");
  assert.doesNotMatch(JSON.stringify(result.transport), /SYNTHETIC_SIGNATURE|download_url|https:/);
  assert.equal(calls, 1);
  ok = false;
  await assert.rejects(downloadCandidate(i, options, path.join(root, "redirect.zip")));
  ok = true;
  body = [bytes.subarray(1)];
  await assert.rejects(downloadCandidate(i, options, path.join(root, "short.zip")));
  body = [bytes, Buffer.from("extra")];
  await assert.rejects(downloadCandidate(i, options, path.join(root, "oversize.zip")));
  body = [Buffer.alloc(200, 8)];
  await assert.rejects(downloadCandidate(i, options, path.join(root, "wrong-hash.zip")));
  const before = calls;
  await assert.rejects(
    downloadCandidate({ ...i, archiveSha256: undefined }, options, path.join(root, "unpinned.zip"))
  );
  assert.equal(calls, before);
});
test("default transport retains authenticated own-draft API lookup and fails closed on denied read", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url, "https://api.github.com/repos/linkasu/predictor/releases/123");
    assert.equal(options.headers.Authorization, "Bearer SYNTHETIC_TOKEN");
    assert.equal(options.redirect, "manual");
    return { ok: false, status: 404 };
  });
  await assert.rejects(
    downloadCandidate(input, { token: "SYNTHETIC_TOKEN" }, "unused.zip"),
    /draft release API failed/
  );
  assert.equal(calls, 1);
});
test(
  "workflow masks both secrets before file export, keeps one manifest input/read-only permissions and removes capability last",
  {
    skip:
      !workflowPath &&
      "set BOOK_CANDIDATES_WORKFLOW or BOOK_SOURCE_ROOT to an explicit predictor checkout"
  },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "book-gate-synthetic-"));
    const oldTemp = process.env.RUNNER_TEMP;
    const oldCapability = process.env.BOOK_READ_CAPABILITY;
    process.env.RUNNER_TEMP = root;
    t.after(() => {
      if (oldTemp === undefined) delete process.env.RUNNER_TEMP;
      else process.env.RUNNER_TEMP = oldTemp;
      if (oldCapability === undefined) delete process.env.BOOK_READ_CAPABILITY;
      else process.env.BOOK_READ_CAPABILITY = oldCapability;
      fs.rmSync(root, { recursive: true, force: true });
    });
    const workflow = require("yaml").parse(fs.readFileSync(workflowPath, "utf8"));
    assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["import_manifest"]);
    assert.deepEqual(workflow.permissions, { contents: "read", actions: "read" });
    const steps = workflow.jobs.candidates.steps;
    const capabilityStep = steps.find((step) => step.env?.BOOK_READ_CAPABILITY);
    assert.equal(
      capabilityStep.env.BOOK_READ_CAPABILITY,
      "${{ secrets.LINKA_BOOK_CANDIDATE_READ_CAPABILITY }}"
    );
    assert(
      !steps
        .filter((step) => step !== capabilityStep)
        .some((step) =>
          /BOOK_READ_CAPABILITY|LINKA_BOOK_CANDIDATE_READ_CAPABILITY/.test(
            JSON.stringify(step.env || {})
          )
        )
    );
    assert.match(capabilityStep.uses, /^actions\/github-script@/);
    assert.match(steps.at(-1).if, /always\(\)/);
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const gate = new AsyncFunction("context", "core", "require", capabilityStep.with.script);
    const cleanup = new AsyncFunction("require", steps.at(-1).with.script);
    const raw = JSON.stringify(capability());
    process.env.BOOK_READ_CAPABILITY = raw;
    const context = {
      eventName: "workflow_dispatch",
      ref: "refs/heads/main",
      repo: { owner: "linkasu", repo: "linka.predictor-rust" },
      payload: { inputs: { import_manifest: "provenance/synthetic-import.json" } }
    };
    assert.doesNotMatch(
      JSON.stringify(context.payload.inputs),
      /download_url|https:|SYNTHETIC_SIGNATURE/
    );
    const events = [];
    const core = {
      setSecret: (value) => events.push(["mask", value]),
      exportVariable: (name, value) => events.push(["env", name, value]),
      setFailed: (value) => events.push(["failed", value])
    };
    await gate(context, core, require);
    assert.deepEqual(events.slice(0, 2), [
      ["mask", raw],
      ["mask", capability().download_url]
    ]);
    assert.deepEqual(events[2], [
      "env",
      "BOOK_TRANSPORT_FILE",
      path.join(root, "book-candidate-transport.json")
    ]);
    assert.equal(fs.statSync(events[2][2]).mode & 0o777, 0o600);
    assert.deepEqual(readTransport(events[2][2], root), capability());
    await cleanup(require);
    assert(!fs.existsSync(events[2][2]));
    for (const patch of [
      { ref: "refs/heads/other" },
      { eventName: "push" },
      { repo: { owner: "other", repo: "repo" } }
    ]) {
      events.length = 0;
      await gate({ ...context, ...patch }, core, require);
      assert.equal(events[0][0], "mask");
      assert.equal(events[1][0], "mask");
      assert.equal(events[2][0], "failed");
      assert(!fs.existsSync(path.join(root, "book-candidate-transport.json")));
    }
    events.length = 0;
    process.env.BOOK_READ_CAPABILITY = "SYNTHETIC_INVALID_JSON";
    await gate(context, core, require);
    assert.deepEqual(events[0], ["mask", "SYNTHETIC_INVALID_JSON"]);
    assert.equal(events[1][0], "failed");
    assert.doesNotMatch(events[1][1], /SYNTHETIC_INVALID_JSON/);
    for (const secret of [undefined, "", "x".repeat(65001)]) {
      if (secret === undefined) delete process.env.BOOK_READ_CAPABILITY;
      else process.env.BOOK_READ_CAPABILITY = secret;
      events.length = 0;
      await gate(context, core, require);
      assert.equal(events.at(-1)[0], "failed");
      assert(!events.some(([kind]) => kind === "env"));
      assert(!fs.existsSync(path.join(root, "book-candidate-transport.json")));
    }
  }
);
test(
  "candidate and aggregate pipelines contain no Book compute; source checkout is independent of workflow SHA",
  { skip: !sourceRoot && "set BOOK_SOURCE_ROOT to an explicit predictor checkout" },
  () => {
    const source = sourceRoot;
    const yaml = require("yaml");
    const candidate = yaml.parse(
      fs.readFileSync(path.join(source, ".github/workflows/model-candidates.yml"), "utf8")
    );
    const steps = candidate.jobs.candidates.steps;
    const modelCheckout = steps.find((step) => step.with?.path === ".local/model-source");
    assert.equal(modelCheckout.with.ref, "${{ steps.manifest.outputs.model_source_sha }}");
    assert.equal(steps[0].with.ref, "${{ github.workflow_sha }}");
    const gate = steps.findIndex((step) => step.id === "manifest");
    assert(gate < steps.findIndex((step) => step.env?.BOOK_READ_CAPABILITY));
    assert.match(steps[gate].run, /readImportManifest/);
    assert.match(steps[gate].run, /m\.model_source_sha, 'origin\/main'/);
    assert.match(steps[gate].run, /m\.app_tooling_sha, 'origin\/main'/);
    assert(!steps.some((step) => step.env?.GH_TOKEN || step.env?.BOOK_RELEASE_ID));
    const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    assert.equal(upload.if, "success()");
    assert.equal(upload.with["retention-days"], 90);
    assert.equal(
      upload.with.name,
      "model-candidates-${{ github.run_id }}-${{ github.run_attempt }}"
    );
    const final = yaml.parse(
      fs.readFileSync(path.join(source, ".github/workflows/model-final.yml"), "utf8")
    );
    assert.deepEqual(final.on.workflow_dispatch.inputs.mode.options, [
      "import-dev",
      "import-final"
    ]);
    assert.deepEqual(final.permissions, { contents: "read", actions: "read" });
    for (const name of ["model-final", "windows-model-qualification", "windows-runtime"]) {
      const workflow = yaml.parse(
        fs.readFileSync(path.join(source, `.github/workflows/${name}.yml`), "utf8")
      );
      for (const job of Object.values(workflow.jobs))
        for (const step of job.steps || [])
          if (step.uses?.startsWith("actions/upload-artifact@"))
            assert.equal(step.with["retention-days"], 90, `${name} evidence retention`);
    }
    for (const workflow of [candidate, final]) {
      const commands = Object.values(workflow.jobs)
        .flatMap((job) => job.steps.map((step) => step.run || ""))
        .join("\n");
      assert.doesNotMatch(
        commands,
        /\bcargo\b|model_recipe\.py|systemd-run|predictor-evaluation-runner|--mode\s+train/
      );
    }
    const script = final.jobs.evaluate.steps[0].with.script;
    assert.match(script, /linka-book-ui-import-v1/);
    assert.doesNotMatch(script, /dev_jsonl|final_jsonl|linka-final-bundle-v1/);
    assert.match(script, /run\.status !== 'completed' \|\| run\.conclusion !== 'success'/);
  }
);
const execution = {
  schema: "linka-book-execution-v1",
  attempt: 1,
  kind: "book-local-linux-container",
  book_job_id: "d".repeat(32),
  host: "book.local",
  colima_profile: "linka-model-400",
  image_digest: `sha256:${"e".repeat(64)}`,
  source_sha: sha,
  limits: { memory_bytes: 6442450944, cpus: 2, tasks: 128 }
};
const receiptBytes = execFileSync("python3", [
  "-c",
  "import json,sys; r=json.loads(sys.argv[1]); r.pop('kind'); print(json.dumps(r,sort_keys=True,separators=(',',':'),ensure_ascii=True))",
  JSON.stringify(execution)
]);
execution.receipt_sha256 = createHash("sha256").update(receiptBytes).digest("hex");
const release = {
  id: 123,
  draft: true,
  tag_name: `book-candidate-${execution.book_job_id}`,
  target_commitish: sha,
  url: "https://api.github.com/repos/linkasu/predictor/releases/123",
  assets: [
    {
      id: 456,
      name: "book-candidates.zip",
      size: 200,
      state: "uploaded",
      url: "https://api.github.com/repos/linkasu/predictor/releases/assets/456"
    }
  ]
};
test("exact draft release and frozen book context", () => {
  validateInputs(input);
  assert.equal(validateRelease(release, input).id, 456);
  validateExecution(execution, sha, release.tag_name);
});
test("receipt hash matches canonical Python bytes regardless of recursive key order", () => {
  const reordered = Object.fromEntries(Object.entries(execution).reverse());
  reordered.limits = Object.fromEntries(Object.entries(execution.limits).reverse());
  validateExecution(reordered, sha, release.tag_name);
  for (const bytes of [
    receiptBytes.subarray(0, -1),
    Buffer.from(JSON.stringify(execution) + "\n")
  ]) {
    const receipt_sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.throws(() => validateExecution({ ...reordered, receipt_sha256 }, sha, release.tag_name));
  }
  for (const patch of [
    { receipt_sha256: "f".repeat(64) },
    { attempt: 2 },
    { image_digest: [execution.image_digest] },
    { receipt_sha256: [execution.receipt_sha256] }
  ]) {
    assert.throws(() => validateExecution({ ...execution, ...patch }, sha, release.tag_name));
  }
});
test(
  "synthetic ZIP and tracked approval integration with trusted canonical validator",
  { skip: !sourceRoot && "set BOOK_SOURCE_ROOT to an explicit predictor checkout" },
  () => {
    execFileSync(
      "python3",
      [
        "-c",
        String.raw`
import ast, copy, hashlib, importlib.util, json, os, pathlib, shutil, stat, struct, subprocess, sys, tempfile, zipfile
source, verifier = pathlib.Path(sys.argv[1]), sys.argv[2]
with tempfile.TemporaryDirectory(prefix='book-import-synthetic-') as temp:
    root = pathlib.Path(temp) / 'source'
    root.mkdir()
    os.chdir(root)
    tree = ast.parse((source / 'scripts/model_recipe.py').read_text())
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'preparation_code_hash')
    files = ast.literal_eval(function.body[0].value)
    for name in files + ['provenance/licenses/KenLM-LICENSE']:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, target)
    spec = importlib.util.spec_from_file_location('trusted', root / 'scripts/model_recipe.py')
    recipe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recipe)
    execution = {'schema':'linka-book-execution-v1', 'attempt':1,
        'kind':'book-local-linux-container', 'book_job_id':'d'*32, 'host':'book.local',
        'colima_profile':'linka-model-400', 'image_digest':'sha256:'+'e'*64, 'source_sha':'a'*40,
        'limits':{'memory_bytes':6442450944, 'cpus':2, 'tasks':128}}
    receipt = {k:v for k,v in execution.items() if k != 'kind'}
    execution['receipt_sha256'] = hashlib.sha256((json.dumps(receipt,sort_keys=True,
        separators=(',',':'),ensure_ascii=True)+'\n').encode('utf-8')).hexdigest()
    bundle = pathlib.Path(temp) / 'bundle'
    bundle.mkdir()
    def write(name, value): recipe.write_json(bundle / name, value)
    write('report.json', {'synthetic':True})
    write('U.dev.json', {'state':'NOT_RUN', 'reason':'book_defer_core_dev'})
    for name in ('frequencies.tsv', 'train.groups.tsv', 'dev.groups.tsv', 'attribution.jsonl.bz2', 'NOTICES.txt'):
        (bundle / name).write_bytes(b'FIRST_PARTY_SYNTHETIC_ONLY\n')
    shutil.copyfile(root / 'provenance/licenses/KenLM-LICENSE', bundle / 'KenLM-LICENSE')
    (bundle / 'U.lpk').write_bytes(b'SYNTHETIC_NOT_A_MODEL')
    write('U.receipt.json', {'state':'COMPLETED', 'code':0, 'child_reaped':True,
        'bytes':(bundle / 'U.lpk').stat().st_size, 'model_sha256':recipe.digest(bundle / 'U.lpk'), 'execution':execution})
    write('T.receipt.json', {'state':'FAILED', 'code':7, 'child_reaped':True, 'execution':execution})
    (root / 'exclusions.json').write_text('{}')
    exclusions_sha = recipe.digest(root / 'exclusions.json')
    code_sha = recipe.preparation_code_hash()
    write('source-manifest.json', {'source':{'sha256':'1'*64, 'evidence_sha256':'2'*64}})
    review = {'schema':'linka-model-review-v1', 'state':'COMPLETED', 'mode':'review',
        'source_sha256':'1'*64, 'exclusions_sha256':exclusions_sha, 'preparation_code_sha256':code_sha,
        'review_run_id':'book:'+'b'*32+':1', 'source_seal_sha256':'3'*64, 'excluded_ids_sha256':'4'*64,
        'execution':execution}
    write('review-report.json', review)
    approval = {k:review[k] for k in ('source_sha256','exclusions_sha256','preparation_code_sha256',
        'review_run_id','source_seal_sha256','excluded_ids_sha256')}
    approval.update(schema='linka-model-content-review-v1', status='approved-for-filtered-training-only',
        execution_context='book-local-linux-container', evidence_sha256='2'*64, reviewer='SYNTHETIC_TEST',
        reference='synthetic-decision.md', content_reviewed=True, raw_blob_artifact_approved=False,
        review_report_sha256=recipe.digest(bundle / 'review-report.json'))
    write('source-review.json', approval)
    (root / 'synthetic-decision.md').write_text('SYNTHETIC TEST ONLY, NOT APPROVAL')
    for name in ('source-manifest.json','source-review.json','review-report.json'):
        shutil.copyfile(bundle / name, root / name)
    subprocess.run(['git','init','-q'], check=True)
    subprocess.run(['git','add','.'], check=True)
    metadata = {'source_revision':'a'*40, 'preparation_code_sha256':code_sha, 'source_sha256':'1'*64,
        'exclusions_sha256':exclusions_sha, 'review_run_id':review['review_run_id'], 'train_sha256':'5'*64,
        'frequencies_sha256':recipe.digest(bundle / 'frequencies.tsv'), 'lp_sha256':'6'*64,
        'tool_versions':{}, 'arpa_sha256':{'U':'7'*64}, 'quality_approved':False,
        'redistribution_approved':False, 'final_evaluated':False, 'execution':execution}
    completed = {'argv':['synthetic-command'], 'state':'COMPLETED', 'child_reaped':True, 'code':0}
    completion = {'schema':'linka-book-completion-v1',
        'recipe':{'state':'COMPLETED', 'mode':'train', 'run_id':'book:'+'d'*32+':1'},
        'commands':{name:copy.deepcopy(completed) for name in
            ('build-preparer','prepare','build-cli','compile-U')}}
    completion['commands']['kenlm-build'] = {**completed, 'state':'FAILED', 'code':7}
    metadata['book_completion'] = completion
    def seal(): write('provenance.json', recipe.candidate_provenance(bundle, metadata))
    seal()
    env = {**os.environ, 'BOOK_EXECUTION':json.dumps(execution), 'BOOK_SOURCE_SHA':'a'*40}
    archive = pathlib.Path(temp) / 'candidate.zip'
    counter = 0
    def check(ok, extra=None, omitted=None, symlink=False, oversized=None):
        global counter
        counter += 1
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in bundle.iterdir():
                if file.name != omitted: z.write(file, file.name)
            if extra:
                m = zipfile.ZipInfo(extra)
                if symlink: m.external_attr = (stat.S_IFLNK | 0o777) << 16
                z.writestr(m, 'synthetic')
        if oversized:
            data = bytearray(archive.read_bytes())
            offset = struct.unpack_from('<L', data, len(data)-6)[0]
            while data[offset:offset+4] == b'PK\x01\x02':
                name_len, extra_len, comment_len = struct.unpack_from('<3H', data, offset+28)
                name = bytes(data[offset+46:offset+46+name_len]).decode()
                if name in oversized: struct.pack_into('<L', data, offset+24, oversized[name])
                offset += 46 + name_len + extra_len + comment_len
            archive.write_bytes(data)
        out = pathlib.Path(temp) / ('out'+str(counter))
        result = subprocess.run([sys.executable,'-c',verifier,str(archive),str(out),str(root),
            'source-manifest.json','source-review.json','review-report.json','exclusions.json'],
            env=env, capture_output=True, text=True)
        assert (result.returncode == 0) == ok, result.stderr
        assert out.exists() == ok, 'failure must remove partial extracted bundle'
    check(True)
    valid_provenance = recipe.read_json(bundle / 'provenance.json')
    missing = dict(valid_provenance)
    del missing['book_completion']
    write('provenance.json', missing)
    check(False)
    for section, name, patch in (
        ('recipe', None, {'mode':'review'}),
        ('recipe', None, {'run_id':'book:'+'c'*32+':1'}),
        ('recipe', None, {'state':'CANCELLED'}),
        ('commands', 'prepare', {'child_reaped':False}),
        ('commands', 'compile-U', {'state':'FAILED','code':7}),
        ('commands', 'kenlm-build', {'state':'CANCELLED'}),
        ('commands', 'kenlm-build', {'state':'UNRECONCILED'}),
        ('commands', 'kenlm-build', {'state':'RUNNING'}),
        ('commands', 'kenlm-build', {'code':8}),
        ('commands', 'kenlm-build', {'code':0}),
        ('commands', 'prepare', {'code':True}),
        ('commands', 'prepare', {'code':1}),
    ):
        bad = copy.deepcopy(completion)
        target = bad[section] if name is None else bad[section][name]
        target.update(patch)
        write('provenance.json', {**valid_provenance, 'book_completion':bad})
        check(False)
    for name in ('kenlm-pin','kenlm-clean','kenlm-configure','kenlm-build','mkn3','compile-T'):
        other = copy.deepcopy(completion)
        failure = other['commands'].pop('kenlm-build')
        other['commands'][name] = failure
        write('provenance.json', {**valid_provenance, 'book_completion':other})
        check(True)
    bad = copy.deepcopy(completion)
    bad['commands']['unexpected'] = bad['commands'].pop('kenlm-build')
    write('provenance.json', {**valid_provenance, 'book_completion':bad})
    check(False)
    for name in ('build-preparer','prepare','build-cli','compile-U','kenlm-build'):
        bad = copy.deepcopy(completion)
        del bad['commands'][name]
        write('provenance.json', {**valid_provenance, 'book_completion':bad})
        check(False)
    write('provenance.json', valid_provenance)
    (bundle / 'T.lpk').write_bytes(b'SYNTHETIC_T_MODEL')
    write('T.dev.json', {'state':'NOT_RUN', 'reason':'book_defer_core_dev'})
    write('T.receipt.json', {'state':'COMPLETED','code':0,'child_reaped':True,
        'bytes':(bundle / 'T.lpk').stat().st_size, 'model_sha256':recipe.digest(bundle / 'T.lpk'),
        'execution':execution})
    metadata['arpa_sha256']['T'] = '8'*64
    completion['commands']['kenlm-build'] = copy.deepcopy(completed)
    seal()
    check(True)
    write('T.receipt.json', {'state':'FAILED','code':7,'child_reaped':True,'execution':execution})
    check(False)
    (bundle / 'T.lpk').unlink()
    (bundle / 'T.dev.json').unlink()
    del metadata['arpa_sha256']['T']
    completion['commands']['kenlm-build'] = {**completed, 'state':'FAILED', 'code':7}
    seal()
    for extra in ('../escape', '/absolute', 'rawFINAL.jsonl', 'train.txt', 'source.tsv.bz2', 'U.lpk'):
        check(False, extra=extra)
    check(False, extra='T.lpk', symlink=True)
    check(False, omitted='U.lpk')
    check(False, oversized={'U.lpk':128*1024**2+1})
    check(False, oversized={'NOTICES.txt':64*1024**2+1})
    check(False, oversized={name:64*1024**2 for name in
        ('U.lpk','report.json','NOTICES.txt','train.groups.tsv','dev.groups.tsv')})
    (bundle / 'U.lpk').write_bytes(b'CORRUPTED')
    check(False)
    (bundle / 'U.lpk').write_bytes(b'SYNTHETIC_NOT_A_MODEL')
    u = recipe.read_json(bundle / 'U.receipt.json')
    def rehash():
        p = recipe.read_json(bundle / 'provenance.json')
        p['files_sha256'] = {f.name:recipe.digest(f) for f in bundle.iterdir() if f.name != 'provenance.json'}
        write('provenance.json', p)
    p = recipe.read_json(bundle / 'provenance.json')
    write('provenance.json', {**p, 'quality_approved':True})
    check(False)
    write('provenance.json', p)
    write('U.receipt.json', {**u, 'child_reaped':False})
    rehash()
    check(False)
    write('U.receipt.json', u)
    write('T.receipt.json', {'state':'FAILED','code':7,'child_reaped':True})
    seal()
    check(True)
    p = recipe.read_json(bundle / 'provenance.json')
    write('provenance.json', {**p, 'execution':None})
    check(False)
    write('provenance.json', p)
    write('T.receipt.json', {'state':'FAILED','code':7,'child_reaped':True,'execution':execution})
    seal()
    (root / 'synthetic-decision.md').unlink()
    check(False)
    (root / 'synthetic-decision.md').write_text('SYNTHETIC TEST ONLY')
    write('source-review.json', {**approval, 'raw_blob_artifact_approved':True})
    shutil.copyfile(bundle / 'source-review.json', root / 'source-review.json')
    seal()
    check(False)
    write('source-review.json', approval)
    shutil.copyfile(bundle / 'source-review.json', root / 'source-review.json')
    seal()
    (root / 'exclusions.json').write_text('{"tampered":true}')
    check(False)
`,
        sourceRoot,
        verifier
      ],
      { stdio: "pipe" }
    );
  }
);
test("reject wrong trust bindings and numeric overflow", () => {
  for (const patch of [
    { releaseId: "latest" },
    { archiveBytes: "314572801" },
    { sourceSha: "main" },
    { repository: "../other" },
    { archiveSha256: "B".repeat(64) }
  ]) {
    assert.throws(() => validateInputs({ ...input, ...patch }));
  }
  for (const patch of [
    { draft: false },
    { target_commitish: "main" },
    { id: 124 },
    { url: "https://api.github.com/repos/other/repo/releases/123" },
    { tag_name: "book-candidate-latest" },
    { assets: [...release.assets, ...release.assets] }
  ]) {
    assert.throws(() => validateRelease({ ...release, ...patch }, input));
  }
  for (const patch of [
    { host: "other" },
    { source_sha: "f".repeat(40) },
    { limits: { ...execution.limits, cpus: 3 } },
    { extra: true }
  ]) {
    assert.throws(() => validateExecution({ ...execution, ...patch }, sha, release.tag_name));
  }
});
