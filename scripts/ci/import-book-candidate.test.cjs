const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  validateInputs,
  validateRelease,
  validateExecution,
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
test("synthetic ZIP and tracked approval integration with trusted canonical validator", () => {
  const sourceRoot =
    process.env.BOOK_SOURCE_ROOT || path.resolve(__dirname, "../../../predictor-model-400");
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
});
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
