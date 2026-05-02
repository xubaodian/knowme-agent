import { FileSystemSkillRegistry } from "../agent-runtime/src/skill-system/file-system-skill-registry.ts";

const registry = new FileSystemSkillRegistry(
  "/Users/bytedance/projects/ai-projects/knowme-agent/skills",
  "/Users/bytedance/projects/ai-projects/knowme-agent/examples/.skill-registry-state.json"
);

const before = await registry.listEntries();
await registry.setEnabled?.("inspect-runtime", false);
const disabled = await registry.listEntries();
const activeAfterDisable = (await registry.listEntries())
  .filter((entry) => entry.enabled)
  .map((entry) => entry.skillId);
await registry.setEnabled?.("inspect-runtime", true);
const restored = await registry.listEntries();

console.log(
  JSON.stringify(
    {
      before,
      disabled,
      activeAfterDisable,
      restored
    },
    null,
    2
  )
);
