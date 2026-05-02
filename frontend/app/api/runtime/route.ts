import { NextResponse } from "next/server";
import type { RunTaskPayload } from "../../../../shared/src/index";
import { getDemoRuntimeService } from "../../../../agent-runtime/src/index";

export async function POST(request: Request) {
  const payload = (await request.json()) as RunTaskPayload;
  const response = await getDemoRuntimeService().runTask(payload);
  return NextResponse.json(response);
}

