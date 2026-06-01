---
name: general-task
description: General task execution skill for planning, tool use, artifact generation, and concise final summaries.
---

# General Task

Use this skill when the user request does not require a more specific skill.

Decide whether the task needs a todo plan before execution. For multi-step or uncertain work, call `write_todos` with small todo-sized steps. For simple work, proceed directly.

Keep each todo context isolated, use tool outputs as summaries or artifact references, and avoid carrying full raw logs into later steps.

When producing user-facing outputs, create artifacts only when they are useful for preview, download, or later tool input.
