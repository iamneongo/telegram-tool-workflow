import { neon } from "@neondatabase/serverless";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TelegramWorkflowSnapshot } from "@/lib/telegram";

type JsonRecord = Record<string, unknown>;

export type WorkflowInventory = {
  groups: {
    chatId: number;
    chatTitle: string;
    chatType: string;
    photoFileId?: string | null;
    photoContentType?: string | null;
    photoDataBase64?: string | null;
    photoSyncedAt?: string | null;
  }[];
  topics: { chatId: number; threadId: number; chatTitle: string; topicName: string }[];
  updatedAt: string | null;
};

export type WorkspaceUiState = {
  token: string;
  deepScan: boolean;
  autoPoll: boolean;
  settingsOpen: boolean;
  configOpen: boolean;
  configPanelTab: string;
  configPanelExpanded: boolean;
  paletteOpen: boolean;
  selectedNodeId: string;
  selectedEdgeId: string | null;
  nodeConfigs: JsonRecord[];
  edges: JsonRecord[];
  snapshot: TelegramWorkflowSnapshot | null;
  runtimeStatus: JsonRecord | null;
};

export type WorkspaceRecord = {
  version: 1;
  updatedAt: string;
  ui: WorkspaceUiState;
  inventory: WorkflowInventory;
};

export type WorkspaceRecordPatch = {
  ui?: Partial<WorkspaceUiState>;
  inventory?: Partial<WorkflowInventory>;
};

const STORAGE_KEY = "telegram-workflow-workspace";
const LEGACY_INVENTORY_PATH = path.join(process.cwd(), ".telegram-workflow-inventory.json");

let sqlClient: ReturnType<typeof neon> | null = null;
let tableReady = false;

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
}

function getSqlClient() {
  if (sqlClient) {
    return sqlClient;
  }

  const url = getDatabaseUrl();
  if (!url) {
    return null;
  }

  sqlClient = neon(url);
  return sqlClient;
}

function createDefaultInventory(): WorkflowInventory {
  return {
    groups: [],
    topics: [],
    updatedAt: null,
  };
}

function createDefaultWorkspaceUi(): WorkspaceUiState {
  return {
    token: "",
    deepScan: true,
    autoPoll: true,
    settingsOpen: false,
    configOpen: false,
    configPanelTab: "target",
    configPanelExpanded: false,
    paletteOpen: true,
    selectedNodeId: "9bfb1a1e-2ae7-41f8-aa01-c8bb9a90a1de",
    selectedEdgeId: null,
    nodeConfigs: [],
    edges: [],
    snapshot: null,
    runtimeStatus: null,
  };
}

