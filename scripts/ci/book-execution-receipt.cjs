// Pure canonical Book receipt validation; no transport, filesystem or inference.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

function validateExecution(e, sourceSha, tag) {
  assert(e && /^[0-9a-f]{32}$/.test(e.book_job_id), "book job ID");
  assert(
    typeof e.image_digest === "string" && /^sha256:[0-9a-f]{64}$/.test(e.image_digest),
    "image digest"
  );
  assert(
    typeof e.receipt_sha256 === "string" && /^[0-9a-f]{64}$/.test(e.receipt_sha256),
    "operational receipt SHA256"
  );
  assert(Number.isSafeInteger(e.attempt) && e.attempt > 0, "book attempt");
  assert.deepEqual(e, {
    schema: "linka-book-execution-v1",
    attempt: e.attempt,
    receipt_sha256: e.receipt_sha256,
    kind: "book-local-linux-container",
    book_job_id: tag.slice("book-candidate-".length),
    host: "book.local",
    colima_profile: "linka-model-400",
    image_digest: e.image_digest,
    source_sha: sourceSha,
    limits: { memory_bytes: 6442450944, cpus: 2, tasks: 128 }
  });
  const receipt = { ...e };
  delete receipt.kind;
  delete receipt.receipt_sha256;
  const sorted = (value) =>
    value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])])
        )
      : value;
  // Validated receipt fields are ASCII; this matches Python ensure_ascii=True plus LF.
  const canonicalBytes = JSON.stringify(sorted(receipt)) + "\n";
  assert.equal(
    createHash("sha256").update(canonicalBytes, "utf8").digest("hex"),
    e.receipt_sha256,
    "canonical operational receipt SHA256 mismatch"
  );
}

module.exports = { validateExecution };
