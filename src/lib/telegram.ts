export type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_forum?: boolean;
};

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramTopicInfo = {
  name?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  date?: number;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  message_thread_id?: number;
  is_topic_message?: boolean;
  forum_topic_created?: TelegramTopicInfo;
  forum_topic_edited?: TelegramTopicInfo;
  reply_to_message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  my_chat_member?: {
    date?: number;
    chat?: TelegramChat;
    from?: TelegramUser;
    old_chat_member?: { status?: string };
    new_chat_member?: { status?: string };
  };
  chat_member?: {
    date?: number;
    chat?: TelegramChat;
    from?: TelegramUser;
    old_chat_member?: { status?: string };
    new_chat_member?: { status?: string };
  };
  chat_join_request?: {
    date?: number;
    chat?: TelegramChat;
    from?: TelegramUser;
  };
  callback_query?: {
    id: string;
    from?: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
  error_code?: number;
};

export type TelegramBotInfo = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
};

export type TelegramWebhookInfo = {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  ip_address?: string;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
};

export type GroupRecord = {
  chatId: number;
  title: string;
  username?: string;
  type: string;
  isForum: boolean;
  messageCount: number;
  lastSeenAt: string | null;
  lastUpdateId: number;
  sources: string[];
};

export type TopicRecord = {
  chatId: number;
  chatTitle: string;
  chatUsername?: string;
  threadId: number;
  title: string;
  messageCount: number;
  lastSeenAt: string | null;
  lastUpdateId: number;
  sources: string[];
};

export type TelegramScanResult = {
  bot: TelegramBotInfo;
  webhook: TelegramWebhookInfo;
  groups: GroupRecord[];
  topics: TopicRecord[];
  warnings: string[];
  meta: {
    updateCount: number;
    deepScan: boolean;
    truncated: boolean;
    pagesFetched: number;
  };
};

export type TelegramWorkflowRow = {
  updateId: number;
  date: string | null;
  chatId: number | null;
  chatTitle: string;
  chatType: string;
  topicId: number | null;
  topicName: string;
  senderName: string;
  senderId: number | null;
  messageText: string;
  rawUpdate: TelegramUpdate;
};

export type TelegramWorkflowSnapshot = {
  bot: TelegramBotInfo;
  webhook: TelegramWebhookInfo;
  updates: TelegramWorkflowRow[];
  groups: { chatId: number; chatTitle: string; chatType: string }[];
  topics: { chatId: number; threadId: number; chatTitle: string; topicName: string }[];
  warnings: string[];
  meta: {
    updateCount: number;
    deepScan: boolean;
    truncated: boolean;
    pagesFetched: number;
    uniqueChatCount: number;
    topicCount: number;
  };
};

export type TelegramN8nItem = {
  chatId: number;
  threadId: number | null;
  chatTitle: string;
  topicName: string;
};

type ScanOptions = {
  deepScan?: boolean;
};

export class TelegramApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = "TelegramApiError";
    this.statusCode = statusCode;
  }
}

function isGroupChat(chat: TelegramChat | undefined) {
  return chat?.type === "group" || chat?.type === "supergroup";
}

function formatDate(unixSeconds?: number) {
  if (!unixSeconds) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
}

function chatDisplayName(chat: TelegramChat) {
  const title = chat.title?.trim() || "";
  const username = chat.username?.trim() || "";

  if (title && username) {
    return `${title} (@${username})`;
  }

  if (title) {
    return title;
  }

  if (username) {
    return `@${username}`;
  }

  return `Chat ${chat.id}`;
}

function topicDisplayName(message: TelegramMessage, threadId: number, existingTitle?: string) {
  const explicitTitle =
    message.forum_topic_created?.name?.trim() ||
    message.forum_topic_edited?.name?.trim() ||
    existingTitle?.trim() ||
    "";

  if (explicitTitle) {
    return explicitTitle;
  }

  return `Topic #${threadId}`;
}

function isPlaceholderTopicName(topicName: string, threadId: number) {
  const trimmed = topicName.trim();
  return trimmed === "" || trimmed === `Topic ${threadId}` || trimmed === `Topic #${threadId}`;
}

function recordSource(sources: Set<string>, source: string) {
  if (source) {
    sources.add(source);
  }
}