export function createDefaultWorkspaceRecord(): WorkspaceRecord {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    ui: createDefaultWorkspaceUi(),
    inventory: createDefaultInventory(),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeInventory(raw: unknown): WorkflowInventory {
  const fallback = createDefaultInventory();
  if (!isRecord(raw)) {
    return fallback;
  }

  const groups = Array.isArray(raw.groups)
    ? raw.groups
        .map((item) => {
          if (!isRecord(item)) return null;
          const chatId = Number(item.chatId);
          if (!Number.isFinite(chatId)) return null;
          return {
            chatId,
            chatTitle: String(item.chatTitle || `Chat ${chatId}`),
            chatType: String(item.chatType || "group"),
            photoFileId: typeof item.photoFileId === "string" ? item.photoFileId : item.photoFileId === null ? null : undefined,
            photoContentType:
              typeof item.photoContentType === "string" ? item.photoContentType : item.photoContentType === null ? null : undefined,
            photoDataBase64:
              typeof item.photoDataBase64 === "string" ? item.photoDataBase64 : item.photoDataBase64 === null ? null : undefined,
            photoSyncedAt:
              typeof item.photoSyncedAt === "string" ? item.photoSyncedAt : item.photoSyncedAt === null ? null : undefined,
          };
        })
        .filter(
          (item): item is {
            chatId: number;
            chatTitle: string;
            chatType: string;
            photoFileId: string | null | undefined;
            photoContentType: string | null | undefined;
            photoDataBase64: string | null | undefined;
            photoSyncedAt: string | null | undefined;
          } => Boolean(item),
        )
    : fallback.groups;

  const topics = Array.isArray(raw.topics)
    ? raw.topics
        .map((item) => {
          if (!isRecord(item)) return null;
          const chatId = Number(item.chatId);
          const threadId = Number(item.threadId);
          if (!Number.isFinite(chatId) || !Number.isFinite(threadId)) return null;
          return {
            chatId,
            threadId,
            chatTitle: String(item.chatTitle || `Chat ${chatId}`),
            topicName: String(item.topicName || `Topic ${threadId}`),
          };
        })
        .filter((item): item is { chatId: number; threadId: number; chatTitle: string; topicName: string } => Boolean(item))
    : fallback.topics;

  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt;

  return { groups, topics, updatedAt };
}

function sanitizeWorkspaceUi(raw: unknown): WorkspaceUiState {
  const fallback = createDefaultWorkspaceUi();
  if (!isRecord(raw)) {
    return fallback;
  }

  const nodeConfigs = Array.isArray(raw.nodeConfigs) ? raw.nodeConfigs.filter(isRecord) : fallback.nodeConfigs;
  const edges = Array.isArray(raw.edges) ? raw.edges.filter(isRecord) : fallback.edges;

  return {
    token: typeof raw.token === "string" ? raw.token : fallback.token,
    deepScan: typeof raw.deepScan === "boolean" ? raw.deepScan : fallback.deepScan,
    autoPoll: typeof raw.autoPoll === "boolean" ? raw.autoPoll : fallback.autoPoll,
    settingsOpen: typeof raw.settingsOpen === "boolean" ? raw.settingsOpen : fallback.settingsOpen,
    configOpen: typeof raw.configOpen === "boolean" ? raw.configOpen : fallback.configOpen,
    configPanelTab: typeof raw.configPanelTab === "string" ? raw.configPanelTab : fallback.configPanelTab,
    configPanelExpanded:
      typeof raw.configPanelExpanded === "boolean" ? raw.configPanelExpanded : fallback.configPanelExpanded,
    paletteOpen: typeof raw.paletteOpen === "boolean" ? raw.paletteOpen : fallback.paletteOpen,
    selectedNodeId: typeof raw.selectedNodeId === "string" ? raw.selectedNodeId : fallback.selectedNodeId,
    selectedEdgeId:
      typeof raw.selectedEdgeId === "string"
        ? raw.selectedEdgeId
        : raw.selectedEdgeId === null
          ? null
          : fallback.selectedEdgeId,
    nodeConfigs,
    edges,
    snapshot: isRecord(raw.snapshot) || raw.snapshot === null ? (raw.snapshot as TelegramWorkflowSnapshot | null) : fallback.snapshot,
    runtimeStatus: isRecord(raw.runtimeStatus) || raw.runtimeStatus === null ? (raw.runtimeStatus as JsonRecord | null) : fallback.runtimeStatus,
  };
}

function sanitizeWorkspaceRecord(raw: unknown): WorkspaceRecord {
  const fallback = createDefaultWorkspaceRecord();
  if (!isRecord(raw)) {
    return fallback;
  }

  return {
    version: 1,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt,
    ui: sanitizeWorkspaceUi(raw.ui),
    inventory: sanitizeInventory(raw.inventory),
  };
}

function readLegacyInventoryFile(): WorkflowInventory | null {
  try {
    if (!existsSync(LEGACY_INVENTORY_PATH)) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(LEGACY_INVENTORY_PATH, "utf8")) as Partial<WorkflowInventory>;
    const inventory = sanitizeInventory(parsed);
    if (inventory.groups.length === 0 && inventory.topics.length === 0) {
      return null;
    }

    return inventory;
  } catch {
    return null;
  }
}

