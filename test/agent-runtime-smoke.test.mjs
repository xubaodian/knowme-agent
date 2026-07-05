import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { AgentOrchestrator } from "../dist/agent/core/orchestrator.js";
import { SkillRegistry } from "../dist/agent/skills/skill-registry.js";
import { LocalSandboxAdapter } from "../dist/agent/tools/sandbox/local-sandbox-adapter.js";
import { createLocalRunWorkspace, snapshotSkillToWorkspace } from "../dist/server/services/local-run-workspace.js";

test("three-phase runtime uses narrow tools and relative run workspace paths", async () => {
  const timestamp = new Date().toISOString();
  const run = {
    id: `run_smoke_${crypto.randomUUID()}`,
    chatId: "chat_smoke",
    userMessageId: "msg_smoke",
    model: "fake-runtime",
    skillName: "html-report",
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const workspace = await createLocalRunWorkspace(run);

  try {
    const skill = await new SkillRegistry(path.join(process.cwd(), "agent", "skills")).loadSkill("html-report");
    const snapshot = await snapshotSkillToWorkspace(skill, workspace);

    assert.ok(snapshot);
    assert.equal(snapshot.path, path.join(workspace.skillRoot, "SKILL.md"));
    assert.ok(existsSync(snapshot.path));
    assert.ok(existsSync(path.join(workspace.filesRoot, "inputs")));
    assert.ok(existsSync(path.join(workspace.filesRoot, "outputs")));
    assert.ok(existsSync(path.join(workspace.filesRoot, "tmp")));

    const sandbox = new LocalSandboxAdapter(workspace.filesRoot);
    await assert.rejects(
      () => sandbox.writeFile({ path: path.join(workspace.filesRoot, "outputs/absolute.txt"), content: "bad" }),
      /must be relative/
    );
    await assert.rejects(
      () => sandbox.browserNavigate({ url: `file://${path.join(workspace.filesRoot, "outputs/result.txt")}` }),
      /browser_open_file/
    );

    const provider = new FakeProvider([process.cwd(), workspace.root, workspace.filesRoot, workspace.skillRoot]);
    const events = [];
    const artifacts = [];
    const result = await new AgentOrchestrator().run({
      run,
      prompt: "Create a small smoke deliverable in the local run workspace.",
      workspaceRoot: workspace.filesRoot,
      skillsRoot: workspace.skillRoot,
      loadedSkill: snapshot,
      llmProvider: provider,
      onEvent: (event) => events.push(event),
      onArtifact: (artifact) => artifacts.push(artifact)
    });

    assert.match(result.reply, /Smoke task completed/);
    assert.equal(await readFile(path.join(workspace.filesRoot, "outputs/result.txt"), "utf8"), "recorded context -> file output\n");
    assert.equal(artifacts.length, 1);
    assert.equal(artifacts[0].title, "Runtime Smoke Artifact");
    assert.equal(artifacts[0].metadata?.sourcePath, "outputs/result.txt");
    assert.equal(artifacts[0].content, "recorded context -> file output\n");
    assert.ok(events.some((event) => event.type === "tool.started" && event.title === "record_note"));
    assert.ok(events.some((event) => event.type === "tool.started" && event.title === "publish_artifact"));
    assert.ok(events.some((event) => event.type === "artifact.created"));
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
});

class FakeProvider {
  id = "none";
  model = "fake-runtime";
  calls = 0;
  planned = false;
  finalizing = false;
  todoState = new Map();

  constructor(leakNeedles) {
    this.leakNeedles = leakNeedles;
  }

  getStatus() {
    return {
      provider: this.id,
      model: this.model,
      configured: true,
      availableModels: []
    };
  }

  async complete(request) {
    this.calls += 1;
    const toolNames = (request.tools ?? []).map((tool) => tool.name);
    assertNoOldToolNames(toolNames);
    assertNoPathLeaks(request, this.leakNeedles);

    if (toolNames.length === 1 && toolNames[0] === "plan_todos") {
      if (!this.planned) {
        this.planned = true;
        return this.toolCall("plan_todos", {
          action: "create",
          goal: "Verify the three-phase runtime with narrow tools.",
          todos: [
            {
              id: "capture-context",
              title: "Capture reusable context",
              description: "Record an internal note that the next execution unit can reuse.",
              expectedOutput: "A record note containing the smoke context.",
              doneCriteria: ["record_note is called", "The todo is completed with a concise summary"]
            },
            {
              id: "produce-file",
              title: "Produce file and artifact",
              description: "Read the record note, write a relative workspace file, run a code validation, and publish the artifact.",
              expectedOutput: "outputs/result.txt and a Runtime Smoke Artifact.",
              doneCriteria: ["The file exists", "The artifact is published", "The todo summary includes refs"]
            }
          ]
        });
      }

      return this.content("Planning complete.");
    }

    if (toolNames.length === 1 && toolNames[0] === "finish_task") {
      if (!this.finalizing) {
        this.finalizing = true;
        return this.toolCall("finish_task", {
          status: "completed",
          answer: "Smoke task completed with a relative workspace file and published artifact.",
          artifactRefs: ["Runtime Smoke Artifact"],
          fileRefs: ["outputs/result.txt"],
          summary: "Validated planning, record notes, narrow tools, relative paths, and finalization."
        });
      }

      return this.content("Finalized.");
    }

    const todoId = readCurrentTodoId(request);
    const state = this.todoState.get(todoId) ?? 0;
    this.todoState.set(todoId, state + 1);

    if (todoId === "capture-context") {
      if (state === 0) {
        return this.toolCall("record_note", {
          title: "Smoke context",
          content: "recorded context"
        });
      }

      if (state === 1) {
        return this.toolCall("plan_todos", {
          action: "complete",
          todoId,
          summary: "Recorded reusable smoke context.",
          nextContext: "Use the Smoke context record note in the next todo."
        });
      }

      return this.content("capture-context done");
    }

    if (todoId === "produce-file") {
      if (state === 0) {
        return this.toolCall("read_record", {
          id: readRecordId(request)
        });
      }

      if (state === 1) {
        return this.toolCall("write_file", {
          path: "outputs/result.txt",
          content: "recorded context -> file output\n"
        });
      }

      if (state === 2) {
        return this.toolCall("run_node", {
          code: "import { readFileSync } from 'node:fs'; console.log(readFileSync('outputs/result.txt', 'utf8').trim());"
        });
      }

      if (state === 3) {
        return this.toolCall("publish_artifact", {
          kind: "text",
          title: "Runtime Smoke Artifact",
          source: {
            type: "file",
            path: "outputs/result.txt"
          },
          display: {
            mode: "button"
          }
        });
      }

      if (state === 4) {
        return this.toolCall("plan_todos", {
          action: "complete",
          todoId,
          summary: "Wrote outputs/result.txt, validated it with Node.js, and published the Runtime Smoke Artifact.",
          artifactRefs: ["Runtime Smoke Artifact"],
          fileRefs: ["outputs/result.txt"],
          evidenceRefs: ["run_node: recorded context -> file output"],
          nextContext: "Final response should mention outputs/result.txt and Runtime Smoke Artifact."
        });
      }

      return this.content("produce-file done");
    }

    throw new Error(`Unexpected fake runtime state for todo: ${todoId}`);
  }

  toolCall(name, args) {
    return {
      provider: this.id,
      model: this.model,
      content: "",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: `call_${this.calls}`,
          name,
          arguments: JSON.stringify(args)
        }
      ]
    };
  }

  content(content) {
    return {
      provider: this.id,
      model: this.model,
      content,
      finishReason: "stop"
    };
  }
}

