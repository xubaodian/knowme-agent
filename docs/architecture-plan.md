# KnowMe Agent Architecture Plan

## 1. Product Definition

`knowme-agent` is a personal-theme, single-manager agent system inspired by Hermes Agent.

It includes:

- a frontend workspace
- an agent runtime

Core constraints:

- no deep agents in MVP
- memory is required, but simplified
- community skills should be reusable with minimal adaptation
- all environment actions must be delegated to `sandbox`

The system should support:

- accepting user requests and attached files
- optionally generating a task plan
- selecting skills
- running mixed LLM and sandbox steps
- producing final results and artifacts
- persisting lightweight memory

## 2. Architecture Overview

The system is split into two top-level applications:

- `frontend/`
- `agent-runtime/`

The runtime is split into five modules:

- `agent-core`
- `skill-runtime`
- `skill-system`
- `sandbox`
- `memory`

### 2.1 Responsibility Boundaries

#### `agent-core`

Responsible for:

- request normalization
- context building
- task understanding
- optional planning
- skill routing
- orchestration
- final synthesis
- memory updates

#### `skill-runtime`

Responsible for:

- loading a selected skill definition
- executing skill steps in order
- running LLM-native steps
- calling sandbox-backed steps
- managing intermediate state
- producing skill execution results

#### `skill-system`

Responsible for:

- registering installed skills
- listing, enabling, and disabling skills
- installing community-compatible skills
- validating skill metadata
- adapting skill capability requirements to local runtime capabilities
- supporting generic manifests, registries, and adapters instead of a single built-in format

#### `sandbox`

Responsible for:

- acting as a generic execution abstraction layer
- separating tool action protocol from concrete sandbox backends
- adapting stable runtime actions into backend-specific calls
- routing capability requests to provider implementations
- filesystem access
- command execution
- code execution
- browser automation
- artifact writing
- permission checks
- timeouts
- execution logs and traces

#### `memory`

Responsible for:

- storing long-term profile memory
- storing short-term session/task memory
- retrieving relevant memory for a request
- saving post-task summaries and explicit user preferences

## 3. Execution Model

The system uses a single manager agent.

The manager agent:

- receives the request
- reads memory
- decides whether planning is needed
- selects an initial skill by metadata
- follows delegated handoffs to later skills or phases when a running skill requests it
- delegates environment actions to sandbox
- produces the final answer

There is no multi-agent delegation in the MVP.

## 4. Planning Model

Planning is optional and lightweight.

Rules:

- simple requests may skip explicit planning
- medium or complex requests should produce a structured `TaskPlan`
- the frontend should display the plan when one exists

Suggested `TaskPlan` fields:

- `goal`
- `steps`
- `dependencies`
- `selectedSkills`
- `requiredCapabilities`
- `expectedOutputs`
- `risks`

## 5. Skill Model

Skills should follow the Claude Code / Claude Skills directory convention.

Each skill should live in its own directory and contain:

- `SKILL.md` as the required entrypoint
- optional `scripts/`
- optional `references/`
- optional `assets/`

The `SKILL.md` should contain YAML frontmatter with at minimum:

- `name`
- `description`

### 5.1 Skill Runtime Loop

Skills are loaded on demand and executed inside a constrained agent loop.

The runtime should:

- expose a small tool surface to the LLM
- require the LLM to return exactly one next action as structured JSON
- validate the action before execution
- execute tool actions through sandbox
- end only on `finish`, `fail`, `request_input`, or `delegate`

Recommended action set:

- `read_file`
- `write_file`
- `run_code`
- `run_command`
- `browser_open`
- `browser_snapshot`
- `browser_act`
- `browser_extract`
- `browser_screenshot`
- `finish`
- `fail`
- `request_input`
- `delegate`

Rule:

- LLM reasoning stays inside `skill-runtime`
- tool execution goes through sandbox-backed providers
- references and prior outputs are accessed through normal file/state mechanisms, not separate artifact or memory tools

### 5.2 Generic Skill System

The skill system should be layered and reusable.

Recommended layers:

