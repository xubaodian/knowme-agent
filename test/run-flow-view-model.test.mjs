import assert from "node:assert/strict";
import test from "node:test";

test("run flow view model turns runtime events into user-readable work narrative", async () => {
  const { buildRunFlowViewModel } = await import("../dist/shared/run-flow-view-model.js");
  const chatId = "chat_debounce";
  const runId = "run_debounce";
  const userMessageId = "msg_user_debounce";
  const timestamp = "2026-07-05T08:00:00.000Z";
  const artifact = {
    id: "art_debounce",
    runId,
    chatId,
    kind: "code",
    title: "debounce.js",
    status: "ready",
    createdAt: "2026-07-05T08:00:08.000Z",
    updatedAt: "2026-07-05T08:00:08.000Z",
    version: 1,
    display: {
      mode: "button",
      label: "打开产物",
      previewTarget: "modal"
    },
    language: "javascript",
    content: "function debounce(fn, delay) {}"
  };

  const view = buildRunFlowViewModel({
    run: {
      id: runId,
      chatId,
      userMessageId,
      status: "completed",
      skillName: "general-agent",
      model: "x-ai/grok-4.5",
      createdAt: timestamp,
      updatedAt: "2026-07-05T08:00:10.000Z",
      completedAt: "2026-07-05T08:00:10.000Z"
    },
    assistantMessages: [
      {
        id: "msg_assistant_debounce",
        chatId,
        role: "assistant",
        content: "已完成 debounce 函数实现。",
        runId,
        createdAt: "2026-07-05T08:00:11.000Z"
      }
    ],
    artifacts: [artifact],
    events: [
      {
        id: "evt_run_started",
        runId,
        chatId,
        type: "run.started",
        title: "Run started",
        status: "running",
        flowKind: "status",
        visibility: "debug",
        createdAt: timestamp,
        sequence: 1
      },
      {
        id: "evt_llm_ready",
        runId,
        chatId,
        type: "thought.created",
        title: "LLM provider ready",
        detail: "已启用 openrouter。",
        status: "done",
        flowKind: "thought",
        visibility: "debug",
        createdAt: "2026-07-05T08:00:01.000Z",
        sequence: 2
      },
      {
        id: "evt_profile_ready",
        runId,
        chatId,
        type: "thought.created",
        title: "Generic profile ready",
        detail: "未选择 skill。",
        status: "done",
        flowKind: "thought",
        visibility: "debug",
        createdAt: "2026-07-05T08:00:02.000Z",
        sequence: 3
      },
      {
        id: "evt_planning",
        runId,
        chatId,
        type: "thought.created",
        title: "规划任务",
        detail: "正在根据用户请求生成执行计划。",
        status: "running",
        flowKind: "thought",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:03.000Z",
        sequence: 4
      },
      {
        id: "evt_plan_tool_started",
        runId,
        chatId,
        type: "tool.started",
        title: "plan_todos",
        status: "in_progress",
        flowKind: "tool",
        visibility: "debug",
        createdAt: "2026-07-05T08:00:04.000Z",
        sequence: 5,
        nodeId: "tool_plan",
        payload: {
          tool: {
            name: "plan_todos",
            inputSummary: "更新执行计划。",
            status: "running"
          }
        }
      },
      {
        id: "evt_todo_created",
        runId,
        chatId,
        type: "todo.created",
        title: "Create debounce.js implementation",
        status: "pending",
        flowKind: "todo",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:05.000Z",
        sequence: 6,
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        payload: {
          plan: {
            goal: "Write a reusable JavaScript debounce function and deliver it as a source file with usage example.",
            todoCount: 1,
            todoIds: ["todo-1"]
          },
          todo: {
            id: "todo-1",
            title: "Create debounce.js implementation",
            description: "Implement a standard debounce function with usage example.",
            expectedOutput: "outputs/debounce.js",
            doneCriteria: ["File outputs/debounce.js exists", "Contains debounce(fn, delay)", "JS syntax is valid"],
            status: "pending"
          }
        }
      },
      {
        id: "evt_todo_started",
        runId,
        chatId,
        type: "todo.updated",
        title: "Create debounce.js implementation",
        status: "in_progress",
        flowKind: "todo",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:06.000Z",
        sequence: 7,
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        payload: {
          todo: {
            id: "todo-1",
            title: "Create debounce.js implementation",
            description: "Implement a standard debounce function with usage example.",
            expectedOutput: "outputs/debounce.js",
            doneCriteria: ["File outputs/debounce.js exists", "Contains debounce(fn, delay)", "JS syntax is valid"],
            status: "in_progress"
          }
        }
      },
      {
        id: "evt_write_started",
        runId,
        chatId,
        type: "tool.started",
        title: "write_file",
        status: "in_progress",
        flowKind: "tool",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:07.000Z",
        sequence: 8,
        nodeId: "tool_write",
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        payload: {
          tool: {
            name: "write_file",
            inputSummary: "写入文件：outputs/debounce.js（420 字符）。",
            status: "running"
          }
        }
      },
      {
        id: "evt_write_finished",
        runId,
        chatId,
        type: "tool.finished",
        title: "write_file completed",
        status: "done",
        flowKind: "tool",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:08.000Z",
        sequence: 9,
        nodeId: "tool_write",
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        payload: {
          tool: {
            name: "write_file",
            inputSummary: "写入文件：outputs/debounce.js（420 字符）。",
            outputSummary: "已写入 outputs/debounce.js。",
            status: "completed",
            durationMs: 12,
            resource: {
              kind: "file",
              title: "outputs/debounce.js",
              path: "outputs/debounce.js",
              summary: "已写入 outputs/debounce.js。"
            }
          }
        }
      },
      {
        id: "evt_command_finished",
        runId,
        chatId,
        type: "tool.finished",
        title: "run_command completed",
        status: "done",
        flowKind: "tool",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:09.000Z",
        sequence: 10,
        nodeId: "tool_command",
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        payload: {
          tool: {
            name: "run_command",
            outputSummary: "命令退出码 0，耗时 30ms。",
            status: "completed",
            durationMs: 30,
            resource: {
              kind: "command",
              title: "命令执行",
              command: "node --check outputs/debounce.js",
              exitCode: 0,
              summary: "命令退出码 0，耗时 30ms。"
            }
          }
        }
      },
      {
        id: "evt_artifact_created",
        runId,
        chatId,
        type: "artifact.created",
        title: "Artifact: debounce.js",
        status: "done",
        flowKind: "artifact",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:10.000Z",
        sequence: 11,
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        artifactId: artifact.id,
        payload: {
          artifact
        }
      },
      {
        id: "evt_todo_completed",
        runId,
        chatId,
        type: "todo.updated",
        title: "Create debounce.js implementation",
        status: "done",
        flowKind: "todo",
        visibility: "primary",
        createdAt: "2026-07-05T08:00:11.000Z",
        sequence: 12,
        stepId: "todo-1",
        stepTitle: "Create debounce.js implementation",
        payload: {
          todo: {
            id: "todo-1",
            title: "Create debounce.js implementation",
            description: "Implement a standard debounce function with usage example.",
            expectedOutput: "outputs/debounce.js",
            doneCriteria: ["File outputs/debounce.js exists", "Contains debounce(fn, delay)", "JS syntax is valid"],
            status: "completed",
            summary: "Created outputs/debounce.js and verified it is syntactically valid.",
            fileRefs: ["outputs/debounce.js"],
            artifactRefs: ["debounce.js"]
          }
        }
      }
    ]
  });

  assert.equal(view.planning?.goal, "Write a reusable JavaScript debounce function and deliver it as a source file with usage example.");
  assert.equal(view.planning?.todos.length, 1);
  assert.equal(view.todos.length, 1);
  assert.equal(view.todos[0].status, "completed");
  assert.equal(view.todos[0].summary, "Created outputs/debounce.js and verified it is syntactically valid.");
  assert.deepEqual(
    view.todos[0].actions.map((action) => action.title),
    ["写入文件", "执行命令"]
  );
  assert.equal(view.todos[0].actions[0].eventIds.length, 2);
  assert.equal(view.todos[0].artifacts[0].title, "debounce.js");
  assert.deepEqual(
    view.workbenchResources.map((resource) => resource.kind),
    ["file", "command"]
  );
  assert.equal(view.workbenchResources[0].title, "outputs/debounce.js");
  assert.equal(view.runActions.length, 0);
  assert.equal(view.finalMessages[0].content, "已完成 debounce 函数实现。");
});
