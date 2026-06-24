import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mirrorWorkspaceInventory } from "@/lib/workspace-store";
import {
  deleteTelegramWebhook,
  fetchUpdatesBatch,
  telegramRequest,
  type TelegramChat,
  type TelegramWorkflowSnapshot,
  type TelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

type RuntimeLog = {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
  updateId?: number;
};

type RuntimeExecutionStep = {
  nodeName: string;
  status: "running" | "success" | "skipped" | "error";
  at: string;
  note?: string;
};

type RuntimeExecution = {
  id: number;
  updateId: number;
  kind: "message" | "callback" | "unknown";
  status: "running" | "success" | "skipped" | "error";
  title: string;
  startedAt: string;
  endedAt: string | null;
  activeNodeName: string | null;
  summary: string;
  steps: RuntimeExecutionStep[];
};

export type AllowedTopicConfig = {
  chatId: number;
  threadId: number | null;
  chatTitle?: string;
  topicName?: string;
};

type WorkflowInventory = {
  groups: { chatId: number; chatTitle: string; chatType: string }[];
  topics: { chatId: number; threadId: number; chatTitle: string; topicName: string }[];
  updatedAt: string | null;
};

type ProbeTarget = {
  chatId: number;
  chatTitle: string;
  chatType: string;
  threadId: number | null;
  topicName?: string;
};

type LocalWorkflowRuntime = {
  active: boolean;
  token: string;
  timer: ReturnType<typeof setInterval> | null;
  polling: boolean;
  allowedTopics: AllowedTopicConfig[];
  offset?: number;
  pollMs: number;
  startedAt: string | null;
  stoppedAt: string | null;
  lastUpdateAt: string | null;
  lastError: string | null;
  handledCount: number;
  ignoredCount: number;
  logs: RuntimeLog[];
  inventory: WorkflowInventory;
  executionSeq: number;
  currentExecution: RuntimeExecution | null;
  lastExecution: RuntimeExecution | null;
  approvalTarget?: AllowedTopicConfig;
  forwardTarget?: AllowedTopicConfig;
  forwardTargets?: TargetWithNodeName[];
  messageTemplates?: MessageTemplateConfig[];
};

export type TargetWithNodeName = {
  nodeName: string;
  target: AllowedTopicConfig;
  keywords?: string;
};

export type MessageTemplateConfig = {
  nodeName: string;
  template: string;
};

export type LocalWorkflowStatus = Omit<LocalWorkflowRuntime, "timer" | "token"> & {
  hasToken: boolean;
};

type StartOptions = {
  token: string;
  allowedTopics?: AllowedTopicConfig[];
  approvalTarget?: AllowedTopicConfig;
  forwardTarget?: AllowedTopicConfig;
  forwardTargets?: TargetWithNodeName[];
  messageTemplates?: MessageTemplateConfig[];
};

const defaultAllowedTopics: AllowedTopicConfig[] = [];

const nodeNames = {
  trigger: "Telegram Trigger",
  allowedTopic: "Allowed Group Topic",
  hasCallback: "Has Callback",
  getMessageCallback: "Lấy tin nhắn - 1",
  getMessageNormal: "Lấy tin nhắn - 2",
  callbackAnswer: "Callback Answer",
  approvalDecision: "Quyết định phê duyệt",
  approve: "Đồng ý phê duyệt",
  reject: "Từ chối phê duyệt",
  forward: "Forward Tin nhắn",
  rejectNotify: "Gửi tin nhắn xác nhận",
} as const;

const approvalChatId = -1004312722594;
const approvalThreadId = 23;
const forwardDestinationChatId = -5333921701;
const inventoryPath = path.join(process.cwd(), ".telegram-workflow-inventory.json");

const runtime = getRuntime();

function getRuntime(): LocalWorkflowRuntime {
  const globalScope = globalThis as typeof globalThis & {
    __telegramLocalWorkflowRuntime?: LocalWorkflowRuntime;
  };

  if (!globalScope.__telegramLocalWorkflowRuntime) {
    globalScope.__telegramLocalWorkflowRuntime = {
      active: false,
      token: "",
      timer: null,
      polling: false,
      allowedTopics: defaultAllowedTopics,
      pollMs: 2000,
      startedAt: null,
      stoppedAt: null,
      lastUpdateAt: null,
      lastError: null,
      handledCount: 0,
      ignoredCount: 0,
      logs: [],
      inventory: readInventory(),
      executionSeq: 0,
      currentExecution: null,
      lastExecution: null,
      messageTemplates: [],
    };
  }

  if (!globalScope.__telegramLocalWorkflowRuntime.inventory) {
    globalScope.__telegramLocalWorkflowRuntime.inventory = readInventory();
  }

  return globalScope.__telegramLocalWorkflowRuntime;
}

function emptyInventory(): WorkflowInventory {
  return {
    groups: [],
    topics: [],
    updatedAt: null,
  };
}

function readInventory(): WorkflowInventory {
  try {
    if (!existsSync(inventoryPath)) {
      return emptyInventory();
    }

    const parsed = JSON.parse(readFileSync(inventoryPath, "utf8")) as Partial<WorkflowInventory>;
    return {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return emptyInventory();
  }
}

function writeInventory() {
  try {
    writeFileSync(inventoryPath, JSON.stringify(runtime.inventory, null, 2));
  } catch {
    // Inventory is a local convenience cache; workflow processing should not fail if disk write fails.
  }

  mirrorWorkspaceInventory(runtime.inventory);
}

function resetInventory() {
  runtime.inventory = emptyInventory();
  writeInventory();
}

function uniqueProbeTargets() {
  const targets = new Map<string, ProbeTarget>();

  for (const group of runtime.inventory.groups) {
    targets.set(`${group.chatId}:group`, {
      chatId: group.chatId,
      chatTitle: group.chatTitle,
      chatType: group.chatType,
      threadId: null,
    });
  }

  for (const topic of runtime.inventory.topics) {
    targets.set(`${topic.chatId}:${topic.threadId}`, {
      chatId: topic.chatId,
      chatTitle: topic.chatTitle,
      chatType: "supergroup",
      threadId: topic.threadId,
      topicName: topic.topicName,
    });
  }

  return Array.from(targets.values());
}

function addLog(level: RuntimeLog["level"], message: string, updateId?: number) {
  runtime.logs = [
    {
      at: new Date().toISOString(),
      level,
      message,
      updateId,
    },
    ...runtime.logs,
  ].slice(0, 80);
}

function chatDisplayName(message: TelegramMessage) {
  return (
    message.chat.title?.trim() ||
    message.chat.username?.trim() ||
    [message.chat.first_name, message.chat.last_name].filter(Boolean).join(" ").trim() ||
    `Chat ${message.chat.id}`
  );
}

function topicDisplayName(message: TelegramMessage, threadId: number) {
  return (
    message.forum_topic_created?.name?.trim() ||
    message.forum_topic_edited?.name?.trim() ||
    `Topic ${threadId}`
  );
}

function isPlaceholderTopicName(topicName: string, threadId: number) {
  const trimmed = topicName.trim();
  return trimmed === "" || trimmed === `Topic ${threadId}` || trimmed === `Topic #${threadId}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMessageTemplate(template: string, variables: Record<string, string>, rawKeys: string[] = []) {
  const rawSet = new Set(rawKeys);
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key: string) => {
    const value = variables[key] ?? "";
    return rawSet.has(key) ? value : escapeHtml(value);
  });
}

function normalizeMessageTemplates(templates: MessageTemplateConfig[] | undefined) {
  const source = Array.isArray(templates) ? templates : [];
  const seen = new Set<string>();
  const normalized: MessageTemplateConfig[] = [];

  for (const item of source) {
    const nodeName = String(item?.nodeName || "").trim();
    const template = String(item?.template || "").trim();
    if (!nodeName || !template) {
      continue;
    }

    const key = nodeName.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({ nodeName, template });
  }

  return normalized;
}

function getMessageTemplate(nodeName: string, fallback: string) {
  const templates = runtime.messageTemplates ?? [];
  const match = templates.find(
    (item) =>
      item.nodeName === nodeName ||
      nodeName.startsWith(item.nodeName) ||
      item.nodeName.startsWith(nodeName),
  );

  return match?.template?.trim() || fallback;
}

function upsertInventoryGroup(chatId: number, chatTitle: string, chatType: string) {
  const existingIndex = runtime.inventory.groups.findIndex((group) => group.chatId === chatId);
  const nextGroup = { chatId, chatTitle, chatType };

  if (existingIndex >= 0) {
    runtime.inventory.groups = runtime.inventory.groups.map((group, index) =>
      index === existingIndex ? { ...group, ...nextGroup } : group,
    );
    return;
  }

  runtime.inventory.groups = [...runtime.inventory.groups, nextGroup];
}

function upsertInventoryTopic(chatId: number, threadId: number, chatTitle: string, topicName: string) {
  const existingIndex = runtime.inventory.topics.findIndex(
    (topic) => topic.chatId === chatId && topic.threadId === threadId,
  );
  const existing = existingIndex >= 0 ? runtime.inventory.topics[existingIndex] : null;
  const nextTopicName =
    !isPlaceholderTopicName(topicName, threadId)
      ? topicName
      : existing && !isPlaceholderTopicName(existing.topicName, threadId)
        ? existing.topicName
        : topicName;
  const nextTopic = { chatId, threadId, chatTitle, topicName: nextTopicName };

  if (existingIndex >= 0) {
    runtime.inventory.topics = runtime.inventory.topics.map((topic, index) =>
      index === existingIndex ? { ...topic, ...nextTopic } : topic,
    );
    return;
  }

  runtime.inventory.topics = [...runtime.inventory.topics, nextTopic];
}

function recordMessageInventory(message: TelegramMessage | undefined) {
  if (!message?.chat) return;

  const chatId = Number(message.chat.id);
  if (!Number.isFinite(chatId)) return;

  const chatTitle = chatDisplayName(message);
  upsertInventoryGroup(chatId, chatTitle, message.chat.type);

  if (message.message_thread_id !== undefined) {
    const threadId = Number(message.message_thread_id);
    if (Number.isFinite(threadId)) {
      upsertInventoryTopic(chatId, threadId, chatTitle, topicDisplayName(message, threadId));
    }
  }

  runtime.inventory.updatedAt = new Date().toISOString();
  writeInventory();
}

function recordChatInventory(chat: TelegramChat | undefined) {
  if (!chat) return;

  const chatId = Number(chat.id);
  if (!Number.isFinite(chatId)) return;

  const chatTitle =
    chat.title?.trim() ||
    chat.username?.trim() ||
    [chat.first_name, chat.last_name].filter(Boolean).join(" ").trim() ||
    `Chat ${chatId}`;
  upsertInventoryGroup(chatId, chatTitle, chat.type);
  runtime.inventory.updatedAt = new Date().toISOString();
  writeInventory();
}

async function probeTarget(token: string, target: ProbeTarget) {
  const message = await telegramRequest<TelegramMessage>(token, "sendMessage", {
    chat_id: target.chatId,
    message_thread_id: target.threadId === null ? undefined : target.threadId,
    text: "·",
    disable_notification: true,
  });

  recordMessageInventory(message);

  await telegramRequest<{ ok: boolean }>(token, "deleteMessage", {
    chat_id: target.chatId,
    message_id: message.message_id,
  });
}

export async function probeWorkflowInventory(options: { token: string }) {
  const token = options.token.trim();
  if (!token) {
    throw new Error("Thiếu bot token.");
  }

  if (runtime.active) {
    throw new Error("Hãy stop workflow trước khi probe, để tránh xung đột getUpdates.");
  }

  const targets = uniqueProbeTargets();
  if (targets.length === 0) {
    throw new Error("Chưa có group/topic nào trong inventory để probe.");
  }

  const report = {
    probedGroups: 0,
    probedTopics: 0,
    failedTargets: [] as string[],
  };

  addLog("info", `Probing ${targets.length} inventory target(s).`);

  for (const target of targets) {
    try {
      await probeTarget(token, target);
      if (target.threadId === null) {
        report.probedGroups += 1;
      } else {
        report.probedTopics += 1;
      }
      addLog(
        "info",
        target.threadId === null
          ? `Probed group ${target.chatTitle}.`
          : `Probed topic ${target.topicName || target.threadId} in ${target.chatTitle}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không probe được target.";
      report.failedTargets.push(target.threadId === null ? target.chatTitle : `${target.chatTitle} / ${target.topicName || target.threadId}`);
      addLog("warn", message);
    }
  }

  runtime.inventory.updatedAt = new Date().toISOString();
  writeInventory();

  return {
    ...report,
    status: getLocalWorkflowStatus(),
  };
}

