"use client";

import { startTransition, useEffect, useState } from "react";
import type { DashboardSnapshot } from "../../shared/src/index";
import { dashboardData } from "../lib/mock-data";

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-inner">
        <h2 className="section-title">{props.title}</h2>
        {props.children}
      </div>
    </section>
  );
}

const initialSnapshot: DashboardSnapshot = {
  ...dashboardData
};

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(initialSnapshot);
  const [message, setMessage] = useState(initialSnapshot.currentTask.input);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSnapshot() {
    setError(null);
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load dashboard snapshot");
    }

    const data = (await response.json()) as DashboardSnapshot;
    setSnapshot(data);
    setMessage(data.currentTask.input);
  }

  useEffect(() => {
    startTransition(() => {
      loadSnapshot()
        .catch((loadError) => {
          setError(loadError instanceof Error ? loadError.message : "Unknown dashboard error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    });
  }, []);

  async function runTask() {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/runtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error("Failed to run task");
      }

      await loadSnapshot();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unknown runtime error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleSkill(skillId: string, enabled: boolean) {
    setError(null);
    try {
      const response = await fetch("/api/skills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ skillId, enabled })
      });

      if (!response.ok) {
        throw new Error("Failed to update skill state");
      }

      const data = (await response.json()) as DashboardSnapshot;
      setSnapshot(data);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unknown skill update error");
    }
  }

  return (
    <div className="workspace-shell">
      <section className="hero panel">
        <div className="panel-inner hero-copy">
          <div className="badge-row">
            <span className="badge accent-badge">Single Manager Agent</span>
            <span className="badge">Sandbox-first</span>
            <span className="badge">Community skill compatible</span>
          </div>
          <h1 className="hero-title">{snapshot.agentName}</h1>
          <p>{snapshot.persona}</p>
          <div className="status-row">
            <span className="badge">Tone: {snapshot.profile.tone}</span>
            <span className="badge">Language: {snapshot.profile.defaultLanguage}</span>
            <span className="badge">Planner: {snapshot.profile.planningMode}</span>
            {isLoading ? <span className="badge">Loading workspace...</span> : null}
            {error ? <span className="badge accent-badge">{error}</span> : null}
          </div>
        </div>
        <div className="panel-inner">
          <div className="kpi-grid">
            <div className="kpi-card">
              <span>Active Skills</span>
              <strong>{snapshot.skills.filter((skill) => skill.enabled).length}</strong>
            </div>
            <div className="kpi-card">
              <span>Sandbox Calls</span>
              <strong>{snapshot.traces.length}</strong>
            </div>
            <div className="kpi-card">
              <span>Artifacts</span>
              <strong>{snapshot.artifacts.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="workspace-grid">
        <div className="stack">
          <Panel title="Task Workspace">
            <div className="input-card">
              <textarea
                className="composer"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="action-row">
                <div className="badge-row">
                  {snapshot.currentTask.attachments.map((item) => (
                    <span key={item} className="badge">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="badge-row">
                  <button className="button" onClick={() => void runTask()} disabled={isSubmitting}>
                    {isSubmitting ? "Running..." : "Run Task"}
                  </button>
                  <button className="button button-secondary" disabled>
                    Upload Files
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Plan">
            <div className="timeline">
              {snapshot.plan.map((step) => (
                <div key={step.id} className="timeline-step">
                  <div className="timeline-marker">{step.id}</div>
                  <div className="list-item">
                    <strong>{step.title}</strong>
                    <div className="muted">{step.description}</div>
                    <div style={{ marginTop: 8 }}>
                      <span className="pill">{step.state}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Execution Trace">
            <div className="list">
              {snapshot.traces.map((trace) => (
                <div key={`${trace.provider}-${trace.capability}`} className="list-item">
                  <strong>
                    {trace.provider} · {trace.capability}
                  </strong>
                  <div className="muted">{trace.detail}</div>
                  <div style={{ marginTop: 8 }}>
                    <span className="pill">{trace.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Current Task">
            <div className="list-item">
              <strong>{snapshot.currentTask.title}</strong>
              <div className="muted">Status: {snapshot.currentTask.status}</div>
              <div className="badge-row" style={{ marginTop: 12 }}>
                {snapshot.currentTask.selectedSkills.map((skill) => (
                  <span key={skill} className="badge">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Artifacts">
            <div className="list">
              {snapshot.artifacts.map((artifact) => (
                <div key={artifact.name} className="list-item">
                  <strong>{artifact.name}</strong>
                  <div className="muted">
                    {artifact.type} · {artifact.location}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Profile & Memory">
            <div className="split">
              <div className="list">
                {snapshot.memory.map((item, index) => (
                  <div key={`${item.scope}-${index}`} className="list-item">
                    <strong>{item.scope}</strong>
                    <div className="muted">{item.content}</div>
                  </div>
                ))}
              </div>
              <div className="list">
                {snapshot.skills.map((skill) => (
                  <div key={skill.name} className="list-item">
                    <strong>{skill.name}</strong>
                    <div className="muted">{skill.source}</div>
                    <div className="action-row" style={{ marginTop: 8 }}>
                      <span className="pill">{skill.enabled ? "enabled" : "disabled"}</span>
                      <button
                        className="button button-secondary"
                        onClick={() => void toggleSkill(skill.id, !skill.enabled)}
                      >
                        {skill.enabled ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Response Preview">
            <div className="list-item">
              <strong>Manager agent summary</strong>
              <div className="muted">
                {snapshot.latestResponse?.summary ??
                  "Run a task to see the live runtime response here."}
              </div>
              <div className="code-box">
                {JSON.stringify(
                  snapshot.latestResponse
                    ? {
                        selectedSkillIds: snapshot.latestResponse.selectedSkillIds,
                        sandboxCalls: snapshot.latestResponse.sandboxCalls.length,
                        memoryWrites: snapshot.latestResponse.memoryWrites.length
                      }
                    : {
                        selectedSkillIds: snapshot.currentTask.selectedSkills,
                        sandboxCalls: snapshot.traces.length,
                        memoryWrites: snapshot.memory.length
                      },
                  null,
                  2
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
