import type { JsonValue } from "../../shared.ts";
import type { SandboxCallInput, SandboxExecutionResult, SandboxProvider } from "../../runtime/types.ts";

interface BrowserRef extends Record<string, JsonValue> {
  ref: string;
  role: string;
  label: string;
}

interface BrowserTabState {
  id: string;
  url: string;
  title: string;
  content: string;
  refs: BrowserRef[];
  snapshotVersion: number;
  lastSnapshotVersion?: number;
}

interface BrowserSessionState {
  activeTabId?: string;
  tabs: Map<string, BrowserTabState>;
}

function buildTabState(url: string, existingId?: string): BrowserTabState {
  const safeUrl = url.trim();
  const title = `Mock page for ${safeUrl}`;
  return {
    id: existingId ?? `tab_${Math.random().toString(36).slice(2, 8)}`,
    url: safeUrl,
    title,
    content: [
      `Page title: ${title}`,
      `Current URL: ${safeUrl}`,
      "Visible sections:",
      "- Overview",
      "- Details",
      "- Call to action"
    ].join("\n"),
    refs: [
      { ref: "page.heading", role: "heading", label: title },
      { ref: "page.details", role: "section", label: "Details section" },
      { ref: "page.primary_button", role: "button", label: "Primary action" }
    ],
    snapshotVersion: 0
  };
}

export class BrowserSandboxProvider implements SandboxProvider {
  readonly name = "local";
  readonly capabilityPrefix = "browser.";

  private readonly sessions = new Map<string, BrowserSessionState>();

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    const session = this.getSession(input.request.sessionId);

    switch (input.capability) {
      case "browser.open":
        return this.open(session, input);
      case "browser.snapshot":
        return this.snapshot(session, input);
      case "browser.act":
        return this.act(session, input);
      case "browser.extract":
        return this.extract(session, input);
      case "browser.screenshot":
        return this.screenshot(session, input);
      default:
        return {
          output: `Unsupported browser capability: ${input.capability}`
        };
    }
  }

  private getSession(sessionId: string): BrowserSessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        tabs: new Map<string, BrowserTabState>()
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  private getActiveTab(session: BrowserSessionState, tabId?: string): BrowserTabState {
    const resolvedId = tabId ?? session.activeTabId;
    if (!resolvedId) {
      throw new Error("No active browser tab. Call browser_open first.");
    }

    const tab = session.tabs.get(resolvedId);
    if (!tab) {
      throw new Error(`Unknown browser tab: ${resolvedId}`);
    }

    return tab;
  }

  private async open(
    session: BrowserSessionState,
    input: SandboxCallInput
  ): Promise<SandboxExecutionResult> {
    const url = input.input.url;
    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error("browser_open requires a non-empty url");
    }

    const tab = buildTabState(url);
    session.tabs.set(tab.id, tab);
    session.activeTabId = tab.id;

    return {
      output: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title
      }
    };
  }

  private async snapshot(
    session: BrowserSessionState,
    input: SandboxCallInput
  ): Promise<SandboxExecutionResult> {
    const tabId = typeof input.input.tabId === "string" ? input.input.tabId : undefined;
    const tab = this.getActiveTab(session, tabId);
    tab.snapshotVersion += 1;
    tab.lastSnapshotVersion = tab.snapshotVersion;

    return {
      output: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        snapshotVersion: tab.snapshotVersion,
        refs: tab.refs
      }
    };
  }

  private async act(
    session: BrowserSessionState,
    input: SandboxCallInput
  ): Promise<SandboxExecutionResult> {
    const tab = this.getActiveTab(session);
    if (!tab.lastSnapshotVersion) {
      throw new Error("browser_act requires a prior browser_snapshot");
    }

    const ref = input.input.ref;
    const action = input.input.action;

    if (typeof ref !== "string" || typeof action !== "string") {
      throw new Error("browser_act requires string ref and action");
    }

    const knownRef = tab.refs.find((entry) => entry.ref === ref);
    if (!knownRef) {
      throw new Error(`Unknown browser ref "${ref}". Take a fresh snapshot first.`);
    }

    const details = [
      `Performed ${action} on ${knownRef.label}`,
      typeof input.input.text === "string" ? `text=${input.input.text}` : "",
      typeof input.input.option === "string" ? `option=${input.input.option}` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    tab.content = `${tab.content}\nAction log: ${details}`;

    return {
      output: {
        tabId: tab.id,
        ref,
        action,
        status: "ok",
        details
      }
    };
  }

  private async extract(
    session: BrowserSessionState,
    input: SandboxCallInput
  ): Promise<SandboxExecutionResult> {
    const tab = this.getActiveTab(session);
    const goal = typeof input.input.goal === "string" ? input.input.goal : "Extract visible page content";
    const ref = typeof input.input.ref === "string" ? input.input.ref : undefined;

    return {
      output: {
        tabId: tab.id,
        url: tab.url,
        goal,
        ref: ref ?? null,
        content: tab.content,
        availableRefs: tab.refs
      }
    };
  }

  private async screenshot(
    session: BrowserSessionState,
    input: SandboxCallInput
  ): Promise<SandboxExecutionResult> {
    const tab = this.getActiveTab(session);
    const ref = typeof input.input.ref === "string" ? input.input.ref : undefined;
    const fullPage = input.input.fullPage === true;

    return {
      output: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
        ref: ref ?? null,
        fullPage,
        screenshotLabel: `mock-screenshot:${tab.id}:${ref ?? "full-page"}`
      }
    };
  }
}