export function refreshWorkflowInventory() {
  resetInventory();
  addLog("info", "Inventory cache cleared.");
  return getLocalWorkflowStatus();
}

function recordUpdateInventory(update: TelegramUpdate) {
  recordMessageInventory(update.message);
  recordMessageInventory(update.edited_message);
  recordMessageInventory(update.channel_post);
  recordMessageInventory(update.edited_channel_post);
  recordMessageInventory(update.callback_query?.message);
  recordChatInventory(update.my_chat_member?.chat);
  recordChatInventory(update.chat_member?.chat);
  recordChatInventory(update.chat_join_request?.chat);
}

export function recordWorkflowSnapshotInventory(snapshot: TelegramWorkflowSnapshot) {
  runtime.inventory.groups = snapshot.groups.map((group) => ({
    chatId: group.chatId,
    chatTitle: group.chatTitle,
    chatType: group.chatType,
  }));

  runtime.inventory.topics = snapshot.topics.map((topic) => ({
    chatId: topic.chatId,
    threadId: topic.threadId,
    chatTitle: topic.chatTitle,
    topicName: topic.topicName,
  }));

  runtime.inventory.updatedAt = new Date().toISOString();
  writeInventory();

  return runtime.inventory;
}

function getMessageFromCallback(update: TelegramUpdate) {
  return update.callback_query?.message;
}