function assertNoOldToolNames(toolNames) {
  const oldNames = new Set(["file", "command", "code", "browser", "artifact", "context", "write_todos", "read_skill_file", "create_artifact"]);
  const leaked = toolNames.filter((name) => oldNames.has(name));
  assert.deepEqual(leaked, []);
}

function assertNoPathLeaks(request, needles) {
  const payload = JSON.stringify({
    messages: request.messages,
    tools: request.tools
  });

  for (const needle of needles) {
    const index = payload.indexOf(needle);
    const excerpt = index === -1 ? "" : payload.slice(Math.max(0, index - 160), index + needle.length + 160);
    assert.equal(index, -1, `LLM request leaked local absolute path: ${needle}\n${excerpt}`);
  }
}

function readCurrentTodoId(request) {
  const payload = request.messages.map((message) => message.content ?? "").join("\n");
  const match = payload.match(/"currentTodo"\s*:\s*{\s*"id"\s*:\s*"([^"]+)"/);

  if (!match) {
    throw new Error("Could not locate currentTodo.id in fake provider request.");
  }

  return match[1];
}

function readRecordId(request) {
  const payload = request.messages.map((message) => message.content ?? "").join("\n");
  const match = payload.match(/rec_[0-9a-f-]+/i);

  if (!match) {
    throw new Error("Could not locate record note id in fake provider request.");
  }

  return match[0];
}