- `manifest layer`
  - parses and validates `SKILL.md`
- `registry layer`
  - resolves installed, bundled, workspace, and managed skills
- `adapter layer`
  - adapts community skill formats into a normalized internal `SkillSpec`
- `runtime layer`
  - executes normalized skill steps

Design rules:

- the registry should not assume one source of skills
- Claude-style skill directories should be the primary authoring format
- runtime execution should only depend on normalized `SkillSpec`
- skill capability requirements should resolve against runtime and sandbox capabilities

## 6. Sandbox Model

Sandbox is the only execution surface for environment actions.

It should be treated as a generic capability execution layer rather than only a browser tool wrapper.

The sandbox stack should be layered:

- `tool action protocol`
  - stable runtime-facing actions such as `read_file`, `run_code`, and `browser_open`
- `action adapters`
  - map stable tool actions into backend-specific capability and operation calls
- `backend providers`
  - local, veFaaS, E2B, or other sandbox implementations
- `target resolver`
  - chooses an existing sandbox instance or pool target without forcing the runtime to create a new instance

### 6.1 Providers

#### `sandbox.fs`

- list files
- read files
- write files
- search files
- stat files

#### `sandbox.exec`

- run shell commands
- run Node.js scripts
- run Python scripts

#### `sandbox.codeInterpreter`

- run structured code execution jobs
- execute snippets with bounded inputs
- capture stdout, stderr, and structured outputs

#### `sandbox.browser`

- open pages
- click
- type
- extract text
- extract DOM
- take screenshots

#### `sandbox.artifact`

- write text outputs
- write JSON outputs
- register generated files

### 6.2 Capability Routing

Sandbox should expose a generic call shape such as:

- `capability`
- `action`
- `input`

The router maps capabilities to providers. Examples:

- `fs.read` -> `sandbox.fs`
- `exec.shell` -> `sandbox.exec`
- `code.run.python` -> `sandbox.codeInterpreter`
- `browser.extract` -> `sandbox.browser`
- `artifact.write` -> `sandbox.artifact`

This keeps skills generic while allowing different backends later.

The runtime should not bind directly to a specific vendor sandbox.

Instead:

- the skill loop emits stable tool actions
- action adapters translate those actions into backend calls
- backend providers can target local execution, veFaaS sandbox, E2B sandbox, or other compatible systems
- sandbox target information can be passed in request metadata so the runtime can reuse already-created instances from an external pool manager

### 6.3 Sandbox Logging

Every sandbox call should capture:

- `callId`
- `taskId`
- `skillId`
- `stepId`
- `capability`
- `provider`
- `action`
- `input`
- `output`
- `status`
- `startedAt`
- `endedAt`

## 7. Memory Model

Memory is required, but simplified in MVP.

### 7.1 Profile Memory

Long-term memory for:

- identity and background
- language preference
- output style preference
- explicit long-term instructions
- recurring habits and rules

### 7.2 Session Memory

Short-term memory for:

- current task goal
- uploaded files
- execution progress
- intermediate conclusions
- generated artifacts
- task summary

### 7.3 Memory Behavior

At task start:

- load relevant profile memory
- load relevant session memory
- inject selected memory into context

At task end:

- store task summary
- store explicit new user preferences
- update session state

## 8. Frontend Design

The frontend should be a workspace, not only a chat box.

Required MVP views:

- chat workspace
- plan panel
- execution trace panel
- artifacts panel
- profile and memory panel
- skills panel

Core frontend goals:

- submit tasks and files
- show the current task plan
- show live execution state
- show sandbox and skill trace data
- expose profile, memory, and installed skills

## 9. Suggested Directory Structure

```text
frontend/
agent-runtime/
agent-runtime/core/
agent-runtime/skill-runtime/
agent-runtime/skill-system/
agent-runtime/sandbox/
agent-runtime/memory/
agent-runtime/shared/
docs/
examples/
```

## 10. Core Data Objects

The MVP should define these core objects first:

- `AgentRequest`
- `TaskPlan`
- `SkillSpec`
- `SkillExecution`
- `SandboxCall`
- `MemoryRecord`
- `Artifact`

