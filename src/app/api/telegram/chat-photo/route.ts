import { readWorkspaceRecord } from "@/lib/workspace-store";
import { fetchTelegramGroupAvatarCache } from "@/lib/telegram";
import { writeWorkspaceRecord } from "@/lib/workspace-store";

function parseChatId(value: string | null) {
  if (!value) {
    return null;
  }

  const chatId = Number(value);
  return Number.isFinite(chatId) ? chatId : null;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPlaceholderSvg(label: string, chatId: number) {
  const cleanLabel = label.trim() || `Chat ${chatId}`;
  const initial = cleanLabel.replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";
  const safeLabel = escapeXml(cleanLabel);
  const safeInitial = escapeXml(initial);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="${safeLabel}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2937"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="48" fill="url(#bg)"/>
  <circle cx="48" cy="48" r="30" fill="#334155" opacity="0.9"/>
  <text x="48" y="56" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#e2e8f0">${safeInitial}</text>
</svg>`;
}

function placeholderResponse(label: string, chatId: number, reason: string) {
  return new Response(buildPlaceholderSvg(label, chatId), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff",
      "x-chat-photo-source": "placeholder",
      "x-chat-photo-reason": reason,
    },
  });
}

export async function GET(request: Request) {
  try {
    const chatId = parseChatId(new URL(request.url).searchParams.get("chatId"));
    if (chatId === null) {
      return placeholderResponse("Chat", 0, "invalid-chat-id");
    }

    const { record } = await readWorkspaceRecord();
    const group = record.inventory.groups.find((item) => item.chatId === chatId);
    const label = group?.chatTitle ?? `Chat ${chatId}`;

    if (!group?.photoDataBase64) {
      const token = record.ui.token?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
      if (!token) {
        return placeholderResponse(label, chatId, "missing-token");
      }

      const avatar = await fetchTelegramGroupAvatarCache(token, chatId);
      if (!avatar.photoDataBase64) {
        return placeholderResponse(label, chatId, "missing-cache");
      }

      const nextGroups = record.inventory.groups.map((item) =>
        item.chatId === chatId
          ? {
              ...item,
              photoFileId: avatar.photoFileId,
              photoContentType: avatar.photoContentType,
              photoDataBase64: avatar.photoDataBase64,
              photoSyncedAt: avatar.photoSyncedAt,
            }
          : item,
      );

      await writeWorkspaceRecord({
        inventory: {
          ...record.inventory,
          groups: nextGroups,
          updatedAt: new Date().toISOString(),
        },
      });

      const bytes = Buffer.from(avatar.photoDataBase64, "base64");
      return new Response(bytes, {
        headers: {
          "content-type": avatar.photoContentType || "image/jpeg",
          "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
          "x-chat-photo-source": "telegram-live",
          "x-chat-photo-reason": "cache-miss",
          "x-chat-photo-bytes": String(bytes.byteLength),
          "x-chat-photo-synced-at": avatar.photoSyncedAt || "",
        },
      });
    }

    const bytes = Buffer.from(group.photoDataBase64, "base64");
    return new Response(bytes, {
      headers: {
        "content-type": group.photoContentType || "image/jpeg",
        "cache-control": "private, max-age=86400, stale-while-revalidate=604800",
        "x-chat-photo-source": "db-cache",
        "x-chat-photo-reason": "ok",
        "x-chat-photo-bytes": String(bytes.byteLength),
        "x-chat-photo-synced-at": group.photoSyncedAt || "",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat";
    return placeholderResponse(message, 0, "error");
  }
}
