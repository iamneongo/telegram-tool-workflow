import { readWorkspaceRecord } from "@/lib/workspace-store";
import { telegramRequest } from "@/lib/telegram";

type TelegramFile = {
  file_path?: string;
};

type TelegramChatPhoto = {
  small_file_id?: string;
  big_file_id?: string;
};

type TelegramChatInfo = {
  photo?: TelegramChatPhoto;
};

function getTelegramFileUrl(token: string, filePath: string) {
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

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
      "cache-control": "no-store",
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
      console.log("[chat-photo] invalid chatId");
      return placeholderResponse("Chat", 0, "invalid-chat-id");
    }

    const { record } = await readWorkspaceRecord();
    const groupLabel = record.inventory.groups.find((group) => group.chatId === chatId)?.chatTitle ?? `Chat ${chatId}`;
    const token = record.ui.token.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
    console.log("[chat-photo] request", {
      chatId,
      groupLabel,
      hasToken: Boolean(token),
    });
    if (!token) {
      console.log("[chat-photo] fallback placeholder", { chatId, reason: "missing-token" });
      return placeholderResponse(groupLabel, chatId, "missing-token");
    }

    const cachedPhotoFileId = record.inventory.groups.find((group) => group.chatId === chatId)?.photoFileId ?? null;
    let photoFileId = cachedPhotoFileId;
    console.log("[chat-photo] cached photoFileId", { chatId, cachedPhotoFileId });

    if (!photoFileId) {
      const chat = await telegramRequest<TelegramChatInfo>(token, "getChat", { chat_id: chatId });
      photoFileId = chat.photo?.big_file_id ?? chat.photo?.small_file_id ?? null;
      console.log("[chat-photo] getChat result", {
        chatId,
        hasPhoto: Boolean(chat.photo),
        photo: chat.photo
          ? {
              small_file_id: chat.photo.small_file_id ?? null,
              big_file_id: chat.photo.big_file_id ?? null,
            }
          : null,
        resolvedPhotoFileId: photoFileId,
      });
    }

    if (!photoFileId) {
      console.log("[chat-photo] fallback placeholder", { chatId, reason: "no-photo-file-id" });
      return placeholderResponse(groupLabel, chatId, "no-photo-file-id");
    }

    const file = await telegramRequest<TelegramFile>(token, "getFile", { file_id: photoFileId });
    console.log("[chat-photo] getFile result", {
      chatId,
      photoFileId,
      filePath: file.file_path ?? null,
    });
    if (!file.file_path) {
      console.log("[chat-photo] fallback placeholder", { chatId, reason: "missing-file-path" });
      return placeholderResponse(groupLabel, chatId, "missing-file-path");
    }

    const response = await fetch(getTelegramFileUrl(token, file.file_path), { cache: "no-store" });
    console.log("[chat-photo] fetch telegram file", {
      chatId,
      photoFileId,
      filePath: file.file_path,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type"),
    });
    if (!response.ok) {
      console.log("[chat-photo] fallback placeholder", { chatId, reason: "telegram-file-fetch-failed" });
      return placeholderResponse(groupLabel, chatId, "telegram-file-fetch-failed");
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-chat-photo-source": "telegram",
        "x-chat-photo-reason": "ok",
        "x-chat-photo-file-id": photoFileId,
        "x-chat-photo-file-path": file.file_path,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat";
    console.log("[chat-photo] error", { message });
    return placeholderResponse(message, 0, "error");
  }
}
