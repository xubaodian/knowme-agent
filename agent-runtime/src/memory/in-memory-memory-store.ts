import type { MemoryRecord } from "../shared.ts";
import type { MemoryStore } from "../runtime/types.ts";

export class InMemoryMemoryStore implements MemoryStore {
  private readonly records: MemoryRecord[];

  constructor(records: MemoryRecord[] = []) {
    this.records = records;
  }

  async listProfileMemory(userId: string): Promise<MemoryRecord[]> {
    return this.records.filter((record) => record.userId === userId && record.scope === "profile");
  }

  async listSessionMemory(sessionId: string): Promise<MemoryRecord[]> {
    return this.records.filter((record) => record.sessionId === sessionId && record.scope === "session");
  }

  async write(record: MemoryRecord): Promise<void> {
    this.records.push(record);
  }
}
