import assert from "node:assert/strict";
import test from "node:test";
import { runAgentLoop } from "../dist/agent/core/agent-loop.js";

test("planning-style agent loop stops after the first successful tool call", async () => {
  const provider = new RepeatingToolProvider();
  const toolRunner = new CountingToolRunner();
  const runLogger = createRunLogger();

  const result = await runAgentLoop({
    name: "Planning",
    llmMessages: [{ role: "user", content: "plan" }],
    llmProvider: provider,
    toolRegistry: {
      list: () => [
        {
          name: "plan_todos",
          description: "Create a plan",
          inputSchema: { type: "object", properties: {} }
        }
      ]
    },
    toolRunner,
    eventBus: { runLogger, emit() {} },
    allowedTools: ["plan_todos"],
    toolChoice: "required",
    maxIterations: 6,
    stopAfterSuccessfulToolCall: true
  });

  assert.equal(provider.calls, 1);
  assert.equal(toolRunner.calls, 1);
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].ok, true);
});

class RepeatingToolProvider {
  id = "none";
  model = "planning-stop-test";
  calls = 0;

  getStatus() {
    return { provider: this.id, model: this.model, configured: true };
  }

  async complete() {
    this.calls += 1;
    return {
      provider: this.id,
      model: this.model,
      content: "",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: `call_${this.calls}`,
          name: "plan_todos",
          arguments: JSON.stringify({ action: "create", goal: "test", todos: [] })
        }
      ]
    };
  }
}

class CountingToolRunner {
  calls = 0;

  async run() {
    this.calls += 1;
    return { summary: "Plan created", data: { goal: "test", todos: [] } };
  }
}

function createRunLogger() {
  const runLogger = {
    event() {},
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
