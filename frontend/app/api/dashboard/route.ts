import { NextResponse } from "next/server";
import { getDemoRuntimeService } from "../../../../agent-runtime/src/index";

export async function GET() {
  const snapshot = await getDemoRuntimeService().getSnapshot();
  return NextResponse.json(snapshot);
}

