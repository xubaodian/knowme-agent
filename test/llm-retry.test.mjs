import assert from "node:assert/strict";
import test from "node:test";
import { completeWithLogging, isRetryableLlmError } from "../dist/agent/llm/llm-runner.js";

test("LLM completion retries transient errors and then succeeds", async () => {
  const provider = new SequenceProvider([
    errorWith({ message: "service unavailable", status: 503 }),
    errorWith({ code: "ECONNRESET", message: "socket reset" }),
    completion("recovered")
  ]);
  const events = [];
  const retries = [];

  const result = await completeWithLogging({
    provider,
    request: { messages: [{ role: "user", content: "hello" }] },
    runLogger: createRunLogger(events),
    phase: "test",
    retry: { maxAttempts: 3, baseDelayMs: 0 },
    onRetry: (event) => retries.push(event)
  });

  assert.equal(result.content, "recovered");
  assert.equal(provider.calls, 3);
  assert.equal(retries.length, 2);
  assert.deepEqual(events.filter((event) => event.name === "llm.complete.retry").map((event) => event.attributes.nextAttempt), [2, 3]);
});

test("LLM completion does not retry permanent client errors", async () => {
  const provider = new SequenceProvider([errorWith({ message: "invalid request", status: 400 })]);

  await assert.rejects(
    () =>
      completeWithLogging({
        provider,
        request: { messages: [{ role: "user", content: "hello" }] },
        runLogger: createRunLogger([]),
        phase: "test",
        retry: { maxAttempts: 3, baseDelayMs: 0 }
      }),
    /invalid request/
  );

  assert.equal(provider.calls, 1);
});

test("LLM retry classifier distinguishes transient and permanent failures", () => {
  assert.equal(isRetryableLlmError(errorWith({ status: 429, message: "rate limited" })), true);
  assert.equal(isRetryableLlmError(errorWith({ status: 502, message: "bad gateway" })), true);
  assert.equal(isRetryableLlmError(errorWith({ code: "ETIMEDOUT", message: "request failed" })), true);
  assert.equal(isRetryableLlmError(errorWith({ status: 401, message: "unauthorized" })), false);
  assert.equal(isRetryableLlmError(errorWith({ status: 422, message: "invalid tool schema" })), false);
});

class SequenceProvider {
  id = "none";
  model = "retry-test";
  calls = 0;

  constructor(sequence) {
    this.sequence = sequence;
  }

  getStatus() {
    return { provider: this.id, model: this.model, configured: true };
  }

  async complete() {
    const next = this.sequence[this.calls++];

    if (next instanceof Error) {
      throw next;
    }

    return next;
  }
}

function completion(content) {
  return { provider: "none", model: "retry-test", content, finishReason: "stop" };
}

function errorWith(properties) {
  return Object.assign(new Error(properties.message), properties);
}

function createRunLogger(events) {
  const runLogger = {
    event(name, attributes = {}, level = "info") {
      events.push({ name, attributes, level });
    },
    metric() {},
    startSpan() {
      return { end() {}, fail() {} };
    },
    child() {
      return runLogger;
    }
  };

  return runLogger;
}
