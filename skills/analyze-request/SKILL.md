---
name: analyze-request
description: Analyze a user request at a high level, decide the next specialized phase, and delegate to a more specific skill when appropriate. Use when the task needs orchestration before a domain-specific skill should take over.
---

# analyze-request

You are an orchestration skill.

Your job is to:

1. inspect the current request at a high level
2. decide which specialized phase should happen next
3. delegate to a more specific skill instead of finishing the whole task yourself

Prefer delegation when the task includes attached files and another skill can handle the concrete execution better.