async function ensureTable(sql: ReturnType<typeof neon>) {
  if (tableReady) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS telegram_workflow_state (
      state_key text PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  tableReady = true;
}

async function upsertWorkspacePayload(sql: ReturnType<typeof neon>, record: WorkspaceRecord) {
  await ensureTable(sql);
  await sql`
    INSERT INTO telegram_workflow_state (state_key, payload, updated_at)
    VALUES (${STORAGE_KEY}, ${JSON.stringify(record)}::jsonb, now())
    ON CONFLICT (state_key)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
  `;
}

function deriveInventoryFromSnapshot(
  snapshot: TelegramWorkflowSnapshot | null | undefined,
  currentInventory: WorkflowInventory | null | undefined,
): WorkflowInventory | null {
  if (!snapshot) {
    return null;
  }

  const existingGroups = new Map((currentInventory?.groups ?? []).map((group) => [group.chatId, group]));

  return {
    groups: snapshot.groups.map((group) => {
      const existing = existingGroups.get(group.chatId);
      return {
        chatId: group.chatId,
        chatTitle: group.chatTitle,
        chatType: group.chatType,
        photoFileId: existing?.photoFileId ?? group.photoFileId ?? null,
        photoContentType: existing?.photoContentType ?? null,
        photoDataBase64: existing?.photoDataBase64 ?? null,
        photoSyncedAt: existing?.photoSyncedAt ?? null,
      };
    }),
    topics: snapshot.topics.map((topic) => ({
      chatId: topic.chatId,
      threadId: topic.threadId,
      chatTitle: topic.chatTitle,
      topicName: topic.topicName,
    })),
    updatedAt: new Date().toISOString(),
  };
}

function mergeWorkspaceRecord(current: WorkspaceRecord, patch: WorkspaceRecordPatch) {
  const nextUi: WorkspaceUiState = {
    ...current.ui,
    ...(patch.ui ?? {}),
  };

  const inventoryBase: WorkflowInventory = {
    ...current.inventory,
    ...(patch.inventory ?? {}),
  };

  const nextInventory: WorkflowInventory = patch.ui?.snapshot
    ? deriveInventoryFromSnapshot(nextUi.snapshot, current.inventory) ?? inventoryBase
    : inventoryBase;

  return {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    ui: nextUi,
    inventory: nextInventory,
  };
}

export async function readWorkspaceRecord() {
  const sql = getSqlClient();
  if (!sql) {
    const legacyInventory = readLegacyInventoryFile();
    if (legacyInventory) {
      const record = createDefaultWorkspaceRecord();
      record.inventory = legacyInventory;
      return { exists: true, record };
    }

    return { exists: false, record: createDefaultWorkspaceRecord() };
  }

  await ensureTable(sql);
  const rows = (await sql`
    SELECT payload
    FROM telegram_workflow_state
    WHERE state_key = ${STORAGE_KEY}
    LIMIT 1
  `) as Array<{ payload: unknown }>;

  if (!rows.length) {
    const legacyInventory = readLegacyInventoryFile();
    if (legacyInventory) {
      const record = createDefaultWorkspaceRecord();
      record.inventory = legacyInventory;
      await upsertWorkspacePayload(sql, record);
      return { exists: true, record };
    }

    return { exists: false, record: createDefaultWorkspaceRecord() };
  }

  const record = sanitizeWorkspaceRecord(rows[0].payload);
  const legacyInventory = readLegacyInventoryFile();
  if (legacyInventory && record.inventory.groups.length === 0 && record.inventory.topics.length === 0) {
    record.inventory = legacyInventory;
    await upsertWorkspacePayload(sql, record);
  }

  return { exists: true, record };
}

export async function writeWorkspaceRecord(patch: WorkspaceRecordPatch) {
  const sql = getSqlClient();
  const current = await readWorkspaceRecord();
  const next = mergeWorkspaceRecord(current.record, patch);

  if (!sql) {
    return next;
  }

  await upsertWorkspacePayload(sql, next);

  return next;
}

export async function readWorkspaceInventory() {
  const record = await readWorkspaceRecord();
  return record.record.inventory;
}

export function mirrorWorkspaceInventory(inventory: WorkflowInventory) {
  void writeWorkspaceRecord({ inventory }).catch(() => {
    // Best-effort mirror only.
  });
}