## 11. End-to-End Request Flow

1. User submits text and optional files in frontend.
2. Request is normalized by `agent-core`.
3. Relevant memory is loaded.
4. Manager agent understands the task.
5. A plan is optionally generated.
6. Skills are selected.
7. `skill-runtime` executes skill steps.
8. LLM steps run in runtime.
9. Environment steps run in sandbox.
10. Results and artifacts are synthesized.
11. Memory is updated.
12. Frontend displays plan, trace, artifacts, and final answer.

## 12. MVP Scope

Included in MVP:

- frontend workspace
- file upload
- single manager agent
- lightweight planning
- skill registry
- local skill loading
- community skill installation path
- skill runtime
- sandbox fs
- sandbox exec
- sandbox browser
- sandbox artifact
- simplified memory
- execution trace UI

Excluded from MVP:

- deep agents
- automatic skill generation
- advanced permission center
- plugin marketplace
- heavy vector memory system

## 13. Implementation Task Breakdown

All tasks below should be independently verifiable.

### Phase 0. Project Foundation

#### Task 0.1 Create monorepo structure

Goal:

- create the top-level directories for frontend, runtime, docs, and shared code

Deliverables:

- directory tree exists in repo

Verification:

- `find . -maxdepth 2 -type d | sort` shows the planned structure

#### Task 0.2 Define shared TypeScript project config

Goal:

- create shared tsconfig and package layout for frontend and runtime

Deliverables:

- root package config
- shared tsconfig

Verification:

- package manager install succeeds
- TypeScript compiler can resolve workspace packages

#### Task 0.3 Define core shared schemas

Goal:

- define the MVP shared data models and schemas

Deliverables:

- types or schemas for `AgentRequest`, `TaskPlan`, `SkillSpec`, `SandboxCall`, `MemoryRecord`, `Artifact`

Verification:

- typecheck passes
- sample objects can be parsed against schemas

### Phase 1. Agent Runtime Skeleton

#### Task 1.1 Create runtime module skeleton

Goal:

- scaffold `agent-core`, `skill-runtime`, `skill-system`, `sandbox`, and `memory`

Deliverables:

- runtime directories and entry files

Verification:

- runtime builds without implementation errors

#### Task 1.2 Implement request normalization

Goal:

- convert raw frontend input into a normalized runtime request

Deliverables:

- request normalizer module

Verification:

- unit test covers text-only and text-plus-files inputs

#### Task 1.3 Implement task orchestration entrypoint

Goal:

- create a single request handling pipeline in runtime

Deliverables:

- `handleRequest()` style entrypoint

Verification:

- calling the entrypoint returns a structured placeholder response

### Phase 2. Memory MVP

#### Task 2.1 Implement profile memory store

Goal:

- support reading and writing long-term profile memory

Deliverables:

- profile memory repository

Verification:

- test can save and load profile memory records

#### Task 2.2 Implement session memory store

Goal:

- support reading and writing per-session task memory

Deliverables:

- session memory repository

Verification:

- test can save and load session memory by session id

#### Task 2.3 Implement context builder

Goal:

- select relevant memory and build runtime context

Deliverables:

- context builder module

Verification:

- test confirms profile and session memory are merged into request context

### Phase 3. Skill System MVP

#### Task 3.1 Implement local skill registry

Goal:

- register and list local skills from a known directory

Deliverables:

- skill registry service

Verification:

- runtime can list at least one example skill

#### Task 3.2 Define skill manifest format

Goal:

- formalize the local/community-compatible skill manifest shape

Deliverables:

- skill manifest schema
- example skill manifest

Verification:

- invalid manifests fail validation
- valid manifests load successfully

#### Task 3.3 Implement skill enable/disable state

Goal:

- allow skills to be toggled without removing files

Deliverables:

- enable/disable state storage

Verification:

- disabled skills do not appear in the active skill list

### Phase 4. Skill Runtime MVP

#### Task 4.1 Implement skill execution state machine

Goal:

- execute skill steps in sequence and capture intermediate state

Deliverables:

