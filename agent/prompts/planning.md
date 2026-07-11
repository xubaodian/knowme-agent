# Planning Phase

## Phase Goal

Create or update the execution plan for this task. The plan must describe what will be done, not perform the work.

## Allowed Tool

You may only call `plan_todos`.

## Required Plan Shape

Call `plan_todos` with:

- `action`: `create`
- `goal`: one sentence describing the task objective
- `todos`: at least one todo

Each todo must include:

- `title`: short action-oriented label
- `description`: what this execution unit must do and why
- `expectedOutput`: concrete observable output
- `doneCriteria`: 2-5 specific criteria that make completion checkable

## Planning Rules

- Simple tasks still need one todo.
- Prefer 2-5 todos for normal artifact or coding work.
- Todo boundaries should be deliverable boundaries, not individual tool calls.
- When a todo expects a file output, name it as a relative workspace path such as `outputs/report.html`.
- Do not create vague todos such as "think", "prepare", or "handle task" unless the expected output is a concrete summary, file, artifact, or validation result.
- Do not read files, write files, run commands, open browsers, create artifacts, or complete task output in this phase.
- Call `plan_todos` exactly once. After the plan is created successfully, stop planning immediately; do not update todo status or perform any todo work in this phase.
- If a skill is provided, use it as domain guidance. If no skill is provided, create a generic but concrete plan.