function isAllowedMessage(message: TelegramMessage | undefined) {
  if (!message) return false;
  const chatId = Number(message.chat.id);
  const threadId = message.message_thread_id === undefined ? null : Number(message.message_thread_id);

  return runtime.allowedTopics.some((item) => item.chatId === chatId && (item.threadId === null || item.threadId === threadId));
}

function parseCallbackData(data: string | undefined) {
  const [action, sourceChatId, messageId, threadId] = (data || "").split("|");
  return {
    action,
    sourceChatId: Number(sourceChatId),
    messageId: Number(messageId),
    threadId: threadId ? (threadId === "null" || threadId === "0" ? null : Number(threadId)) : null,
  };
}

function getExecutionKind(update: TelegramUpdate): RuntimeExecution["kind"] {
  if (update.callback_query) return "callback";
  if (update.message) return "message";
  return "unknown";
}

function getExecutionTitle(update: TelegramUpdate) {
  if (update.callback_query) {
    return `Callback ${update.callback_query.data || "unknown"}`;
  }

  const message = update.message;
  if (!message) {
    return "Unknown update";
  }

  const text = message.text || message.caption || "(no text)";
  return text.length > 54 ? `${text.slice(0, 54)}...` : text;
}

function startExecution(update: TelegramUpdate) {
  runtime.executionSeq += 1;
  runtime.currentExecution = {
    id: runtime.executionSeq,
    updateId: update.update_id,
    kind: getExecutionKind(update),
    status: "running",
    title: getExecutionTitle(update),
    startedAt: new Date().toISOString(),
    endedAt: null,
    activeNodeName: null,
    summary: "Đang nhận update Telegram.",
    steps: [],
  };

  return runtime.currentExecution;
}

function updateStep(nodeName: string, status: RuntimeExecutionStep["status"], note?: string) {
  const execution = runtime.currentExecution;
  if (!execution) return;

  const now = new Date().toISOString();
  const existingIndex = execution.steps.findIndex((step) => step.nodeName === nodeName);
  const nextStep: RuntimeExecutionStep = { nodeName, status, at: now, note };

  if (existingIndex >= 0) {
    execution.steps = execution.steps.map((step, index) => (index === existingIndex ? nextStep : step));
  } else {
    execution.steps = [...execution.steps, nextStep];
  }

  execution.activeNodeName = status === "running" ? nodeName : execution.activeNodeName;
  execution.summary = note || execution.summary;
}

async function runStep<T>(nodeName: string, action: () => Promise<T>, note?: string) {
  updateStep(nodeName, "running", note);
  try {
    const result = await action();
    updateStep(nodeName, "success", note);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Node lỗi khi xử lý.";
    updateStep(nodeName, "error", message);
    throw error;
  }
}

function markStep(nodeName: string, status: RuntimeExecutionStep["status"], note?: string) {
  updateStep(nodeName, status, note);
}

function finishExecution(status: RuntimeExecution["status"], summary: string) {
  const execution = runtime.currentExecution;
  if (!execution) return;

  execution.status = status;
  execution.summary = summary;
  execution.endedAt = new Date().toISOString();
  execution.activeNodeName = null;
  runtime.lastExecution = execution;
  runtime.currentExecution = null;
}

