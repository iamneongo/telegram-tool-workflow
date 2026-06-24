import { NextResponse } from "next/server";
import { recordWorkflowSnapshotInventory } from "@/lib/local-workflow-runtime";
import { deleteTelegramWebhook, scanTelegramWorkflow, TelegramApiError } from "@/lib/telegram";

type RequestBody = {
  action?: "scan" | "deleteWebhook";
  token?: string;
  deepScan?: boolean;
};

function getToken(body: RequestBody) {
  return body.token?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function isLikelyTelegramToken(token: string) {
  return /^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(token);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const action = body.action ?? "scan";
    const token = getToken(body);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Thiếu bot token. Hãy nhập token hoặc đặt TELEGRAM_BOT_TOKEN." },
        { status: 400 },
      );
    }

    if (!isLikelyTelegramToken(token)) {
      return NextResponse.json(
        { ok: false, error: "Bot token có vẻ không đúng định dạng. Hãy kiểm tra lại." },
        { status: 400 },
      );
    }

    if (action === "deleteWebhook") {
      const result = await deleteTelegramWebhook(token);
      return NextResponse.json({ ok: true, result });
    }

    const result = await scanTelegramWorkflow(token, { deepScan: Boolean(body.deepScan) });
    const inventory = recordWorkflowSnapshotInventory(result);
    return NextResponse.json({ ok: true, ...result, inventory });
  } catch (error) {
    if (error instanceof TelegramApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message = error instanceof Error ? error.message : "Không thể thực hiện yêu cầu Telegram.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