- skill runtime executor

Verification:

- a sample multi-step skill can run from start to finish

#### Task 4.2 Implement LLM step executor

Goal:

- support `llm.generate`, `llm.check`, and `llm.rewrite` steps

Deliverables:

- LLM step executor interface and implementation stub

Verification:

- mocked LLM step tests pass

#### Task 4.3 Implement sandbox step executor bridge

Goal:

- route sandbox step definitions to sandbox providers

Deliverables:

- sandbox step adapter

Verification:

- a skill step of type `sandbox.fs.read` triggers the correct sandbox provider

### Phase 5. Sandbox MVP

#### Task 5.1 Implement sandbox fs provider

Goal:

- support file listing, reading, writing, and searching

Deliverables:

- fs provider

Verification:

- tests confirm read/write/search behavior in workspace paths

#### Task 5.2 Implement sandbox exec provider

Goal:

- support safe shell and runtime execution

Deliverables:

- exec provider

Verification:

- test command returns captured stdout and exit code

#### Task 5.3 Implement sandbox browser provider interface

Goal:

- define the browser provider contract even if initial implementation is mocked

Deliverables:

- browser provider interface

Verification:

- runtime can call browser provider methods through a stable interface

#### Task 5.4 Implement sandbox artifact provider

Goal:

- write text/json outputs and register artifacts

Deliverables:

- artifact provider

Verification:

- a skill can write an artifact and get a file reference back

#### Task 5.5 Implement sandbox trace logging

Goal:

- capture structured logs for every sandbox call

Deliverables:

- trace logging layer

Verification:

- tests confirm sandbox call records include provider, action, status, and timing

### Phase 6. Planning and Routing MVP

#### Task 6.1 Implement lightweight planner

Goal:

- generate a minimal `TaskPlan` for complex requests

Deliverables:

- planner module

Verification:

- test confirms a complex prompt returns structured plan data

#### Task 6.2 Implement skill router

Goal:

- select candidate skills based on task and skill metadata

Deliverables:

- skill router module

Verification:

- a request with known tags selects the expected example skill

#### Task 6.3 Implement result synthesizer

Goal:

- combine skill output, sandbox traces, and artifacts into final response shape

Deliverables:

- response synthesizer

Verification:

- end-to-end test returns final answer, trace summary, and artifact list

### Phase 7. Frontend MVP

#### Task 7.1 Create frontend app shell

Goal:

- create the basic app layout and navigation

Deliverables:

- frontend shell with placeholder panels

Verification:

- frontend app starts locally and shows all main sections

#### Task 7.2 Implement task input and file upload UI

Goal:

- submit text requests and files to the runtime

Deliverables:

- task form
- upload UI

Verification:

- frontend can submit a request payload visible in network or local handler logs

#### Task 7.3 Implement plan view

Goal:

- render plan data returned by runtime

Deliverables:

- plan panel

Verification:

- a mocked `TaskPlan` renders correctly in UI

#### Task 7.4 Implement execution trace view

Goal:

- render skill and sandbox execution states

Deliverables:

- trace panel

Verification:

- mocked trace data renders step status and provider info

#### Task 7.5 Implement profile, memory, and skills panels

Goal:

- expose profile memory and installed skills in UI

Deliverables:

- profile view
- memory view
- skills view

Verification:

- mocked data renders all three panels correctly

### Phase 8. First End-to-End Flow

#### Task 8.1 Create example skills

Goal:

- add one or two example skills for local testing

Deliverables:

- example skill files

Verification:

- skill registry loads them successfully

#### Task 8.2 Run first local end-to-end task

Goal:

- complete one request through frontend to final runtime response

Deliverables:

- working local demo flow

Verification:

- user submits a request and receives plan, trace, and final answer

#### Task 8.3 Persist memory after task completion

Goal:

- save task summary and updated session memory after execution

Deliverables:

- post-task memory writeback

Verification:

- finished task produces retrievable session memory entries

## 14. Recommended Build Order

Recommended implementation order:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8

This ordering ensures every phase has a concrete verification target and builds toward a working MVP.