function normalizeAllowedTopics(topics: AllowedTopicConfig[] | undefined) {
  const source = Array.isArray(topics) ? topics : defaultAllowedTopics;
  const seen = new Set<string>();
  const normalized: AllowedTopicConfig[] = [];

  for (const topic of source) {
    const chatId = Number(topic.chatId);
    const threadId = topic.threadId === null ? null : Number(topic.threadId);
    if (!Number.isFinite(chatId) || (threadId !== null && !Number.isFinite(threadId))) {
      continue;
    }

    const key = `${chatId}:${threadId ?? "all"}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      chatId,
      threadId,
      chatTitle: topic.chatTitle,
      topicName: topic.topicName,
    });
  }

  return normalized;
}

async function sendApprovalRequest(update: TelegramUpdate) {
  const message = update.message;
  if (!message) return;

  const chatId = runtime.approvalTarget?.chatId ?? approvalChatId;
  const threadId = runtime.approvalTarget ? runtime.approvalTarget.threadId : approvalThreadId;
  const text = renderMessageTemplate(
    getMessageTemplate("Gửi tin nhắn xác nhận", "{{originalText}}"),
    {
      originalText: message.text || message.caption || "(no text)",
      userName: message.from ? ([message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || message.from.username || `User ${message.from.id}`) : "",
      chatTitle: chatDisplayName(message),
      topicName: message.message_thread_id ? topicDisplayName(message, message.message_thread_id) : "",
    },
  );

  await telegramRequest(runtime.token, "sendMessage", {
    chat_id: chatId,
    message_thread_id: threadId === null ? undefined : threadId,
    text,
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          {
            text: "Đồng ý",
            callback_data: `approve|${message.chat.id}|${message.message_id}|${message.message_thread_id ?? "null"}`,
          },
          {
            text: "Không đồng ý",
            callback_data: `reject|${message.chat.id}|${message.message_id}|${message.message_thread_id ?? "null"}`,
          },
        ],
      ],
    }),
  });
}

async function answerCallback(update: TelegramUpdate) {
  const callbackId = update.callback_query?.id;
  if (!callbackId) return;

  await telegramRequest(runtime.token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text: "đã ghi nhận",
    show_alert: false,
    cache_time: 0,
  });
}

async function editCallbackButtons(update: TelegramUpdate) {
  const message = getMessageFromCallback(update);
  if (!message) return;

  await telegramRequest(runtime.token, "editMessageReplyMarkup", {
    chat_id: message.chat.id,
    message_id: message.message_id,
    reply_markup: JSON.stringify({
      inline_keyboard: [],
    }),
  });
}

// In-memory cache to map force-reply prompt message IDs to their original request texts
const promptToRequestMap = new Map<number, string>();
// In-memory cache to map force-reply prompt message IDs to their original metadata (chat, message, thread)
const promptToMetaMap = new Map<number, { chatId: number; messageId: number; threadId: number | null }>();

async function processUpdate(update: TelegramUpdate) {
  startExecution(update);
  markStep(nodeNames.trigger, "success", "Telegram Trigger nhận update.");

  // Handle replies to force reply replacement materials prompt or the request itself
  if (update.message && update.message.reply_to_message) {
    const promptText = update.message.reply_to_message.text || update.message.reply_to_message.caption || "";
    const isReplacementReply = promptText.includes("Vui lòng reply tin nhắn này với tên vật tư thay thế") ||
                               promptText.includes("yêu cầu dùng vật tư thay thế");

    if (isReplacementReply) {
      let customTarget: AllowedTopicConfig | undefined;
      if (runtime.forwardTargets) {
        const matchedNode = runtime.forwardTargets.find((ft) => ft.nodeName.startsWith("Có vật tư thay thế"));
        if (matchedNode) {
          customTarget = matchedNode.target;
        }
      }

      if (customTarget) {
        const user = update.message.from;
        const userName = user ? ([user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `User ${user.id}`) : "Ai đó";
        const replyText = update.message.text || update.message.caption || "";

        let requestText = "";
        let sourceChatId = update.message.chat.id;
        let sourceMessageId = update.message.reply_to_message.message_id;
        let sourceThreadId: number | null = update.message.message_thread_id ?? null;

        // 1. Try to get original request text and metadata from the map first
        const replyToId = update.message.reply_to_message.message_id;
        if (promptToRequestMap.has(replyToId)) {
          requestText = promptToRequestMap.get(replyToId) || "";
        }
        if (promptToMetaMap.has(replyToId)) {
          const meta = promptToMetaMap.get(replyToId);
          if (meta) {
            sourceChatId = meta.chatId;
            sourceMessageId = meta.messageId;
            sourceThreadId = meta.threadId;
          }
        }
        if (!requestText && promptText.includes("yêu cầu dùng vật tư thay thế")) {
          requestText = promptText;
        }

        const requestContext = requestText ? ` (cho yêu cầu: <i>${escapeHtml(requestText)}</i>)` : "";
        const combinedText = renderMessageTemplate(
          getMessageTemplate("Có vật tư thay thế", "🔄 <b>Thông tin vật tư thay thế từ {{userName}}</b>{{requestContext}}\n\n\"{{replyText}}\""),
          {
            userName,
            replyText,
            requestText,
            requestContext,
          },
          ["requestContext"],
        );

        addLog("info", `Routing replacement material reply to: Có vật tư thay thế group`, update.update_id);
        await runStep(`Gửi câu trả lời vật tư thay thế`, () =>
          telegramRequest(runtime.token, "sendMessage", {
            chat_id: customTarget!.chatId,
            message_thread_id: customTarget!.threadId === null ? undefined : customTarget!.threadId,
            text: combinedText,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
              inline_keyboard: [
                [
                  {
                    text: "✅ Đồng ý",
                    callback_data: `vta_ok|${sourceChatId}|${sourceMessageId}|${sourceThreadId ?? "null"}`,
                  },
                  {
                    text: "❌ Không đồng ý",
                    callback_data: `vta_no|${sourceChatId}|${sourceMessageId}|${sourceThreadId ?? "null"}`,
                  },
                ],
              ],
            }),
          })
        );
        
        runtime.handledCount += 1;
        finishExecution("success", `Đã gửi thông tin vật tư thay thế.`);
        return;
      }
    }

    // Handle replies to supplier confirmation prompt
    const isSupplierReply = promptText.includes("xác nhận nhà cung ứng đã đến");
    if (isSupplierReply) {
      const user = update.message.from;
      const userName = user ? ([user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `User ${user.id}`) : "Ai đó";
      const replyText = update.message.text || update.message.caption || "";
      const replyToId = update.message.reply_to_message.message_id;

      // Retrieve source metadata to route reply back
      let sourceChatId: number | null = null;
      let sourceMessageId: number | null = null;
      let sourceThreadId: number | null = null;
      if (promptToMetaMap.has(replyToId)) {
        const meta = promptToMetaMap.get(replyToId);
        if (meta) {
          sourceChatId = meta.chatId;
          sourceMessageId = meta.messageId;
          sourceThreadId = meta.threadId;
        }
      }

      // Notify back to the original group
      if (sourceChatId) {
        const notifyText = renderMessageTemplate(
          `📦 <b>{{userName}}</b> xác nhận: "{{replyText}}"`,
          {
            userName,
            replyText,
          },
        );
        addLog("info", `Routing supplier confirmation reply back to source group`, update.update_id);
        await runStep("Gửi xác nhận nhà cung ứng về group gốc", () =>
          telegramRequest(runtime.token, "sendMessage", {
            chat_id: sourceChatId!,
            message_thread_id: sourceThreadId === null ? undefined : sourceThreadId,
            text: notifyText,
            parse_mode: "HTML",
            reply_to_message_id: sourceMessageId || undefined,
          })
        );
      }

      const inspectionText = renderMessageTemplate(
        getMessageTemplate("Nghiệm thu vật tư", "📋 <b>{{userName}}</b> nghiệm thu vật tư sau xác nhận nhà cung ứng.\n\n{{replyText}}"),
        {
          userName,
          replyText,
        },
      );

      const inspectionChatId = sourceChatId ?? null;
      const inspectionThreadId = sourceThreadId ?? null;
      if (inspectionChatId) {
        addLog("info", `Routing supplier confirmation reply to original source topic`, update.update_id);
        await runStep("Gửi nghiệm thu vật tư", () =>
          telegramRequest(runtime.token, "sendMessage", {
            chat_id: inspectionChatId,
            message_thread_id: inspectionThreadId === null ? undefined : inspectionThreadId,
            text: inspectionText,
            parse_mode: "HTML",
            reply_to_message_id: sourceMessageId || undefined,
          })
        );
      } else if (runtime.forwardTargets) {
        const matchedNode = runtime.forwardTargets.find((ft) => ft.nodeName.startsWith("Nghiệm thu vật tư"));
        if (matchedNode) {
          addLog("info", `Routing supplier confirmation reply to fallback inspection target`, update.update_id);
          await runStep("Gửi nghiệm thu vật tư", () =>
            telegramRequest(runtime.token, "sendMessage", {
              chat_id: matchedNode.target.chatId,
              message_thread_id: matchedNode.target.threadId === null ? undefined : matchedNode.target.threadId,
              text: inspectionText,
              parse_mode: "HTML",
            })
          );
        }
      }

      runtime.handledCount += 1;
      finishExecution("success", `Đã xác nhận nhà cung ứng.`);
      return;
    }
  }

  if (update.callback_query) {
    markStep(nodeNames.allowedTopic, "success", "Allowed topic: true");
    markStep(nodeNames.hasCallback, "success", "Callback: true");
    markStep(nodeNames.getMessageCallback, "success", "Đã lấy message callback.");
    await runStep(nodeNames.callbackAnswer, () => answerCallback(update), "Đã answer callback.");
    const parsed = parseCallbackData(update.callback_query.data);

    // Handle Materials callback options (vt_co, vt_khong, vt_thay)
    if (parsed.action === "vt_co" || parsed.action === "vt_khong" || parsed.action === "vt_thay") {
      const cbQuery = update.callback_query;
      if (!cbQuery) return;
      const user = cbQuery.from;
      if (!user) return;

      markStep("Xử lý phản hồi vật tư", "success", `Nhánh phản hồi vật tư: ${parsed.action}`);
      const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `User ${user.id}`;
      const originalText = cbQuery.message?.text || cbQuery.message?.caption || "";
      const chatId = cbQuery.message?.chat.id;
      const messageId = cbQuery.message?.message_id;

      if (chatId && messageId) {
        let statusHtml = "";
        let targetNodePrefix = "";
        if (parsed.action === "vt_co") {
          statusHtml = `✅ <b>${userName}</b> đồng ý cung cấp vật tư.`;
          targetNodePrefix = "Có vật tư";
        } else if (parsed.action === "vt_khong") {
          statusHtml = `❌ <b>${userName}</b> báo không có vật tư.`;
          targetNodePrefix = "Không có vật tư";
        } else if (parsed.action === "vt_thay") {
          statusHtml = `🔄 <b>${userName}</b> yêu cầu dùng vật tư thay thế.`;
          targetNodePrefix = "Có vật tư thay thế";
        }

        const newText = `${originalText}\n\n${statusHtml}`;

        // Edit message text and remove buttons
        await runStep("Cập nhật trạng thái vật tư", () =>
          telegramRequest(runtime.token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            parse_mode: "HTML",
          })
        );

        // Find the target for the corresponding node (with prefix safety checks)
        let customTarget: AllowedTopicConfig | undefined;
        if (runtime.forwardTargets) {
          const matchedNode = runtime.forwardTargets.find((ft) => {
            if (targetNodePrefix === "Có vật tư") {
              return ft.nodeName.startsWith("Có vật tư") && !ft.nodeName.includes("thay thế");
            }
            return ft.nodeName.startsWith(targetNodePrefix);
          });
          if (matchedNode) {
            customTarget = matchedNode.target;
          }
        }

        // Send notification to the designated group/topic if configured
        // For "vt_thay" (Có vật tư thay thế), we hold off sending the notification until they reply with the details.
        if (customTarget && parsed.action !== "vt_thay") {
          addLog("info", `Routing material response notification to: ${targetNodePrefix} group`, update.update_id);
          const statusHtml =
            parsed.action === "vt_co"
              ? `✅ <b>${escapeHtml(userName)}</b> đồng ý cung cấp vật tư.`
              : `❌ <b>${escapeHtml(userName)}</b> báo không có vật tư.`;
          const messageTemplateNode = parsed.action === "vt_co" ? "Có vật tư" : "Không có vật tư";
          await runStep(`Gửi thông báo (${targetNodePrefix})`, () =>
            telegramRequest(runtime.token, "sendMessage", {
              chat_id: customTarget!.chatId,
              message_thread_id: customTarget!.threadId === null ? undefined : customTarget!.threadId,
              text: renderMessageTemplate(
                getMessageTemplate(messageTemplateNode, "{{originalText}}\n\n{{statusHtml}}"),
                {
                  originalText,
                  statusHtml,
                  statusLine: statusHtml,
                  userName,
                },
                ["statusHtml", "statusLine"],
              ),
              parse_mode: "HTML",
            })
          );
        }

        if (parsed.action === "vt_thay") {
          // Send a force reply prompt
          const sentMsg = await runStep("Gửi yêu cầu nhập vật tư thay thế", () =>
            telegramRequest<TelegramMessage>(runtime.token, "sendMessage", {
              chat_id: chatId,
              message_thread_id: cbQuery.message?.message_thread_id,
              text: "Vui lòng reply tin nhắn này với tên vật tư thay thế cho tin nhắn trên:",
              reply_markup: JSON.stringify({
                force_reply: true,
                selective: true,
              }),
            })
          );
          if (sentMsg && sentMsg.message_id) {
            promptToRequestMap.set(sentMsg.message_id, newText);
            promptToMetaMap.set(sentMsg.message_id, {
              chatId: parsed.sourceChatId,
              messageId: parsed.messageId,
              threadId: cbQuery.message?.message_thread_id ?? null,
            });
          }
        }

        if (parsed.action === "vt_co") {
          // After confirming supply, send a force_reply message to the "Xác nhận nhà cung ứng" node target
          let supplierTarget: AllowedTopicConfig | undefined;
          if (runtime.forwardTargets) {
            const matchedNode = runtime.forwardTargets.find((ft) => ft.nodeName.startsWith("Xác nhận nhà cung ứng"));
            if (matchedNode) {
              supplierTarget = matchedNode.target;
            }
          }

          if (supplierTarget) {
            addLog("info", `Sending supplier confirmation prompt to: Xác nhận nhà cung ứng group`, update.update_id);
            const statusHtml = `✅ <b>${escapeHtml(userName)}</b> đồng ý cung cấp vật tư.`;
            const supplierTemplate = getMessageTemplate(
              "Xác nhận nhà cung ứng",
              "📦 {{statusHtml}}\n\nVui lòng reply tin nhắn này để xác nhận nhà cung ứng đã đến.",
            );
            const sentMsg = await runStep("Gửi yêu cầu xác nhận nhà cung ứng", () =>
              telegramRequest<TelegramMessage>(runtime.token, "sendMessage", {
                chat_id: supplierTarget!.chatId,
                message_thread_id: supplierTarget!.threadId === null ? undefined : supplierTarget!.threadId,
                text: renderMessageTemplate(
                  supplierTemplate,
                  {
                    originalText,
                    statusHtml,
                    statusLine: statusHtml,
                    userName,
                    replyText: "",
                    requestText: originalText,
                    requestContext: ` (cho yêu cầu: <i>${escapeHtml(originalText)}</i>)`,
                  },
                  ["statusHtml", "statusLine", "requestContext"],
                ),
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                  force_reply: true,
                  selective: false,
                }),
              })
            );
            if (sentMsg && sentMsg.message_id) {
              // Cache meta so we can route the reply back to the original group
              promptToMetaMap.set(sentMsg.message_id, {
                chatId: parsed.sourceChatId,
                messageId: parsed.messageId,
                threadId: cbQuery.message?.message_thread_id ?? null,
              });
            }
          }
        }
      }

      runtime.handledCount += 1;
      finishExecution("success", `Đã cập nhật trạng thái vật tư: ${parsed.action}`);
      addLog("info", `Updated material status to: ${parsed.action} by ${userName}`, update.update_id);
      return;
    }

    markStep(nodeNames.approvalDecision, "success", parsed.action === "approve" ? "Nhánh duyệt." : "Nhánh từ chối.");

    if (parsed.action === "approve") {
      const cbQuery = update.callback_query;
      if (!cbQuery) return;
      const user = cbQuery.from;
      if (!user) return;

      const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `User ${user.id}`;
      const originalText = cbQuery.message?.text || cbQuery.message?.caption || "";
      const chatId = cbQuery.message?.chat.id;
      const messageId = cbQuery.message?.message_id;

      if (chatId && messageId) {
        const newText = `${originalText}\n\n✅ <b>${userName}</b> đã duyệt với phương án Đồng ý`;
        await runStep(nodeNames.approve, () =>
          telegramRequest(runtime.token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            parse_mode: "HTML",
          })
        );
      }

      // Dynamic routing for Materials based on user-configured keywords
      const msgText = originalText;
      const matchedTargets: { target: AllowedTopicConfig; nodeName: string }[] = [];

      if (runtime.forwardTargets && runtime.forwardTargets.length > 0) {
        for (const ft of runtime.forwardTargets) {
          if (ft.keywords) {
            const keywordsList = ft.keywords
              .split(",")
              .map((k) => k.trim().toLowerCase())
              .filter(Boolean);
            const hasMatch = keywordsList.some((keyword) => msgText.toLowerCase().includes(keyword));
            if (hasMatch) {
              matchedTargets.push({ target: ft.target, nodeName: ft.nodeName });
            }
          } else {
            // Fallback to name-based keyword check for backward compatibility
            const nodeNameLower = ft.nodeName.toLowerCase();
            const isVatTuChinh = nodeNameLower.includes("vật tư chính") && msgText.toLowerCase().includes("vật tư chính");
            const isVatTuPhu = nodeNameLower.includes("vật tư phụ") && msgText.toLowerCase().includes("vật tư phụ");
            if (isVatTuChinh || isVatTuPhu) {
              matchedTargets.push({ target: ft.target, nodeName: ft.nodeName });
            }
          }
        }
      }

      if (matchedTargets.length > 0) {
        // Send message to all matched targets (N x N routing) with Inline Keyboard options
        for (let i = 0; i < matchedTargets.length; i++) {
          const { target, nodeName } = matchedTargets[i];
          addLog("info", `Routing send message to: ${nodeName} (matched keywords)`, update.update_id);
          const stepName = `Gửi tin nhắn (${nodeName})`;
          await runStep(stepName, () =>
            telegramRequest(runtime.token, "sendMessage", {
              chat_id: target.chatId,
              message_thread_id: target.threadId === null ? undefined : target.threadId,
              text: msgText,
              reply_markup: JSON.stringify({
                inline_keyboard: [
                  [
                    {
                      text: "✅ Đồng ý cung cấp",
                      callback_data: `vt_co|${parsed.sourceChatId}|${parsed.messageId}`,
                    },
                    {
                      text: "❌ Không có vật tư",
                      callback_data: `vt_khong|${parsed.sourceChatId}|${parsed.messageId}`,
                    },
                  ],
                  [
                    {
                      text: "🔄 Thay thế vật tư",
                      callback_data: `vt_thay|${parsed.sourceChatId}|${parsed.messageId}`,
                    },
                  ],
                ],
              }),
            }),
          );
        }
      } else {
        // Default forward
        let forwardChatId = runtime.forwardTarget?.chatId ?? forwardDestinationChatId;
        let forwardThreadId = runtime.forwardTarget ? runtime.forwardTarget.threadId : null;
        await runStep(nodeNames.forward, () =>
          telegramRequest(runtime.token, "forwardMessage", {
            chat_id: forwardChatId,
            message_thread_id: forwardThreadId === null ? undefined : forwardThreadId,
            from_chat_id: parsed.sourceChatId,
            message_id: parsed.messageId,
          }),
        );
      }

      runtime.handledCount += 1;
      finishExecution("success", `Đã duyệt và forward tin nhắn (matched ${matchedTargets.length} targets).`);
      addLog("info", `Approved and forwarded message to ${matchedTargets.length || 1} destination(s).`, update.update_id);
      return;
    }

    if (parsed.action === "reject") {
      const cbQuery = update.callback_query;
      if (!cbQuery) return;
      const user = cbQuery.from;
      if (!user) return;

      const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `User ${user.id}`;
      const originalText = cbQuery.message?.text || cbQuery.message?.caption || "";
      const chatId = cbQuery.message?.chat.id;
      const messageId = cbQuery.message?.message_id;

      if (chatId && messageId) {
        const newText = `${originalText}\n\n❌ <b>${userName}</b> đã duyệt với phương án Từ chối`;
        await runStep(nodeNames.reject, () =>
          telegramRequest(runtime.token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            parse_mode: "HTML",
          })
        );
      }

      const rejectNotifyText = renderMessageTemplate(
        getMessageTemplate("Từ chối tin nhắn", "Đã bị từ chối: {{originalText}}"),
        {
          originalText,
          userName,
          chatTitle: cbQuery.message ? chatDisplayName(cbQuery.message) : "",
          topicName: cbQuery.message?.message_thread_id && cbQuery.message
            ? topicDisplayName(cbQuery.message, cbQuery.message.message_thread_id)
            : "",
        },
      );

      await runStep(nodeNames.rejectNotify, () =>
        telegramRequest(runtime.token, "sendMessage", {
          chat_id: parsed.sourceChatId,
          message_thread_id: parsed.threadId === null ? undefined : parsed.threadId,
          text: rejectNotifyText,
          disable_notification: false,
          reply_to_message_id: parsed.messageId || undefined,
        }),
      );
      runtime.handledCount += 1;
      finishExecution("success", "Đã từ chối và gửi thông báo.");
      addLog("info", "Rejected message and notified source chat.", update.update_id);
      return;
    }

    if (parsed.action === "vta_ok" || parsed.action === "vta_no") {
      const cbQuery = update.callback_query;
      if (!cbQuery) return;
      const user = cbQuery.from;
      if (!user) return;

      const userName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `User ${user.id}`;
      const originalText = cbQuery.message?.text || cbQuery.message?.caption || "";
      const chatId = cbQuery.message?.chat.id;
      const messageId = cbQuery.message?.message_id;

      if (chatId && messageId) {
        // Edit callback message in target group to show decision and remove buttons
        const isOk = parsed.action === "vta_ok";
        const decisionText = isOk 
          ? `\n\n✅ <b>${userName}</b> đã đồng ý dùng vật tư thay thế.`
          : `\n\n❌ <b>${userName}</b> không đồng ý dùng vật tư thay thế.`;
          
        const newText = `${originalText}${decisionText}`;
        await runStep("Cập nhật phản hồi duyệt vật tư thay thế", () =>
          telegramRequest(runtime.token, "editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            parse_mode: "HTML",
          })
        );
        
        // Notify the original group
        if (parsed.sourceChatId) {
          const notifyText = isOk
            ? `✅ <b>${userName}</b> đã đồng ý phương án dùng vật tư thay thế của bạn.`
            : `❌ <b>${userName}</b> không đồng ý phương án dùng vật tư thay thế của bạn.`;
            
          await runStep("Thông báo kết quả duyệt vật tư thay thế về group gốc", () =>
            telegramRequest(runtime.token, "sendMessage", {
              chat_id: parsed.sourceChatId,
              message_thread_id: parsed.threadId === null ? undefined : parsed.threadId,
              text: notifyText,
              parse_mode: "HTML",
              reply_to_message_id: parsed.messageId || undefined,
            })
          );
        }
      }

      runtime.handledCount += 1;
      finishExecution("success", `Đã xử lý quyết định duyệt vật tư thay thế: ${parsed.action}`);
      addLog("info", `Processed replacement material approval decision: ${parsed.action} by ${userName}`, update.update_id);
      return;
    }

    runtime.ignoredCount += 1;
    markStep(nodeNames.approvalDecision, "skipped", "Callback không thuộc approve/reject.");
    finishExecution("skipped", "Bỏ qua callback không hợp lệ.");
    addLog("warn", "Ignored callback with unknown action.", update.update_id);
    return;
  }

  if (isAllowedMessage(update.message)) {
    markStep(nodeNames.allowedTopic, "success", "Allowed topic: true");
    markStep(nodeNames.hasCallback, "success", "Callback: false");
    markStep(nodeNames.getMessageNormal, "success", "Đã lấy message thường.");
    await runStep(nodeNames.rejectNotify, () => sendApprovalRequest(update), "Đã gửi yêu cầu duyệt.");
    runtime.handledCount += 1;
    finishExecution("success", "Đã gửi yêu cầu duyệt vào topic phê duyệt.");
    addLog("info", "Sent approval request.", update.update_id);
    return;
  }

  runtime.ignoredCount += 1;
  markStep(nodeNames.allowedTopic, "skipped", "Không nằm trong group/topic cho phép.");
  finishExecution("skipped", "Bỏ qua update ngoài group/topic cho phép.");
  addLog("info", "Ignored update outside allowed group/topic.", update.update_id);
}

async function pollOnce() {
  if (!runtime.active || !runtime.token || runtime.polling) return;

  runtime.polling = true;
  try {
    const updates = await fetchUpdatesBatch(runtime.token, runtime.offset);
    for (const update of updates) {
      runtime.offset = update.update_id + 1;
      runtime.lastUpdateAt = new Date().toISOString();
      recordUpdateInventory(update);

      try {
        await processUpdate(update);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không xử lý được update.";
        runtime.lastError = message;
        finishExecution("error", message);
        addLog("error", message, update.update_id);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không poll được Telegram.";
    runtime.lastError = message;
    addLog("error", message);
  } finally {
    runtime.polling = false;
  }
}

function schedulePoller() {
  if (runtime.timer) {
    clearInterval(runtime.timer);
  }

  runtime.timer = setInterval(() => {
    void pollOnce();
  }, runtime.pollMs);

  void pollOnce();
}

export async function startLocalWorkflow(options: StartOptions) {
  const token = options.token.trim();
  if (!token) {
    throw new Error("Thiếu bot token.");
  }

  runtime.token = token;
  runtime.allowedTopics = normalizeAllowedTopics(options.allowedTopics);
  runtime.approvalTarget = options.approvalTarget;
  runtime.forwardTarget = options.forwardTarget;
  runtime.forwardTargets = options.forwardTargets;
  runtime.messageTemplates = normalizeMessageTemplates(options.messageTemplates);
  runtime.active = true;
  runtime.startedAt = new Date().toISOString();
  runtime.stoppedAt = null;
  runtime.lastError = null;

  await deleteTelegramWebhook(token);
  schedulePoller();
  addLog("info", "Local workflow started.");

  return getLocalWorkflowStatus();
}

export function stopLocalWorkflow() {
  runtime.active = false;
  runtime.stoppedAt = new Date().toISOString();
  if (runtime.timer) {
    clearInterval(runtime.timer);
    runtime.timer = null;
  }
  addLog("info", "Local workflow stopped.");

  return getLocalWorkflowStatus();
}

export function getLocalWorkflowStatus(): LocalWorkflowStatus {
  return {
    active: runtime.active,
    polling: runtime.polling,
    pollMs: runtime.pollMs,
    startedAt: runtime.startedAt,
    stoppedAt: runtime.stoppedAt,
    lastUpdateAt: runtime.lastUpdateAt,
    lastError: runtime.lastError,
    handledCount: runtime.handledCount,
    ignoredCount: runtime.ignoredCount,
    logs: runtime.logs,
    inventory: runtime.inventory,
    allowedTopics: runtime.allowedTopics,
    executionSeq: runtime.executionSeq,
    currentExecution: runtime.currentExecution,
    lastExecution: runtime.lastExecution,
    offset: runtime.offset,
    hasToken: Boolean(runtime.token),
    approvalTarget: runtime.approvalTarget,
    forwardTarget: runtime.forwardTarget,
    forwardTargets: runtime.forwardTargets,
    messageTemplates: runtime.messageTemplates,
  };
}
