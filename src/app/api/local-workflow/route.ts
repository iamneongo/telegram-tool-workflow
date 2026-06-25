import { NextResponse } from "next/server";
import {
  type AllowedTopicConfig,
  type MessageTemplateConfig,
  type TargetRoutingMode,
  getLocalWorkflowStatus,
  probeWorkflowInventory,
  refreshWorkflowInventory,
  startLocalWorkflow,
  stopLocalWorkflow,
} from "@/lib/local-workflow-runtime";

export const dynamic = "force-dynamic";

type RequestBody = {
  action?: "start" | "stop" | "status" | "probe" | "refreshInventory";
  token?: string;
  allowedTopics?: AllowedTopicConfig[];
  approvalTarget?: AllowedTopicConfig;
  approvalTargetMode?: TargetRoutingMode;
  forwardTarget?: AllowedTopicConfig;
  forwardTargetMode?: TargetRoutingMode;
  forwardTargets?: Array<{
    nodeName: string;
    target?: AllowedTopicConfig;
    keywords?: string;
    routeMode?: TargetRoutingMode;
  }>;
  messageTemplates?: MessageTemplateConfig[];
};

function getToken(body: RequestBody) {
  return body.token?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

export async function GET() {
  return NextResponse.json({ ok: true, status: await getLocalWorkflowStatus() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const action = body.action ?? "status";

    if (action === "start") {
      const status = await startLocalWorkflow({
        token: getToken(body),
        allowedTopics: body.allowedTopics,
        approvalTarget: body.approvalTarget,
        approvalTargetMode: body.approvalTargetMode,
        forwardTarget: body.forwardTarget,
        forwardTargetMode: body.forwardTargetMode,
        forwardTargets: body.forwardTargets,
        messageTemplates: body.messageTemplates,
      });
      return NextResponse.json({ ok: true, status });
    }

    if (action === "stop") {
      const status = await stopLocalWorkflow();
      return NextResponse.json({ ok: true, status });
    }

    if (action === "probe") {
      const result = await probeWorkflowInventory({ token: getToken(body) });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "refreshInventory") {
      const status = await refreshWorkflowInventory();
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ ok: true, status: await getLocalWorkflowStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không điều khiển được local workflow.";
    return NextResponse.json({ ok: false, error: message, status: await getLocalWorkflowStatus() }, { status: 500 });
  }
}
