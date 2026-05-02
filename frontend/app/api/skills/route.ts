import { NextResponse } from "next/server";
import { getDemoRuntimeService } from "../../../../agent-runtime/src/index";

export async function POST(request: Request) {
  const payload = (await request.json()) as { skillId: string; enabled: boolean };
  const snapshot = await getDemoRuntimeService().setSkillEnabled(payload.skillId, payload.enabled);
  return NextResponse.json(snapshot);
}
