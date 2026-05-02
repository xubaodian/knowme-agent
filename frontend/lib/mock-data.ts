export const dashboardData = {
  agentName: "KnowMe Agent",
  persona: "Personal-theme manager agent with sandbox-first execution",
  profile: {
    tone: "Concise, structured, warm",
    defaultLanguage: "Chinese",
    planningMode: "Lightweight planner on complex tasks"
  },
  currentTask: {
    title: "Design a personal-theme agent and validate runtime execution",
    input: "希望支持 community skills，并把 browser、files、code 都通过 sandbox 统一执行。",
    attachments: ["architecture-plan.md", "community skill pack"],
    status: "Running",
    selectedSkills: ["summarize-file", "inspect-runtime"]
  },
  plan: [
    {
      id: "1",
      title: "Normalize request",
      description: "Extract goals, files, and required capabilities.",
      state: "completed"
    },
    {
      id: "2",
      title: "Select skills",
      description: "Resolve active manifests and route to matching skills.",
      state: "completed"
    },
    {
      id: "3",
      title: "Execute sandbox steps",
      description: "Run fs, exec, code, and browser capabilities through providers.",
      state: "running"
    },
    {
      id: "4",
      title: "Write memory",
      description: "Persist task summary and updated profile context.",
      state: "pending"
    }
  ],
  traces: [
    {
      provider: "fs",
      capability: "fs.read",
      status: "completed",
      detail: "Read architecture-plan.md and passed content to skill runtime."
    },
    {
      provider: "exec",
      capability: "exec.run",
      status: "completed",
      detail: "Executed `node --version` and captured stdout."
    },
    {
      provider: "codeInterpreter",
      capability: "code.run",
      status: "completed",
      detail: "Executed JavaScript snippet and returned structured output."
    }
  ],
  artifacts: [
    {
      name: "summary.txt",
      type: "text",
      location: "examples/artifacts/summary.txt"
    }
  ],
  memory: [
    {
      scope: "profile",
      content: "Prefer concise output."
    },
    {
      scope: "session",
      content: "Completed request with skill Inspect Runtime."
    }
  ],
  skills: [
    {
      id: "summarize-file",
      name: "Summarize File",
      source: "local-example",
      enabled: true
    },
    {
      id: "inspect-runtime",
      name: "Inspect Runtime",
      source: "community-example",
      enabled: true
    }
  ]
};
