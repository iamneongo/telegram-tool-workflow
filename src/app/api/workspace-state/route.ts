import { NextResponse } from "next/server";
import { createDefaultWorkspaceRecord, readWorkspaceRecord, writeWorkspaceRecord, type WorkspaceRecordPatch } from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = WorkspaceRecordPatch;

export async function GET() {
  try {
    const result = await readWorkspaceRecord();
    return NextResponse.json({ ok: true, state: result.record, exists: result.exists });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không đọc được workspace state.";
    return NextResponse.json({ ok: false, error: message, state: createDefaultWorkspaceRecord(), exists: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const state = await writeWorkspaceRecord(body);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không lưu được workspace state.";
    return NextResponse.json({ ok: false, error: message, state: createDefaultWorkspaceRecord() }, { status: 500 });
  }
}