export async function telegramRequest<T>(
  token: string,
  method: string,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    body.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
    });
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    throw new TelegramApiError(
      `Không thể kết nối đến Telegram API (${originalMessage}). Vui lòng kiểm tra kết nối mạng hoặc VPN/Proxy của server.`,
      502,
    );
  }

  let data: TelegramApiResponse<T>;
  try {
    data = (await response.json()) as TelegramApiResponse<T>;
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    throw new TelegramApiError(
      `Không thể phân tích phản hồi từ Telegram API (${originalMessage}). Trạng thái phản hồi: ${response.status}.`,
      502,
    );
  }

  if (!response.ok || !data.ok) {
    const message = data.description || `Telegram API request failed for ${method}`;
    throw new TelegramApiError(message, response.status);
  }

  return data.result;
}

function mergeGroupRecord(
  groups: Map<number, GroupRecord>,
  chat: TelegramChat,
  updateId: number,
  date: number | undefined,
  source: string,
) {
  if (!isGroupChat(chat)) {
    return;
  }

  const existing = groups.get(chat.id);
  const sources = new Set(existing?.sources ?? []);
  recordSource(sources, source);

  groups.set(chat.id, {
    chatId: chat.id,
    title: existing?.title ?? chatDisplayName(chat),
    username: chat.username ?? existing?.username,
    type: chat.type,
    isForum: Boolean(existing?.isForum || chat.is_forum),
    messageCount: (existing?.messageCount ?? 0) + 1,
    lastSeenAt:
      date && (!existing?.lastSeenAt || new Date(date * 1000).toISOString() > existing.lastSeenAt)
        ? formatDate(date)
        : existing?.lastSeenAt ?? formatDate(date),
    lastUpdateId: Math.max(existing?.lastUpdateId ?? 0, updateId),
    sources: Array.from(sources),
  });
}

function mergeTopicRecord(
  topics: Map<string, TopicRecord>,
  chat: TelegramChat,
  threadId: number,
  message: TelegramMessage,
  updateId: number,
  date: number | undefined,
  source: string,
) {
  if (!isGroupChat(chat)) {
    return;
  }

  const key = `${chat.id}:${threadId}`;
  const existing = topics.get(key);
  const sources = new Set(existing?.sources ?? []);
  recordSource(sources, source);

  topics.set(key, {
    chatId: chat.id,
    chatTitle: existing?.chatTitle ?? chatDisplayName(chat),
    chatUsername: chat.username ?? existing?.chatUsername,
    threadId,
    title: topicDisplayName(message, threadId, existing?.title),
    messageCount: (existing?.messageCount ?? 0) + 1,
    lastSeenAt:
      date && (!existing?.lastSeenAt || new Date(date * 1000).toISOString() > existing.lastSeenAt)
        ? formatDate(date)
        : existing?.lastSeenAt ?? formatDate(date),
    lastUpdateId: Math.max(existing?.lastUpdateId ?? 0, updateId),
    sources: Array.from(sources),
  });
}

function inspectMessage(
  message: TelegramMessage | undefined,
  source: string,
  updateId: number,
  groups: Map<number, GroupRecord>,
  topics: Map<string, TopicRecord>,
) {
  if (!message) {
    return;
  }

  mergeGroupRecord(groups, message.chat, updateId, message.date, source);

  const threadId = message.message_thread_id;
  if (threadId && isGroupChat(message.chat)) {
    mergeTopicRecord(topics, message.chat, threadId, message, updateId, message.date, source);
  }
}

function inspectUpdate(
  update: TelegramUpdate,
  groups: Map<number, GroupRecord>,
  topics: Map<string, TopicRecord>,
) {
  inspectMessage(update.message, "message", update.update_id, groups, topics);
  inspectMessage(update.edited_message, "edited_message", update.update_id, groups, topics);
  inspectMessage(update.channel_post, "channel_post", update.update_id, groups, topics);
  inspectMessage(
    update.edited_channel_post,
    "edited_channel_post",
    update.update_id,
    groups,
    topics,
  );
  inspectMessage(update.callback_query?.message, "callback_query", update.update_id, groups, topics);

  if (update.my_chat_member?.chat) {
    mergeGroupRecord(
      groups,
      update.my_chat_member.chat,
      update.update_id,
      undefined,
      "my_chat_member",
    );
  }

  if (update.chat_member?.chat) {
    mergeGroupRecord(groups, update.chat_member.chat, update.update_id, undefined, "chat_member");
  }
}

