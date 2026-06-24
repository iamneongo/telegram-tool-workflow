import {
  deleteTelegramWebhook,
  fetchUpdatesBatch,
  telegramRequest,
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

type LocalWorkflowRuntime = {
  active: boolean;
  token: string;
  timer: ReturnType<typeof setInterval> | null;
  polling: boolean;
  offset?: number;
  pollMs: number;
  startedAt: string | null;
  stoppedAt: string | null;
  lastUpdateAt: string | null;
  lastError: string | null;
  handledCount: number;
  ignoredCount: number;
  logs: RuntimeLog[];
  executionSeq: number;
  currentExecution: RuntimeExecution | null;
  lastExecution: RuntimeExecution | null;
};

export type LocalWorkflowStatus = Omit<LocalWorkflowRuntime, "timer" | "token"> & {
  hasToken: boolean;
};

type StartOptions = {
  token: string;
};

const allowedTopics = [
  { chatId: -1004312722594, threadId: 4 },
  { chatId: -1004312722594, threadId: 6 },
  { chatId: -1004312722594, threadId: 23 },
];

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
      pollMs: 2000,
      startedAt: null,
      stoppedAt: null,
      lastUpdateAt: null,
      lastError: null,
      handledCount: 0,
      ignoredCount: 0,
      logs: [],
      executionSeq: 0,
      currentExecution: null,
      lastExecution: null,
    };
  }

  return globalScope.__telegramLocalWorkflowRuntime;
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

function getMessageFromCallback(update: TelegramUpdate) {
  return update.callback_query?.message;
}

function isAllowedMessage(message: TelegramMessage | undefined) {
  if (!message) return false;
  const chatId = Number(message.chat.id);
  const threadId = Number(message.message_thread_id);

  return allowedTopics.some((item) => item.chatId === chatId && item.threadId === threadId);
}

function parseCallbackData(data: string | undefined) {
  const [action, sourceChatId, messageId] = (data || "").split("|");
  return {
    action,
    sourceChatId: Number(sourceChatId),
    messageId: Number(messageId),
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

async function sendApprovalRequest(update: TelegramUpdate) {
  const message = update.message;
  if (!message) return;

  await telegramRequest(runtime.token, "sendMessage", {
    chat_id: approvalChatId,
    message_thread_id: approvalThreadId,
    text: message.text || message.caption || "(no text)",
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          {
            text: "Đồng ý",
            callback_data: `approve|${message.chat.id}|${message.message_id}`,
          },
          {
            text: "Không đồng ý",
            callback_data: `reject|${message.chat.id}|${message.message_id}`,
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

async function editCallbackMessage(update: TelegramUpdate, text: string) {
  const message = getMessageFromCallback(update);
  if (!message) return;

  await telegramRequest(runtime.token, "editMessageText", {
    chat_id: message.chat.id,
    message_id: message.message_id,
    text,
  });
}

async function processUpdate(update: TelegramUpdate) {
  startExecution(update);
  markStep(nodeNames.trigger, "success", "Telegram Trigger nhận update.");

  if (update.callback_query) {
    markStep(nodeNames.allowedTopic, "success", "Allowed topic: true");
    markStep(nodeNames.hasCallback, "success", "Callback: true");
    markStep(nodeNames.getMessageCallback, "success", "Đã lấy message callback.");
    await runStep(nodeNames.callbackAnswer, () => answerCallback(update), "Đã answer callback.");
    const parsed = parseCallbackData(update.callback_query.data);
    markStep(nodeNames.approvalDecision, "success", parsed.action === "approve" ? "Nhánh duyệt." : "Nhánh từ chối.");

    if (parsed.action === "approve") {
      await runStep(nodeNames.approve, () => editCallbackMessage(update, "Đã đồng ý"), "Edit message: đã đồng ý.");
      await runStep(nodeNames.forward, () =>
        telegramRequest(runtime.token, "forwardMessage", {
          chat_id: forwardDestinationChatId,
          from_chat_id: parsed.sourceChatId,
          message_id: parsed.messageId,
        }),
      );
      runtime.handledCount += 1;
      finishExecution("success", "Đã duyệt và forward tin nhắn.");
      addLog("info", "Approved and forwarded message.", update.update_id);
      return;
    }

    if (parsed.action === "reject") {
      await runStep(nodeNames.reject, () => editCallbackMessage(update, "Không đồng ý"), "Edit message: không đồng ý.");
      await runStep(nodeNames.rejectNotify, () =>
        telegramRequest(runtime.token, "sendMessage", {
          chat_id: parsed.sourceChatId,
          text: `Đã bị từ chối: ${update.callback_query?.message?.text || ""}`,
          disable_notification: false,
        }),
      );
      runtime.handledCount += 1;
      finishExecution("success", "Đã từ chối và gửi thông báo.");
      addLog("info", "Rejected message and notified source chat.", update.update_id);
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
    executionSeq: runtime.executionSeq,
    currentExecution: runtime.currentExecution,
    lastExecution: runtime.lastExecution,
    offset: runtime.offset,
    hasToken: Boolean(runtime.token),
  };
}
