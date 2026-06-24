import { NextResponse } from "next/server";
import { TelegramApiError, scanTelegramBot } from "@/lib/telegram";

type RequestBody = {
  token?: string;
  deepScan?: boolean;
};

function isLikelyTelegramToken(token: string) {
  return /^\d{6,12}:[A-Za-z0-9_-]{20,}$/.test(token);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const token = body.token?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim() || "";

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

    const result = await scanTelegramBot(token, { deepScan: Boolean(body.deepScan) });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof TelegramApiError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode },
      );
    }

    const message = error instanceof Error ? error.message : "Không thể quét bot Telegram.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