function getSenderName(
  userObj?: Pick<TelegramUser, "first_name" | "last_name" | "username"> | TelegramChat | null,
) {
  if (!userObj) {
    return "N/A";
  }

  const first = userObj.first_name || "";
  const last = userObj.last_name || "";
  const username = userObj.username ? ` (@${userObj.username})` : "";
  return `${first} ${last}`.trim() + username;
}

function parseWorkflowUpdate(update: TelegramUpdate): TelegramWorkflowRow | null {
  const parsed = {
    updateId: update.update_id,
    date: null as string | null,
    chatId: null as number | null,
    chatTitle: "",
    chatType: "",
    topicId: null as number | null,
    topicName: "",
    senderName: "N/A",
    senderId: null as number | null,
    messageText: "",
  };

  let msgObj: TelegramMessage | null = null;

  if (update.message) {
    msgObj = update.message;
  } else if (update.edited_message) {
    msgObj = update.edited_message;
  } else if (update.channel_post) {
    msgObj = update.channel_post;
  } else if (update.edited_channel_post) {
    msgObj = update.edited_channel_post;
  } else if (update.callback_query) {
    msgObj = update.callback_query.message ?? null;
    parsed.senderName = getSenderName(update.callback_query.from);
    parsed.senderId = update.callback_query.from?.id ?? null;
    parsed.messageText = `[Nút bấm] ${update.callback_query.data || ""}`.trim();
  } else if (update.my_chat_member) {
    msgObj = update.my_chat_member.chat ? ({ chat: update.my_chat_member.chat } as TelegramMessage) : null;
    parsed.senderName = getSenderName(update.my_chat_member.from);
    parsed.senderId = update.my_chat_member.from?.id ?? null;
    parsed.messageText = `[Đổi trạng thái bot] ${update.my_chat_member.new_chat_member?.status || ""}`.trim();
  } else if (update.chat_member) {
    msgObj = update.chat_member.chat ? ({ chat: update.chat_member.chat } as TelegramMessage) : null;
    parsed.senderName = getSenderName(update.chat_member.from);
    parsed.senderId = update.chat_member.from?.id ?? null;
    parsed.messageText = "[Đổi trạng thái TV]";
  } else if (update.chat_join_request) {
    msgObj = update.chat_join_request.chat ? ({ chat: update.chat_join_request.chat } as TelegramMessage) : null;
    parsed.senderName = getSenderName(update.chat_join_request.from);
    parsed.senderId = update.chat_join_request.from?.id ?? null;
    parsed.messageText = "[Yêu cầu tham gia]";
  }

  if (!msgObj) {
    return null;
  }

  if (msgObj.date) {
    parsed.date = new Date(msgObj.date * 1000).toISOString();
  } else if (update.my_chat_member?.date) {
    parsed.date = new Date(update.my_chat_member.date * 1000).toISOString();
  } else if (update.chat_member?.date) {
    parsed.date = new Date(update.chat_member.date * 1000).toISOString();
  } else if (update.chat_join_request?.date) {
    parsed.date = new Date(update.chat_join_request.date * 1000).toISOString();
  } else {
    parsed.date = new Date().toISOString();
  }

  const chat = msgObj.chat || (msgObj as TelegramMessage);
  if (chat?.id) {
    parsed.chatId = chat.id;
    parsed.chatType = chat.type || "";
    parsed.chatTitle = chat.type === "private" ? getSenderName(chat as unknown as TelegramUser) : chat.title || "Không có tiêu đề";
  }

  if (msgObj.message_thread_id) {
    parsed.topicId = msgObj.message_thread_id;
  }

  if (msgObj.forum_topic_created) {
    parsed.topicName = msgObj.forum_topic_created.name || "";
  } else if (msgObj.forum_topic_edited) {
    parsed.topicName = msgObj.forum_topic_edited.name || "";
  }

  if (msgObj.from && parsed.senderName === "N/A") {
    parsed.senderName = getSenderName(msgObj.from);
    parsed.senderId = msgObj.from.id;
  }

  if (parsed.messageText === "") {
    if (msgObj.text) {
      parsed.messageText = msgObj.text;
    } else if (msgObj.caption) {
      parsed.messageText = `[Media] ${msgObj.caption}`;
    } else if (msgObj.forum_topic_created) {
      parsed.messageText = `[Tạo Topic] "${msgObj.forum_topic_created.name}"`;
    } else if (msgObj.new_chat_members?.length) {
      parsed.messageText = "[TV Mới Gia Nhập]";
    } else if (msgObj.left_chat_member) {
      parsed.messageText = "[TV Rời Nhóm]";
    } else {
      parsed.messageText = "[Sự kiện khác]";
    }
  }

  return {
    updateId: parsed.updateId,
    date: parsed.date,
    chatId: parsed.chatId,
    chatTitle: parsed.chatTitle,
    chatType: parsed.chatType,
    topicId: parsed.topicId,
    topicName: parsed.topicName,
    senderName: parsed.senderName,
    senderId: parsed.senderId,
    messageText: parsed.messageText,
    rawUpdate: update,
  };
}

