import assert from "node:assert/strict";
import test from "node:test";
import { runAgentLoop } from "../dist/agent/core/agent-loop.js";

test("agent loop compacts over 80K tokens while retaining plan, state, and traceable paths", async () => {
  const provider = new CompressionProvider();
  const events = [];

  const result = await runAgentLoop({
    name: "Execution unit todo-1",
    llmMessages: [
      { role: "system", content: "ORIGINAL PLAN MUST STAY" },
      { role: "user", content: JSON.stringify({ currentTodo: { id: "todo-1", status: "in_progress" } }) }
    ],
    llmProvider: provider,
    toolRegistry: {
      list: () => [
        { name: "plan_todos", description: "Update plan", inputSchema: { type: "object", properties: {} } },
        { name: "run_command", description: "Run shell", inputSchema: { type: "object", properties: {} } }
      ]
    },
    toolRunner: {
      async run(name, input) {
        if (name === "plan_todos") {
          return {
            summary: "Plan updated",
            data: { goal: "test", todos: [{ id: "todo-1", title: "Execute", status: "in_progress" }] }
          };
        }

        const index = Number(String(input.command).match(/check-(\d+)/)?.[1] ?? 0);
        return {
          summary: `Command ${index} completed at outputs/result-${index}.log`,
          data: {
            path: `outputs/result-${index}.log`,
            stdout: "x".repeat(20_000),
            exitCode: 0
          }
        };
      }
    },
    eventBus: {
      runLogger: createRunLogger(events),
      emit() {}
    },
    allowedTools: ["plan_todos", "run_command"],
    maxIterations: 3
  });

  assert.equal(result.content, "done");
  assert.equal(provider.calls, 2);
  const compressionEvent = events.find((event) => event.name === "agent.loop.context_compacted");
  assert.ok(compressionEvent.data.promptTokensBefore > 80_000);
  assert.ok(compressionEvent.data.promptTokensAfter <= 30_000);
});

class CompressionProvider {
  id = "none";
  model = "compression-test";
  calls = 0;

  getStatus() {
    return { provider: this.id, model: this.model, configured: true };
  }

  async complete(request) {
    this.calls += 1;

    if (this.calls === 1) {
      return {
        provider: this.id,
        model: this.model,
        content: "",
        finishReason: "tool_calls",
        usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
        toolCalls: [
          {
            id: "plan",
            name: "plan_todos",
            arguments: JSON.stringify({ action: "start", todoId: "todo-1" })
          },
          ...Array.from({ length: 28 }, (_, index) => ({
            id: `shell-${index}`,
            name: "run_command",
            arguments: JSON.stringify({
              command: `node scripts/check-${index}.mjs outputs/input-${index}.md`,
              cwd: "."
            })
          }))
        ]
      };
    }

    const serialized = JSON.stringify(request.messages);
    const checkpointMessage = request.messages.find((message) => typeof message.content === "string" && message.content.includes("execution_context_checkpoint"));
    const checkpoint = JSON.parse(checkpointMessage.content.slice(checkpointMessage.content.indexOf("\n") + 1));
    assert.match(serialized, /ORIGINAL PLAN MUST STAY/);
    assert.equal(checkpoint.plan.todos[0].status, "in_progress");
    assert.match(serialized, /scripts\/check-0\.mjs/);
    assert.match(serialized, /scripts\/check-27\.mjs/);
    assert.match(serialized, /outputs\/result-0\.log/);
    assert.match(serialized, /outputs\/result-27\.log/);
    assert.equal(serialized.includes("x".repeat(1_000)), false);
    assert.ok(Buffer.byteLength(serialized, "utf8") < 120_000);

    return {
      provider: this.id,
      model: this.model,
      content: "done",
      finishReason: "stop",
      usage: { promptTokens: 20_000, completionTokens: 10, totalTokens: 20_010 }
    };
  }
}

function createRunLogger(events) {
  const runLogger = {
    event(name, data) {
      events.push({ name, data });
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
