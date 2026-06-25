import { NextResponse } from "next/server";
import { recordWorkflowSnapshotInventory } from "@/lib/local-workflow-runtime";
import {
  deleteTelegramWebhook,
  fetchTelegramGroupAvatarCache,
  scanTelegramWorkflow,
  TelegramApiError,
} from "@/lib/telegram";
import { readWorkspaceRecord, writeWorkspaceRecord } from "@/lib/workspace-store";

type RequestBody = {
  action?: "scan" | "deleteWebhook" | "syncAvatar";
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

    if (action === "syncAvatar") {
      const workspace = await readWorkspaceRecord();
      const groups = workspace.record.inventory.groups;

      if (groups.length === 0) {
        return NextResponse.json({ ok: true, syncedCount: 0, inventory: workspace.record.inventory });
      }

      let syncedCount = 0;
      const nextGroups = [];

      for (const group of groups) {
        const avatar = await fetchTelegramGroupAvatarCache(token, group.chatId);
        const nextGroup = {
          ...group,
          photoFileId: avatar.photoFileId,
          photoContentType: avatar.photoContentType,
          photoDataBase64: avatar.photoDataBase64,
          photoSyncedAt: avatar.photoSyncedAt,
        };
        if (avatar.photoDataBase64) {
          syncedCount += 1;
        }
        nextGroups.push(nextGroup);
      }

      const inventory = {
        ...workspace.record.inventory,
        groups: nextGroups,
        updatedAt: new Date().toISOString(),
      };

      await writeWorkspaceRecord({ inventory });
      return NextResponse.json({ ok: true, syncedCount, inventory });
    }

    const result = await scanTelegramWorkflow(token, { deepScan: Boolean(body.deepScan) });
    const inventory = await recordWorkflowSnapshotInventory(result);
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