export async function fetchUpdatesBatch(token: string, offset?: number) {
  return telegramRequest<TelegramUpdate[]>(token, "getUpdates", {
    limit: 100,
    timeout: 0,
    allowed_updates: JSON.stringify([
      "message",
      "edited_message",
      "channel_post",
      "edited_channel_post",
      "callback_query",
      "my_chat_member",
      "chat_member",
    ]),
    offset,
  });
}

function buildUniqueChats(rows: TelegramWorkflowRow[]) {
  const chats = new Map<number, { chatId: number; chatTitle: string; chatType: string }>();
  for (const row of rows) {
    if (row.chatId == null) {
      continue;
    }
    if (!chats.has(row.chatId)) {
      chats.set(row.chatId, {
        chatId: row.chatId,
        chatTitle: row.chatTitle,
        chatType: row.chatType,
      });
    }
  }
  return Array.from(chats.values());
}

function buildUniqueTopics(rows: TelegramWorkflowRow[]) {
  const topics = new Map<string, { chatId: number; threadId: number; chatTitle: string; topicName: string }>();
  for (const row of rows) {
    if (row.chatId == null || row.topicId == null) {
      continue;
    }
    const key = `${row.chatId}:${row.topicId}`;
    const existing = topics.get(key);
    const nextTopicName = row.topicName.trim();

    if (!existing) {
      topics.set(key, {
        chatId: row.chatId,
        threadId: row.topicId,
        chatTitle: row.chatTitle,
        topicName: nextTopicName,
      });
      continue;
    }

    topics.set(key, {
      chatId: row.chatId,
      threadId: row.topicId,
      chatTitle: row.chatTitle || existing.chatTitle,
      topicName:
        !isPlaceholderTopicName(nextTopicName, row.topicId)
          ? nextTopicName
          : !isPlaceholderTopicName(existing.topicName, row.topicId)
            ? existing.topicName
            : nextTopicName || existing.topicName,
    });
  }
  return Array.from(topics.values());
}

export function buildN8nExpression(items: TelegramN8nItem[]) {
  if (items.length === 0) {
    return "// Add chats/topics to generate an n8n expression.";
  }

  const lines = items
    .map((item) => `    { chatId: ${item.chatId}, threadId: ${item.threadId === null ? "null" : item.threadId} }`)
    .join(",\n");

  return `{{ (() => {
  const chatId = Number($json.message?.chat?.id ?? $json.callback_query?.message?.chat?.id);
  const threadId = Number($json.message?.message_thread_id ?? $json.callback_query?.message?.message_thread_id);

  const allowedTopics = [
${lines}
  ];

  return allowedTopics.some(item => item.chatId === chatId && (item.threadId === null ? true : item.threadId === threadId));
})() }}`;
}

export async function deleteTelegramWebhook(token: string) {
  return telegramRequest<{ ok: boolean; description?: string }>(token, "deleteWebhook");
}

