import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("chat timeline API returns persisted messages, runs, events, and artifacts", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "knowme-agent-timeline-"));
  const statePath = path.join(tempRoot, "state.json");
  const chatId = "chat_timeline";
  const runId = "run_timeline";
  const userMessageId = "msg_user_timeline";
  const assistantMessageId = "msg_assistant_timeline";
  const timestamp = "2026-06-19T08:00:00.000Z";

  process.env.KNOWME_STATE_FILE = statePath;
  await writeFile(
    statePath,
    `${JSON.stringify(
      {
        chats: [
          {
            id: chatId,
            title: "Timeline smoke",
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        messagesByChat: {
          [chatId]: [
            {
              id: userMessageId,
              chatId,
              role: "user",
              content: "Create a timeline artifact.",
              createdAt: timestamp
            },
            {
              id: assistantMessageId,
              chatId,
              role: "assistant",
              content: "Timeline artifact ready.",
              runId,
              createdAt: "2026-06-19T08:00:05.000Z"
            }
          ]
        },
        runs: [
          {
            id: runId,
            chatId,
            userMessageId,
            status: "completed",
            model: "moonshotai/kimi-k2.6",
            skillName: "html-report",
            createdAt: "2026-06-19T08:00:01.000Z",
            updatedAt: "2026-06-19T08:00:04.000Z",
            completedAt: "2026-06-19T08:00:04.000Z"
          }
        ],
        eventsByRun: {
          [runId]: [
            {
              id: "evt_timeline_1",
              runId,
              chatId,
              type: "todo.created",
              title: "Create artifact",
              status: "pending",
              flowKind: "todo",
              visibility: "primary",
              createdAt: "2026-06-19T08:00:02.000Z",
              sequence: 1,
              stepId: "todo-1",
              stepTitle: "Create artifact"
            },
            {
              id: "evt_timeline_2",
              runId,
              chatId,
              type: "artifact.created",
              title: "Artifact: Timeline Report",
              status: "done",
              flowKind: "artifact",
              visibility: "primary",
              createdAt: "2026-06-19T08:00:03.000Z",
              sequence: 2,
              artifactId: "art_timeline"
            }
          ]
        },
        artifactsByRun: {
          [runId]: [
            {
              id: "art_timeline",
              runId,
              chatId,
              kind: "markdown",
              title: "Timeline Report",
              status: "ready",
              createdAt: "2026-06-19T08:00:03.000Z",
              updatedAt: "2026-06-19T08:00:03.000Z",
              version: 1,
              display: {
                mode: "button",
                label: "打开产物",
                previewTarget: "modal"
              },
              content: "Timeline artifact"
            }
          ]
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  try {
    const { createApp } = await import(`../dist/server/app.js?timeline=${crypto.randomUUID()}`);
    const app = createApp();
    const response = await app.request(`/api/chats/${chatId}/timeline`);

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.chat.id, chatId);
    assert.equal(payload.messages.length, 2);
    assert.equal(payload.runs.length, 1);
    assert.equal(payload.runs[0].id, runId);
    assert.equal(payload.eventsByRun[runId].length, 2);
    assert.equal(payload.artifactsByRun[runId].length, 1);
    assert.equal(payload.artifactsByRun[runId][0].title, "Timeline Report");
  } finally {
    delete process.env.KNOWME_STATE_FILE;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
