import { NextResponse } from "next/server";
import {
  getLocalWorkflowStatus,
  startLocalWorkflow,
  stopLocalWorkflow,
} from "@/lib/local-workflow-runtime";

type RequestBody = {
  action?: "start" | "stop" | "status";
  token?: string;
};

function getToken(body: RequestBody) {
  return body.token?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export async function GET() {
  return NextResponse.json({ ok: true, status: getLocalWorkflowStatus() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const action = body.action ?? "status";

    if (action === "start") {
      const status = await startLocalWorkflow({ token: getToken(body) });
      return NextResponse.json({ ok: true, status });
    }

    if (action === "stop") {
      const status = stopLocalWorkflow();
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ ok: true, status: getLocalWorkflowStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không điều khiển được local workflow.";
    return NextResponse.json({ ok: false, error: message, status: getLocalWorkflowStatus() }, { status: 500 });
  }
}