export async function scanTelegramWorkflow(token: string, options: ScanOptions = {}) {
  const bot = await telegramRequest<TelegramBotInfo>(token, "getMe");
  const webhook = await telegramRequest<TelegramWebhookInfo>(token, "getWebhookInfo");

  const warnings = new Set<string>();
  const deepScan = Boolean(options.deepScan);
  const rows: TelegramWorkflowRow[] = [];

  let updateCount = 0;
  let pagesFetched = 0;
  let truncated = false;
  let offset: number | undefined;

  while (true) {
    const updates = await fetchUpdatesBatch(token, offset);
    pagesFetched += 1;

    if (updates.length === 0) {
      break;
    }

    for (const update of updates) {
      updateCount += 1;
      const row = parseWorkflowUpdate(update);
      if (row && row.chatId !== null) {
        rows.push(row);
      }
    }

    const lastUpdate = updates[updates.length - 1];
    if (!deepScan) {
      truncated = updates.length >= 100;
      break;
    }

    if (updates.length < 100) {
      break;
    }

    offset = lastUpdate.update_id + 1;

    if (pagesFetched >= 10) {
      truncated = true;
      warnings.add("Deep scan stopped at 10 pages để tránh quét quá nhiều update.");
      break;
    }
  }

  rows.sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime || b.updateId - a.updateId;
  });

  if (webhook.url) {
    warnings.add("Webhook đang bật, nên getUpdates có thể không trả đủ dữ liệu. Nếu cần, hãy tắt webhook trước khi quét.");
  }

  if (!deepScan && truncated) {
    warnings.add("Chế độ preview chỉ đọc tối đa 100 update đầu tiên.");
  }

  if (webhook.pending_update_count > 0) {
    warnings.add(`Telegram đang giữ ${webhook.pending_update_count} update chưa xử lý.`);
  }

  const uniqueChats = buildUniqueChats(rows);
  const uniqueTopics = buildUniqueTopics(rows);

  return {
    bot,
    webhook,
    updates: rows,
    groups: uniqueChats,
    topics: uniqueTopics,
    warnings: Array.from(warnings),
    meta: {
      updateCount,
      deepScan,
      truncated,
      pagesFetched,
      uniqueChatCount: uniqueChats.length,
      topicCount: uniqueTopics.length,
    },
  } satisfies TelegramWorkflowSnapshot & {
    groups: { chatId: number; chatTitle: string; chatType: string }[];
    topics: { chatId: number; threadId: number; chatTitle: string; topicName: string }[];
  };
}

export async function scanTelegramBot(token: string, options: ScanOptions = {}) {
  const bot = await telegramRequest<TelegramBotInfo>(token, "getMe");
  const webhook = await telegramRequest<TelegramWebhookInfo>(token, "getWebhookInfo");

  const groups = new Map<number, GroupRecord>();
  const topics = new Map<string, TopicRecord>();
  const warnings = new Set<string>();
  const deepScan = Boolean(options.deepScan);

  let updateCount = 0;
  let pagesFetched = 0;
  let truncated = false;
  let offset: number | undefined;

  while (true) {
    const updates = await fetchUpdatesBatch(token, offset);
    pagesFetched += 1;

    if (updates.length === 0) {
      break;
    }

    for (const update of updates) {
      updateCount += 1;
      inspectUpdate(update, groups, topics);
    }

    const lastUpdate = updates[updates.length - 1];
    if (!deepScan) {
      truncated = updates.length >= 100;
      break;
    }

    if (updates.length < 100) {
      break;
    }

    offset = lastUpdate.update_id + 1;

    if (pagesFetched >= 10) {
      truncated = true;
      warnings.add("Deep scan stopped at 10 pages để tránh quét quá nhiều update.");
      break;
    }
  }

  if (webhook.url) {
    warnings.add(
      "Webhook đang bật, nên getUpdates có thể không trả đủ dữ liệu. Nếu cần, hãy tắt webhook trước khi quét.",
    );
  }

  if (!deepScan && truncated) {
    warnings.add("Chế độ preview chỉ đọc tối đa 100 update đầu tiên.");
  }

  if (webhook.pending_update_count > 0) {
    warnings.add(`Telegram đang giữ ${webhook.pending_update_count} update chưa xử lý.`);
  }

  return {
    bot,
    webhook,
    groups: Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title)),
    topics: Array.from(topics.values()).sort((a, b) => {
      if (a.chatTitle === b.chatTitle) {
        return a.threadId - b.threadId;
      }
      return a.chatTitle.localeCompare(b.chatTitle);
    }),
    warnings: Array.from(warnings),
    meta: {
      updateCount,
      deepScan,
      truncated,
      pagesFetched,
    },
  };
}
