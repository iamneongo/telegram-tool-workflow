"use client";

import {
  AdjustmentsHorizontalIcon,
  ArrowPathRoundedSquareIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowUturnRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  BoltIcon,
  BriefcaseIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PhotoIcon,
  PlayIcon,
  QuestionMarkCircleIcon,
  SquaresPlusIcon,
  StopIcon,
  XMarkIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  MarkerType,
  Position,
  EdgeLabelRenderer,
  ReactFlow,
  applyNodeChanges,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type NodeChange,
  type ReactFlowInstance,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
  addEdge,
  type Connection,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TelegramWorkflowSnapshot } from "@/lib/telegram";
import type { WorkspaceRecord, WorkspaceRecordPatch } from "@/lib/workspace-store";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type NodeAccent = "cyan" | "emerald" | "amber" | "rose";
type NodeKind = "trigger" | "condition" | "action";
type JsonRecord = Record<string, unknown>;

type MessageTemplateConfig = {
  nodeName: string;
  template: string;
};

type ConfigPanelTab = "target" | "template" | "mappings";

type ConfigPanelTabSpec = {
  id: ConfigPanelTab;
  label: string;
};

type TargetRoutingMode = "fixed" | "previous";

type AllowedTopicSelection = {
  chatId: number;
  threadId: number | null;
  chatTitle: string;
  topicName: string;
};

type N8nCredentialRef = {
  id?: string;
  name: string;
};

type N8nNodeConfig = {
  id: string;
  name: string;
  displayName?: string;
  n8nType: string;
  typeVersion: number;
  position: [number, number];
  kind: NodeKind;
  accent: NodeAccent;
  subtitle: string;
  detail: string;
  parameters: JsonRecord;
  credentials?: Record<string, N8nCredentialRef>;
  webhookId?: string;
};

type N8nConnection = {
  node: string;
  type: "main";
  index: number;
};

type N8nConnections = Record<string, { main: N8nConnection[][] }>;

type N8nWorkflowTemplate = {
  id: string;
  name: string;
  active: boolean;
  settings: JsonRecord;
  nodes: N8nNodeConfig[];
  connections: N8nConnections;
};

type WorkflowNodeData = {
  title: string;
  subtitle: string;
  sourceName: string;
  kind: NodeKind;
  accent: NodeAccent;
  detail?: string;
  executionState?: ExecutionState;
  executionNote?: string;
};

type WorkflowNode = Node<WorkflowNodeData, "workflowNode">;

type StatusState =
  | { kind: "idle"; text: string }
  | { kind: "loading"; text: string }
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

type ExecutionState = "running" | "success" | "skipped" | "error";

type RuntimeExecutionStep = {
  nodeName: string;
  status: ExecutionState;
  at: string;
  note?: string;
};

type RuntimeExecution = {
  id: number;
  updateId: number;
  kind: "message" | "callback" | "unknown";
  status: ExecutionState;
  title: string;
  startedAt: string;
  endedAt: string | null;
  activeNodeName: string | null;
  summary: string;
  steps: RuntimeExecutionStep[];
};

type RuntimeStatus = {
  active: boolean;
  polling: boolean;
  pollMs: number;
  startedAt: string | null;
  stoppedAt: string | null;
  lastUpdateAt: string | null;
  lastError: string | null;
  handledCount: number;
  ignoredCount: number;
  logs: Array<{
    at: string;
    level: "info" | "warn" | "error";
    message: string;
    updateId?: number;
  }>;
  allowedTopics: AllowedTopicSelection[];
  inventory: {
    groups: { chatId: number; chatTitle: string; chatType: string; photoFileId?: string | null }[];
    topics: { chatId: number; threadId: number; chatTitle: string; topicName: string }[];
    updatedAt: string | null;
  };
  executionSeq: number;
  currentExecution: RuntimeExecution | null;
  lastExecution: RuntimeExecution | null;
  offset?: number;
  hasToken: boolean;
};

const DEFAULT_ALLOWED_TOPICS: AllowedTopicSelection[] = [];

const MESSAGE_TEMPLATE_HELP_TEXT =
  "Chỉ sửa phần chữ được cho phép. Biến và cú pháp đã được khóa để tránh lỗi workflow.";

function isMessageTemplateNode(nodeName: string) {
  return (
    nodeName === "Tin nhắn Telegram" ||
    nodeName.startsWith("Gửi tin nhắn xác nhận") ||
    nodeName.startsWith("Từ chối tin nhắn") ||
    nodeName.startsWith("Có vật tư") ||
    nodeName.startsWith("Không có vật tư") ||
    nodeName.startsWith("Có vật tư thay thế") ||
    nodeName.startsWith("Xác nhận nhà cung ứng") ||
    nodeName.startsWith("Nghiệm thu vật tư")
  );
}

function isSafeMessageTemplateEditableNode(nodeName: string) {
  return nodeName.startsWith("Từ chối tin nhắn") || nodeName.startsWith("Nghiệm thu vật tư");
}

function escapeHtmlLiteral(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlLiteral(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function sanitizePlainText(value: string) {
  return value.replace(/\{\{/g, "{").replace(/\}\}/g, "}");
}

function defaultMessageTemplateForNode(nodeName: string) {
  if (nodeName.startsWith("Gửi tin nhắn xác nhận")) {
    return "{{originalText}}";
  }
  if (nodeName.startsWith("Từ chối tin nhắn")) {
    return "Đã bị từ chối: {{originalText}}";
  }
  if (nodeName.startsWith("Có vật tư thay thế")) {
    return "🔄 <b>Thông tin vật tư thay thế từ {{userName}}</b>{{requestContext}}\n\n\"{{replyText}}\"";
  }
  if (nodeName.startsWith("Có vật tư")) {
    return "{{originalText}}\n\n{{statusHtml}}";
  }
  if (nodeName.startsWith("Không có vật tư")) {
    return "{{originalText}}\n\n{{statusHtml}}";
  }
  if (nodeName.startsWith("Xác nhận nhà cung ứng")) {
    return "📦 {{statusHtml}}\n\nVui lòng reply tin nhắn này để xác nhận nhà cung ứng đã đến.";
  }
  if (nodeName.startsWith("Nghiệm thu vật tư")) {
    return "📋 <b>{{userName}}</b> nghiệm thu vật tư sau xác nhận nhà cung ứng.\n\n{{replyText}}";
  }
  return "{{originalText}}";
}

function getMessageTemplateValue(config: N8nNodeConfig) {
  const value = typeof config.parameters.messageTemplate === "string" ? config.parameters.messageTemplate.trim() : "";
  return value || defaultMessageTemplateForNode(config.name);
}

function getSafeMessageTemplateText(nodeName: string, template: string) {
  if (nodeName.startsWith("Từ chối tin nhắn")) {
    const suffix = "{{originalText}}";
    if (template.endsWith(suffix)) {
      return decodeHtmlLiteral(template.slice(0, template.length - suffix.length));
    }

    return "Đã bị từ chối: ";
  }

  if (nodeName.startsWith("Nghiệm thu vật tư")) {
    const prefix = "📋 <b>{{userName}}</b>";
    const suffix = "{{replyText}}";
    if (template.startsWith(prefix) && template.endsWith(suffix)) {
      return decodeHtmlLiteral(template.slice(prefix.length, template.length - suffix.length));
    }

    return " nghiệm thu vật tư sau xác nhận nhà cung ứng.\n\n";
  }

  return "";
}

function buildSafeMessageTemplate(nodeName: string, text: string) {
  const safeText = escapeHtmlLiteral(sanitizePlainText(text));

  if (nodeName.startsWith("Từ chối tin nhắn")) {
    return `${safeText}{{originalText}}`;
  }

  if (nodeName.startsWith("Nghiệm thu vật tư")) {
    return `📋 <b>{{userName}}</b>${safeText}{{replyText}}`;
  }

  return defaultMessageTemplateForNode(nodeName);
}

function getConfigPanelTabs(config: N8nNodeConfig | undefined): ConfigPanelTabSpec[] {
  if (!config) {
    return [];
  }

  if (config.name === "Allowed Group Topic") {
    return [{ id: "target", label: "Group/Topic" }];
  }

  if (config.name.startsWith("Chuyển tiếp Vật tư")) {
    return [{ id: "mappings", label: "Mapping" }];
  }

  const tabs: ConfigPanelTabSpec[] = [];

  if (isTargetConfigurableNode(config.name)) {
    tabs.push({ id: "target", label: "Đích" });
  }

  if (isSafeMessageTemplateEditableNode(config.name)) {
    tabs.push({ id: "template", label: "Mẫu tin nhắn" });
  }

  return tabs;
}

function HoverTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        aria-label="Hướng dẫn"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white/32 transition hover:text-white/70"
      >
        <QuestionMarkCircleIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-[6px] border border-white/10 bg-[#101113] px-3 py-2 text-[11px] leading-5 text-white/72 shadow-[0_16px_40px_rgba(0,0,0,0.45)] group-hover:block">
        {text}
      </span>
    </span>
  );
}

function getDefaultConfigPanelTab(config: N8nNodeConfig | undefined): ConfigPanelTab {
  return getConfigPanelTabs(config)[0]?.id ?? "target";
}

const WORKFLOW_TEMPLATE: N8nWorkflowTemplate = {
  id: "8a2b7f18-76cf-4d64-8e6e-0f9a5e78d1f1",
  name: "Workflow Gia Phú Telegram",
  active: true,
  settings: {
    executionOrder: "v1",
    binaryMode: "separate",
  },
  nodes: [
    {
      id: "75bae1e2-ae2b-45eb-9670-50604261269b",
      name: "Telegram Trigger",
      n8nType: "n8n-nodes-base.telegramTrigger",
      typeVersion: 1.3,
      position: [-3824, -1840],
      kind: "trigger",
      accent: "cyan",
      subtitle: "Updates: message, callback_query",
      detail: "telegramTrigger",
      parameters: {
        updates: ["message", "callback_query"],
        additionalFields: {},
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "e65e36c0-bd3b-47a9-a2eb-befc083b4a33",
    },
    {
      id: "5d5b47c0-9b04-4efb-bf15-2d9a0d447cc8",
      name: "Allowed Group Topic",
      n8nType: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [-3552, -1840],
      kind: "condition",
      accent: "emerald",
      subtitle: "0 selected",
      detail: "if",
      parameters: {
        allowedTopics: DEFAULT_ALLOWED_TOPICS,
      },
    },
    {
      id: "c1dfdc40-e554-4800-a5b2-a3b3be108d59",
      name: "Has Callback",
      n8nType: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [-3296, -1856],
      kind: "condition",
      accent: "emerald",
      subtitle: "callback_query?",
      detail: "if",
      parameters: {
        conditions: {
          options: {
            caseSensitive: false,
            leftValue: "",
            typeValidation: "strict",
            version: 3,
          },
          conditions: [
            {
              leftValue: '={{ !!$node["Telegram Trigger"].json.callback_query }}',
              rightValue: true,
              operator: {
                type: "boolean",
                operation: "equals",
              },
              id: "f51d2973-f03e-40ad-b301-94fa0f98f833",
            },
          ],
          combinator: "and",
        },
        options: {
          ignoreCase: true,
        },
      },
    },
    {
      id: "1e9b8778-fbb7-4db3-a5d5-fc089aae3881",
      name: "Lấy tin nhắn - 1",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-3040, -1968],
      kind: "action",
      accent: "cyan",
      subtitle: "resource: chat",
      detail: "telegram",
      parameters: {
        resource: "chat",
        chatId: "-1003954561827",
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "bf5629b1-ef95-4a3e-96a6-fd7879402abe",
    },
    {
      id: "2c6f02c3-d322-4fb9-9e76-6e1d62640cb1",
      name: "Callback Answer",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2800, -1968],
      kind: "action",
      accent: "cyan",
      subtitle: "resource: callback",
      detail: "telegram",
      parameters: {
        resource: "callback",
        queryId: '={{ $node["Telegram Trigger"].json.callback_query.id }}',
        additionalFields: {
          cache_time: 0,
          show_alert: false,
          text: "đã ghi nhận",
        },
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "7c3c0a9a-4d79-45da-9e05-1c98f04d0a1f",
    },
    {
      id: "9bfb1a1e-2ae7-41f8-aa01-c8bb9a90a1de",
      name: "Quyết định phê duyệt",
      n8nType: "n8n-nodes-base.if",
      typeVersion: 2.3,
      position: [-2608, -1968],
      kind: "condition",
      accent: "amber",
      subtitle: "callback data = approve",
      detail: "if",
      parameters: {
        conditions: {
          options: {
            caseSensitive: false,
            leftValue: "",
            typeValidation: "strict",
            version: 3,
          },
          conditions: [
            {
              leftValue: '={{ $node["Telegram Trigger"].json.callback_query.data.split("|")[0] }}',
              rightValue: "approve",
              operator: {
                type: "string",
                operation: "equals",
              },
              id: "0b76c416-6923-4b08-a459-75a269281864",
            },
          ],
          combinator: "and",
        },
        options: {
          ignoreCase: true,
        },
      },
    },
    {
      id: "24af33f3-83ea-42fc-bd35-895a69f4d1ed",
      name: "Đồng ý phê duyệt",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2352, -2048],
      kind: "action",
      accent: "cyan",
      subtitle: "ẩn nút",
      detail: "telegram",
      parameters: {
        chatId: '={{ $node["Telegram Trigger"].json.callback_query.message.chat.id }}',
        messageId: '={{ $node["Telegram Trigger"].json.callback_query.message.message_id }}',
        reply_markup: {
          inline_keyboard: [],
        },
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "885cf630-5f05-4169-9dd1-45d9291c5882",
    },
    {
      id: "06ae59c5-9ef4-4d45-9996-98b981040626",
      name: "Forward Tin nhắn",
      n8nType: "n8n-nodes-forward-bot-telegram.forwardBotTelegram",
      typeVersion: 1,
      position: [-2112, -2064],
      kind: "action",
      accent: "cyan",
      subtitle: "forwardMessage",
      detail: "custom node",
      parameters: {
        target: null,
        destinationChatId: "-5333921701",
        sourceChatId: '={{ $node["Telegram Trigger"].json.callback_query.data.split("|")[1] }}',
        messageId: '={{ $node["Telegram Trigger"].json.callback_query.data.split("|")[2] }}',
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
    },
    {
      id: "a48c4c5c-a13d-44c7-a4ce-b214ef232e8c",
      name: "Từ chối phê duyệt",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2352, -1808],
      kind: "action",
      accent: "rose",
      subtitle: "ẩn nút",
      detail: "telegram",
      parameters: {
        chatId: '={{ $node["Telegram Trigger"].json.callback_query.message.chat.id }}',
        messageId: '={{ $node["Telegram Trigger"].json.callback_query.message.message_id }}',
        reply_markup: {
          inline_keyboard: [],
        },
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "fe95eedf-9fce-4348-870a-54e3b689066c",
    },
    {
      id: "reject-bot-telegram-node",
      name: "Từ chối tin nhắn",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2112, -1808],
      kind: "action",
      accent: "rose",
      subtitle: "sendMessage",
      detail: "telegram",
      parameters: {
        target: null,
        chatId: '={{ $node["Telegram Trigger"].json.callback_query.data.split("|")[1] }}',
        text: '={{ "Đã bị từ chối: " + $node["Telegram Trigger"].json.callback_query.message.text }}',
        additionalFields: {
          appendAttribution: false,
        },
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "reject-bot-telegram-webhook",
    },
    {
      id: "ce033b04-98b5-4622-b1f1-d7b0088c551f",
      name: "Lấy tin nhắn - 2",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-3040, -1648],
      kind: "action",
      accent: "cyan",
      subtitle: "resource: chat",
      detail: "telegram",
      parameters: {
        resource: "chat",
        chatId: "=-1003954561827",
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "b5312c6e-9fee-4d33-80e7-e2b839048b66",
    },
    {
      id: "d3c0ca13-7938-497e-bfa2-11dc7b2215d7",
      name: "Gửi tin nhắn xác nhận",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2768, -1616],
      kind: "action",
      accent: "cyan",
      subtitle: "sendMessage inline keyboard",
      detail: "telegram",
      parameters: {
        chatId: "=-1004312722594",
        text: '={{ $node["Telegram Trigger"].json.message.text }}',
        replyMarkup: "inlineKeyboard",
        inlineKeyboard: {
          rows: [
            {
              row: {
                buttons: [
                  {
                    text: "Đồng ý",
                    additionalFields: {
                      callback_data:
                        '={{ "approve|" + $node["Telegram Trigger"].json.message.chat.id + "|" + $node["Telegram Trigger"].json.message.message_id }}',
                    },
                  },
                  {
                    text: "Không đồng ý",
                    additionalFields: {
                      callback_data:
                        '={{ "reject|" + $node["Telegram Trigger"].json.message.chat.id + "|" + $node["Telegram Trigger"].json.message.message_id }}',
                    },
                  },
                ],
              },
            },
          ],
        },
        additionalFields: {
          appendAttribution: false,
          message_thread_id: 23,
        },
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "41258947-bbb1-48e7-87cc-06ca4115ec4e",
    },
    {
      id: "supplier-confirmation-node",
      name: "Xác nhận nhà cung ứng",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2504, -1408],
      kind: "action",
      accent: "amber",
      subtitle: "sendMessage force_reply",
      detail: "telegram",
      parameters: {
        target: null,
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "supplier-confirmation-webhook",
    },
    {
      id: "inspection-material-node",
      name: "Nghiệm thu vật tư",
      n8nType: "n8n-nodes-base.telegram",
      typeVersion: 1.2,
      position: [-2260, -1264],
      kind: "action",
      accent: "emerald",
      subtitle: "sendMessage",
      detail: "telegram",
      parameters: {
        target: null,
      },
      credentials: {
        telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
      },
      webhookId: "inspection-material-webhook",
    },
  ],
  connections: {
    "Telegram Trigger": {
      main: [[{ node: "Allowed Group Topic", type: "main", index: 0 }]],
    },
    "Allowed Group Topic": {
      main: [[{ node: "Has Callback", type: "main", index: 0 }], []],
    },
    "Has Callback": {
      main: [[{ node: "Lấy tin nhắn - 1", type: "main", index: 0 }], [{ node: "Lấy tin nhắn - 2", type: "main", index: 0 }]],
    },
    "Lấy tin nhắn - 1": {
      main: [[{ node: "Callback Answer", type: "main", index: 0 }]],
    },
    "Callback Answer": {
      main: [[{ node: "Quyết định phê duyệt", type: "main", index: 0 }]],
    },
    "Quyết định phê duyệt": {
      main: [[{ node: "Đồng ý phê duyệt", type: "main", index: 0 }], [{ node: "Từ chối phê duyệt", type: "main", index: 0 }]],
    },
    "Đồng ý phê duyệt": {
      main: [[{ node: "Forward Tin nhắn", type: "main", index: 0 }]],
    },
    "Từ chối phê duyệt": {
      main: [[{ node: "Từ chối tin nhắn", type: "main", index: 0 }]],
    },
    "Lấy tin nhắn - 2": {
      main: [[{ node: "Gửi tin nhắn xác nhận", type: "main", index: 0 }]],
    },
    "Forward Tin nhắn": { main: [[]] },
    "Từ chối tin nhắn": { main: [[]] },
    "Gửi tin nhắn xác nhận": { main: [[]] },
    "Xác nhận nhà cung ứng": { main: [[]] },
    "Nghiệm thu vật tư": { main: [[]] },
  },
};

const NODE_PALETTE: Array<{
  id: string;
  label: string;
  kind: NodeKind;
  accent: NodeAccent;
  n8nType: string;
  typeVersion: number;
  detail: string;
  subtitle: string;
  parameters: JsonRecord;
}> = [
  {
    id: "telegram-send",
    label: "Tin nhắn Telegram",
    kind: "action",
    accent: "cyan",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "telegram",
    subtitle: "sendMessage",
    parameters: {
      chatId: "",
      text: "",
      additionalFields: {
        appendAttribution: false,
      },
    },
  },
  {
    id: "telegram-edit",
    label: "Sửa tin nhắn",
    kind: "action",
    accent: "cyan",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "telegram",
    subtitle: "editMessageText",
    parameters: {
      operation: "editMessageText",
      chatId: "",
      messageId: "",
      text: "",
      additionalFields: {},
    },
  },
  {
    id: "if-condition",
    label: "Điều kiện",
    kind: "condition",
    accent: "emerald",
    n8nType: "n8n-nodes-base.if",
    typeVersion: 2.3,
    detail: "if",
    subtitle: "condition",
    parameters: {
      conditions: {
        options: {
          caseSensitive: false,
          leftValue: "",
          typeValidation: "strict",
          version: 3,
        },
        conditions: [],
        combinator: "and",
      },
      options: {
        ignoreCase: true,
      },
    },
  },
  {
    id: "forward-custom",
    label: "Chuyển tiếp",
    kind: "action",
    accent: "amber",
    n8nType: "n8n-nodes-forward-bot-telegram.forwardBotTelegram",
    typeVersion: 1,
    detail: "custom node",
    subtitle: "forwardMessage",
    parameters: {
      target: null,
      destinationChatId: "",
      sourceChatId: "",
      messageId: "",
    },
  },
  {
    id: "forward-vattu",
    label: "Chuyển tiếp Vật tư",
    kind: "action",
    accent: "amber",
    n8nType: "n8n-nodes-forward-bot-telegram.forwardBotTelegram",
    typeVersion: 1,
    detail: "custom node",
    subtitle: "forwardMessage",
    parameters: {
      mappings: [],
    },
  },
  {
    id: "vattu-co",
    label: "Có vật tư",
    kind: "action",
    accent: "emerald",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "custom node",
    subtitle: "sendMessage",
    parameters: {
      target: null,
    },
  },
  {
    id: "vattu-khong",
    label: "Không có vật tư",
    kind: "action",
    accent: "rose",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "custom node",
    subtitle: "sendMessage",
    parameters: {
      target: null,
    },
  },
  {
    id: "vattu-thaythe",
    label: "Có vật tư thay thế",
    kind: "action",
    accent: "amber",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "custom node",
    subtitle: "sendMessage",
    parameters: {
      target: null,
    },
  },
  {
    id: "supplier-confirmation",
    label: "Xác nhận nhà cung ứng",
    kind: "action",
    accent: "amber",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "telegram",
    subtitle: "sendMessage force_reply",
    parameters: {
      target: null,
    },
  },
  {
    id: "inspection-material",
    label: "Nghiệm thu vật tư",
    kind: "action",
    accent: "emerald",
    n8nType: "n8n-nodes-base.telegram",
    typeVersion: 1.2,
    detail: "telegram",
    subtitle: "sendMessage",
    parameters: {
      target: null,
    },
  },
];

const accentStyles: Record<NodeAccent, { ring: string; glow: string; text: string }> = {
  cyan: {
    ring: "border-sky-400/25",
    glow: "shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_16px_50px_rgba(2,132,199,0.12)]",
    text: "text-sky-300",
  },
  emerald: {
    ring: "border-emerald-400/25",
    glow: "shadow-[0_0_0_1px_rgba(74,222,128,0.18),0_16px_50px_rgba(16,185,129,0.12)]",
    text: "text-emerald-300",
  },
  amber: {
    ring: "border-amber-400/25",
    glow: "shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_16px_50px_rgba(245,158,11,0.12)]",
    text: "text-amber-300",
  },
  rose: {
    ring: "border-rose-400/25",
    glow: "shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_16px_50px_rgba(244,63,94,0.12)]",
    text: "text-rose-300",
  },
};

const NODE_DISPLAY_NAMES: Record<string, string> = {
  "Telegram Trigger": "Bắt Telegram",
  "Allowed Group Topic": "Cài đặt group/topic",
  "Has Callback": "Kiểm tra callback",
  "Lấy tin nhắn - 1": "Lấy callback",
  "Lấy tin nhắn - 2": "Lấy tin nhắn",
  "Callback Answer": "Trả lời callback",
  "Quyết định phê duyệt": "Quyết định",
  "Đồng ý phê duyệt": "Đồng ý",
  "Từ chối phê duyệt": "Từ chối",
  "Forward Tin nhắn": "Chuyển tiếp",
  "Từ chối tin nhắn": "Báo từ chối",
  "Gửi tin nhắn xác nhận": "Gửi xin duyệt",
  "Xác nhận nhà cung ứng": "Xác nhận nhà cung ứng",
  "Nghiệm thu vật tư": "Nghiệm thu vật tư",
};

function getNodeDisplayName(name: string) {
  return NODE_DISPLAY_NAMES[name] ?? name;
}

function getNodeLabel(config: Pick<N8nNodeConfig, "name" | "displayName">) {
  const customLabel = typeof config.displayName === "string" ? config.displayName.trim() : "";
  return customLabel || getNodeDisplayName(config.name);
}

function getNodeSetupSummary(name: string) {
  switch (name) {
    case "Telegram Trigger":
      return "Bắt update từ Telegram";
    case "Allowed Group Topic":
      return "Chọn group chat và topic cho phép";
    case "Has Callback":
      return "Tách nhánh callback và tin nhắn thường";
    case "Lấy tin nhắn - 1":
      return "Lấy thông tin callback";
    case "Lấy tin nhắn - 2":
      return "Lấy thông tin tin nhắn";
    case "Callback Answer":
      return "Trả lời callback";
    case "Quyết định phê duyệt":
      return "Kiểm tra đồng ý hay từ chối";
    case "Đồng ý phê duyệt":
      return "Ẩn nút đồng ý / không đồng ý";
    case "Từ chối phê duyệt":
      return "Ẩn nút đồng ý / không đồng ý";
    case "Forward Tin nhắn":
      return "Chọn nơi chuyển tiếp";
    case "Từ chối tin nhắn":
      return "Chọn nơi gửi thông báo từ chối";
    case "Gửi tin nhắn xác nhận":
      return "Gửi tin nhắn xác nhận vào group/topic";
    case "Xác nhận nhà cung ứng":
      return "Chọn group/topic xác nhận nhà cung ứng";
    case "Nghiệm thu vật tư":
      return "Chọn group/topic nghiệm thu vật tư";
    default:
      return "Đã thiết lập sẵn";
  }
}

function NodeHeroIcon({ data }: { data: WorkflowNodeData }) {
  const className = "h-5 w-5 stroke-[1.8]";
  const sourceName = data.sourceName || data.title;

  if (data.kind === "trigger") return <BoltIcon aria-hidden="true" className={className} />;
  if (data.kind === "condition") return <ArrowPathRoundedSquareIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("Đồng ý")) return <CheckCircleIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("Từ chối")) return <XCircleIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("nhà cung ứng")) return <BriefcaseIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("Nghiệm thu")) return <CheckCircleIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("Forward")) return <ArrowRightIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("Gửi") || sourceName.includes("Lấy")) {
    return <ChatBubbleBottomCenterTextIcon aria-hidden="true" className={className} />;
  }
  if (sourceName.includes("Callback")) return <QuestionMarkCircleIcon aria-hidden="true" className={className} />;
  return <PaperAirplaneIcon aria-hidden="true" className={className} />;
}

function getPaletteIcon(itemId: string) {
  const sizeClass = "h-5 w-5";
  switch (itemId) {
    case "telegram-send":
      return {
        bg: "bg-[#229ED9]/15 border-[#229ED9]/30 text-[#229ED9] shadow-[0_2px_10px_rgba(34,158,217,0.12)]",
        icon: <PaperAirplaneIcon className={sizeClass} />,
      };
    case "telegram-edit":
      return {
        bg: "bg-[#2AABEE]/15 border-[#2AABEE]/30 text-[#2AABEE]",
        icon: <PencilSquareIcon className={sizeClass} />,
      };
    case "if-condition":
      return {
        bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
        icon: <ArrowPathRoundedSquareIcon className={sizeClass} />,
      };
    case "forward-custom":
      return {
        bg: "bg-amber-500/15 border-amber-500/30 text-amber-400",
        icon: <ArrowUturnRightIcon className={sizeClass} />,
      };
    case "forward-vattu":
      return {
        bg: "bg-[#FF9500]/15 border-[#FF9500]/30 text-[#FF9500] shadow-[0_2px_10px_rgba(255,149,0,0.12)]",
        icon: <BriefcaseIcon className={sizeClass} />,
      };
    case "supplier-confirmation":
      return {
        bg: "bg-amber-500/15 border-amber-500/30 text-amber-300 shadow-[0_2px_10px_rgba(245,158,11,0.12)]",
        icon: <BriefcaseIcon className={sizeClass} />,
      };
    case "inspection-material":
      return {
        bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
        icon: <CheckCircleIcon className={sizeClass} />,
      };
    default:
      return {
        bg: "bg-white/10 border-white/10 text-white/70",
        icon: <PaperAirplaneIcon className={sizeClass} />,
      };
  }
}

function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowNode>) {
  const accent = accentStyles[data.accent];
  const executionClass =
    data.executionState === "running"
      ? "border-sky-300/80 bg-sky-950/35 shadow-[0_0_0_1px_rgba(125,211,252,0.4),0_0_42px_rgba(14,165,233,0.32)]"
      : data.executionState === "success"
        ? "border-emerald-300/65 bg-emerald-950/20 shadow-[0_0_0_1px_rgba(110,231,183,0.28),0_0_28px_rgba(16,185,129,0.18)]"
        : data.executionState === "skipped"
          ? "border-amber-300/50 bg-amber-950/15 opacity-70"
          : data.executionState === "error"
            ? "border-rose-300/75 bg-rose-950/25 shadow-[0_0_0_1px_rgba(253,164,175,0.35),0_0_34px_rgba(244,63,94,0.24)]"
            : "";

  return (
    <div
      className={[
        "relative flex h-[74px] w-[142px] flex-col rounded-[8px] border bg-[#242426] px-3 py-2 text-center",
        "backdrop-blur-sm transition-transform duration-200",
        data.executionState === "running" ? "scale-[1.03] animate-pulse" : "",
        selected && !data.executionState ? accent.glow : "shadow-[0_14px_40px_rgba(0,0,0,0.22)]",
        accent.ring,
        executionClass,
      ].join(" ")}
    >
      {data.kind !== "trigger" ? (
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-0 !bg-white/55" />
      ) : null}

      <div className="flex items-center justify-center">
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/10 bg-[#141417]",
            accent.text,
          ].join(" ")}
        >
          <NodeHeroIcon data={data} />
        </div>
      </div>

      <div className="mt-2">
        <div className="truncate text-[12px] font-semibold leading-4 text-white">{data.title}</div>
      </div>

      {data.kind === "condition" ? (
        <>
          <Handle
            type="source"
            id="true"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !border-0 !bg-white/55"
            style={{ top: 28 }}
          />
          <Handle
            type="source"
            id="false"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !border-0 !bg-white/55"
            style={{ top: 48 }}
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-0 !bg-white/55" />
      )}
    </div>
  );
}

const nodeTypes = { workflowNode: WorkflowNodeCard };

type WorkflowEdgeData = {
  onDelete?: () => void;
};

type WorkflowEdgeProps = EdgeProps<Edge<WorkflowEdgeData, "workflowEdge">>;

function WorkflowEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, selected, data }: WorkflowEdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {selected ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute z-50 flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/40 bg-white text-rose-600 shadow-[0_10px_24px_rgba(244,63,94,0.22)] transition hover:bg-rose-50 hover:text-rose-700"
            onClick={(event) => {
              event.stopPropagation();
              data?.onDelete?.();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "auto",
            }}
            aria-label="Xóa line connect"
            title="Xóa line connect"
          >
            <XMarkIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes = { workflowEdge: WorkflowEdge };

function cloneTemplateNodes() {
  return structuredClone(WORKFLOW_TEMPLATE.nodes);
}

function snapshotToInventory(snapshot: TelegramWorkflowSnapshot | null): WorkspaceRecord["inventory"] | null {
  if (!snapshot) {
    return null;
  }

  return {
    groups: snapshot.groups.map((group) => ({
      chatId: group.chatId,
      chatTitle: group.chatTitle,
      chatType: group.chatType,
    })),
    topics: snapshot.topics.map((topic) => ({
      chatId: topic.chatId,
      threadId: topic.threadId,
      chatTitle: topic.chatTitle,
      topicName: topic.topicName,
    })),
    updatedAt: `snapshot-${snapshot.meta.updateCount}-${snapshot.meta.topicCount}-${snapshot.groups.length}-${snapshot.topics.length}`,
  };
}

function toCanvasPosition(position: [number, number]) {
  return {
    x: Math.round((position[0] + 3824) * 0.72 + 84),
    y: Math.round((position[1] + 2064) * 0.72 + 78),
  };
}

function fromCanvasPosition(position: { x: number; y: number }): [number, number] {
  return [Math.round((position.x - 84) / 0.72 - 3824), Math.round((position.y - 78) / 0.72 - 2064)];
}

function createNodes(configs: N8nNodeConfig[]): WorkflowNode[] {
  return configs.map((config) => ({
    id: config.id,
    type: "workflowNode",
    position: toCanvasPosition(config.position),
    data: {
      title: getNodeLabel(config),
      subtitle: config.subtitle,
      sourceName: config.name,
      detail: config.detail,
      kind: config.kind,
      accent: config.accent,
    },
  }));
}

function createEdges(configs: N8nNodeConfig[]): Edge[] {
  const nameToNodeId = new Map(configs.map((node) => [node.name, node.id]));
  const nodeKindByName = new Map(configs.map((node) => [node.name, node.kind]));
  const edgeStyle = {
    animated: false,
    type: "smoothstep",
    style: { stroke: "rgba(184, 193, 212, 0.42)", strokeWidth: 1.35 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184, 193, 212, 0.48)" },
  } satisfies Partial<Edge>;

  return Object.entries(WORKFLOW_TEMPLATE.connections).flatMap(([sourceName, outputs]) => {
    const sourceId = nameToNodeId.get(sourceName);
    if (!sourceId) return [];

    return outputs.main.flatMap((connections, outputIndex) =>
      connections.flatMap((connection, connectionIndex) => {
        const targetId = nameToNodeId.get(connection.node);
        if (!targetId) return [];

        return {
          id: `${sourceId}-${outputIndex}-${connectionIndex}-${targetId}`,
          source: sourceId,
          target: targetId,
          sourceHandle:
            nodeKindByName.get(sourceName) === "condition" ? (outputIndex === 0 ? "true" : "false") : undefined,
          ...edgeStyle,
        };
      }),
    );
  });
}

function mergeEdgesWithTemplate(existingEdges: Edge[], configs: N8nNodeConfig[]) {
  const templateEdges = createEdges(configs);
  const existingKeys = new Set(
    existingEdges.map((edge) => `${edge.source}:${edge.target}:${edge.sourceHandle ?? ""}:${edge.targetHandle ?? ""}`),
  );

  const merged = [...existingEdges];
  for (const edge of templateEdges) {
    const key = `${edge.source}:${edge.target}:${edge.sourceHandle ?? ""}:${edge.targetHandle ?? ""}`;
    if (!existingKeys.has(key)) {
      merged.push(edge);
    }
  }

  return merged;
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "0";
}

function topicKey(topic: Pick<AllowedTopicSelection, "chatId" | "threadId">) {
  return `${topic.chatId}:${topic.threadId ?? "all"}`;
}

function normalizeAllowedTopic(value: unknown): AllowedTopicSelection | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<AllowedTopicSelection>;
  const chatId = Number(item.chatId);
  const threadId = item.threadId === null || item.threadId === undefined ? null : Number(item.threadId);

  if (!Number.isFinite(chatId) || (threadId !== null && !Number.isFinite(threadId))) {
    return null;
  }

  return {
    chatId,
    threadId,
    chatTitle: String(item.chatTitle || `Chat ${chatId}`),
    topicName: String(item.topicName || (threadId === null ? "All topics" : `Topic #${threadId}`)),
  };
}

function getAllowedTopics(parameters: JsonRecord | undefined): AllowedTopicSelection[] {
  const raw = parameters?.allowedTopics;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(normalizeAllowedTopic).filter((item): item is AllowedTopicSelection => Boolean(item));
}

function getAllowedTopicsFromConfigs(configs: N8nNodeConfig[]) {
  const node = configs.find((config) => config.name === "Allowed Group Topic");
  return getAllowedTopics(node?.parameters);
}

function getAvailableTopics(snapshot: TelegramWorkflowSnapshot | null): AllowedTopicSelection[] {
  if (!snapshot) {
    return [];
  }

  const topics = snapshot.topics.map((topic) => ({
    chatId: topic.chatId,
    threadId: topic.threadId,
    chatTitle: topic.chatTitle,
    topicName: topic.topicName,
  }));

  const topicKeys = new Set(topics.map(topicKey));
  const groupOnly = snapshot.groups
    .filter((group) => !topics.some((topic) => topic.chatId === group.chatId))
    .map((group) => ({
      chatId: group.chatId,
      threadId: null,
      chatTitle: group.chatTitle,
      topicName: "All messages",
    }))
    .filter((topic) => {
      const key = topicKey(topic);
      if (topicKeys.has(key)) return false;
      topicKeys.add(key);
      return true;
    });

  return [...topics, ...groupOnly];
}

function getAvailableTopicsFromInventory(inventory: RuntimeStatus["inventory"] | undefined): AllowedTopicSelection[] {
  if (!inventory) {
    return [];
  }

  const topics = inventory.topics.map((topic) => ({
    chatId: topic.chatId,
    threadId: topic.threadId,
    chatTitle: topic.chatTitle,
    topicName: topic.topicName,
  }));

  const topicKeys = new Set(topics.map(topicKey));
  const groupOnly = inventory.groups
    .filter((group) => !topics.some((topic) => topic.chatId === group.chatId))
    .map((group) => ({
      chatId: group.chatId,
      threadId: null,
      chatTitle: group.chatTitle,
      topicName: "All messages",
    }))
    .filter((topic) => {
      const key = topicKey(topic);
      if (topicKeys.has(key)) return false;
      topicKeys.add(key);
      return true;
    });

  return [...topics, ...groupOnly];
}

type TopicPickerGroup = {
  chatId: number;
  chatTitle: string;
  group: AllowedTopicSelection;
  topics: AllowedTopicSelection[];
};

function buildTopicPickerGroups(topics: AllowedTopicSelection[]) {
  const groups = new Map<number, TopicPickerGroup>();

  for (const topic of topics) {
    const existing = groups.get(topic.chatId);
    if (existing) {
      if (topic.threadId === null) {
        existing.group = topic;
      } else {
        existing.topics.push(topic);
      }
      continue;
    }

    groups.set(topic.chatId, {
      chatId: topic.chatId,
      chatTitle: topic.chatTitle,
      group: {
        chatId: topic.chatId,
        threadId: null,
        chatTitle: topic.chatTitle,
        topicName: "All messages",
      },
      topics: topic.threadId === null ? [] : [topic],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      topics: group.topics.sort((first, second) => first.topicName.localeCompare(second.topicName)),
    }))
    .sort((first, second) => first.chatTitle.localeCompare(second.chatTitle));
}

function normalizeTopicSelection(value: unknown): AllowedTopicSelection | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<AllowedTopicSelection>;
  const chatId = Number(item.chatId);
  const threadId = item.threadId === null || item.threadId === undefined ? null : Number(item.threadId);

  if (!Number.isFinite(chatId) || (threadId !== null && !Number.isFinite(threadId))) {
    return null;
  }

  return {
    chatId,
    threadId,
    chatTitle: String(item.chatTitle || `Chat ${chatId}`),
    topicName: String(item.topicName || (threadId === null ? "All messages" : `Topic #${threadId}`)),
  };
}

function getTargetRoutingMode(parameters: JsonRecord | undefined): TargetRoutingMode {
  return parameters?.targetMode === "previous" ? "previous" : "fixed";
}

function getConfiguredTopicSelection(parameters: JsonRecord | undefined) {
  return getTargetRoutingMode(parameters) === "previous" ? null : getTopicSelection(parameters);
}

function getTopicSelection(parameters: JsonRecord | undefined) {
  const direct = normalizeTopicSelection(parameters?.target);
  if (direct) {
    return direct;
  }

  const destinationChatId = parameters?.destinationChatId;
  const parsedChatId = typeof destinationChatId === "number" || typeof destinationChatId === "string" ? Number(destinationChatId) : Number.NaN;
  if (!Number.isFinite(parsedChatId)) {
    const rawChatId = parameters?.chatId;
    if (typeof rawChatId === "string" || typeof rawChatId === "number") {
      let cleanChatId = String(rawChatId).trim();
      if (cleanChatId.startsWith("=")) {
        cleanChatId = cleanChatId.substring(1).trim();
      }
      const numChatId = Number(cleanChatId);
      if (Number.isFinite(numChatId)) {
        const additionalFields = parameters?.additionalFields as Record<string, unknown> | undefined;
        const rawThreadId = additionalFields?.message_thread_id ?? parameters?.message_thread_id;
        const threadId = rawThreadId === null || rawThreadId === undefined
          ? null
          : Number(String(rawThreadId).replace(/^=/, ""));
        return {
          chatId: numChatId,
          threadId: Number.isFinite(threadId) ? threadId : null,
          chatTitle: `Chat ${numChatId}`,
          topicName: threadId === null ? "All messages" : `Topic #${threadId}`,
        };
      }
    }
    return null;
  }

  const destinationThreadId = parameters?.destinationThreadId;
  const parsedThreadId =
    destinationThreadId === null || destinationThreadId === undefined
      ? null
      : typeof destinationThreadId === "number" || typeof destinationThreadId === "string"
        ? Number(destinationThreadId)
        : Number.NaN;

  if (parsedThreadId !== null && !Number.isFinite(parsedThreadId)) {
    return null;
  }

  return {
    chatId: parsedChatId,
    threadId: parsedThreadId,
    chatTitle: typeof parameters?.destinationChatTitle === "string" && parameters.destinationChatTitle.trim()
      ? parameters.destinationChatTitle.trim()
      : `Chat ${parsedChatId}`,
    topicName:
      typeof parameters?.destinationTopicName === "string" && parameters.destinationTopicName.trim()
        ? parameters.destinationTopicName.trim()
        : parsedThreadId === null
          ? "All messages"
          : `Topic #${parsedThreadId}`,
  };
}

function getTargetFromConfig(configs: N8nNodeConfig[], nodeName: string) {
  const node = configs.find((config) => config.name === nodeName);
  if (!node) return undefined;
  const target = getConfiguredTopicSelection(node.parameters);
  if (!target || !target.chatId) return undefined;
  return target;
}

function getTargetFromConfigPrefix(configs: N8nNodeConfig[], prefix: string) {
  const node = configs.find((config) => config.name.startsWith(prefix));
  if (!node) return undefined;
  const target = getConfiguredTopicSelection(node.parameters);
  if (!target || !target.chatId) return undefined;
  return target;
}

function isForwardOrRejectNode(nodeName: string) {
  return nodeName.startsWith("Forward Tin nhắn") ||
         nodeName.startsWith("Chuyển tiếp") ||
         nodeName.startsWith("Từ chối tin nhắn") ||
         nodeName.startsWith("Có vật tư") ||
         nodeName.startsWith("Không có vật tư");
}

function isSupplierConfirmationNode(nodeName: string) {
  return nodeName.startsWith("Xác nhận nhà cung ứng");
}

function isInspectionMaterialNode(nodeName: string) {
  return nodeName.startsWith("Nghiệm thu vật tư");
}

function isTargetConfigurableNode(nodeName: string) {
  return isForwardOrRejectNode(nodeName) ||
         nodeName.startsWith("Gửi tin nhắn xác nhận") ||
         isSupplierConfirmationNode(nodeName) ||
         isInspectionMaterialNode(nodeName);
}

function formatTopicSelectionLabel(target: AllowedTopicSelection | null) {
  if (!target) {
    return "Chưa chọn";
  }

  return target.threadId === null ? target.chatTitle : `${target.chatTitle} / Topic #${target.threadId}`;
}

function formatMappingKeywords(keywords: unknown) {
  const value = typeof keywords === "string" ? keywords.trim() : "";
  if (!value) {
    return "Chưa có từ khóa";
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
}

function getMappingRowKey(row: any, index: number) {
  return row?.id ?? index;
}

function formatTopicDisplayName(_topicName: string, threadId: number | null) {
  if (threadId === null) {
    return "All messages";
  }
  return `Topic #${threadId}`;
}

function mergeWorkflowSnapshots(
  previous: TelegramWorkflowSnapshot | null,
  next: TelegramWorkflowSnapshot,
): TelegramWorkflowSnapshot {
  if (!previous) {
    return next;
  }

  const groups = new Map<number, TelegramWorkflowSnapshot["groups"][number]>();
  for (const group of previous.groups) groups.set(group.chatId, group);
  for (const group of next.groups) groups.set(group.chatId, group);

  const topics = new Map<string, TelegramWorkflowSnapshot["topics"][number]>();
  for (const topic of previous.topics) topics.set(`${topic.chatId}:${topic.threadId}`, topic);
  for (const topic of next.topics) {
    const key = `${topic.chatId}:${topic.threadId}`;
    const existing = topics.get(key);
    if (!existing) {
      topics.set(key, topic);
      continue;
    }

    topics.set(key, {
      ...existing,
      ...topic,
      chatTitle: topic.chatTitle || existing.chatTitle,
      topicName:
        !isPlaceholderTopicName(topic.topicName, topic.threadId)
          ? topic.topicName
          : !isPlaceholderTopicName(existing.topicName, existing.threadId)
            ? existing.topicName
            : topic.topicName.trim() || existing.topicName,
    });
  }

  const updates = new Map<number, TelegramWorkflowSnapshot["updates"][number]>();
  for (const update of previous.updates) updates.set(update.updateId, update);
  for (const update of next.updates) updates.set(update.updateId, update);

  const mergedUpdates = Array.from(updates.values())
    .sort((first, second) => {
      const firstTime = first.date ? new Date(first.date).getTime() : 0;
      const secondTime = second.date ? new Date(second.date).getTime() : 0;
      return secondTime - firstTime || second.updateId - first.updateId;
    })
    .slice(0, 250);

  const mergedGroups = Array.from(groups.values());
  const mergedTopics = Array.from(topics.values());

  return {
    ...next,
    updates: mergedUpdates,
    groups: mergedGroups,
    topics: mergedTopics,
    warnings: Array.from(new Set([...next.warnings, ...previous.warnings])).slice(0, 6),
    meta: {
      ...next.meta,
      updateCount: mergedUpdates.length,
      uniqueChatCount: mergedGroups.length,
      topicCount: mergedTopics.length,
    },
  };
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getParameterSubtitle(parameters: JsonRecord, fallback: string) {
  const operation = typeof parameters.operation === "string" ? parameters.operation : "";
  const resource = typeof parameters.resource === "string" ? parameters.resource : "";
  const replyMarkup = typeof parameters.replyMarkup === "string" ? parameters.replyMarkup : "";

  if (operation) return operation;
  if (resource && replyMarkup) return `${resource} + ${replyMarkup}`;
  if (resource) return `resource: ${resource}`;
  if (replyMarkup) return replyMarkup;
  return fallback;
}

function normalizeSubtitle(snapshot: TelegramWorkflowSnapshot | null, config: N8nNodeConfig) {
  if (config.name === "Allowed Group Topic") {
    return `${formatNumber(getAllowedTopics(config.parameters).length)} selected`;
  }

  if (config.name.startsWith("Chuyển tiếp Vật tư")) {
    const mappings = (config.parameters.mappings as any[]) || [];
    return `${formatNumber(mappings.length)} mapping`;
  }

  if (isForwardOrRejectNode(config.name) || config.name.startsWith("Gửi tin nhắn xác nhận") || isSupplierConfirmationNode(config.name) || isInspectionMaterialNode(config.name)) {
    const targetMode = getTargetRoutingMode(config.parameters);
    if (targetMode === "previous") {
      return "Đích trước đó";
    }
    const target = getTopicSelection(config.parameters);
    return target ? formatTopicSelectionLabel(target) : "select target";
  }

  if (isMessageTemplateNode(config.name)) {
    return "Mẫu tin nhắn";
  }

  if (!snapshot) {
    return getParameterSubtitle(config.parameters, config.subtitle);
  }

  switch (config.name) {
    case "Telegram Trigger":
      return snapshot.webhook.url ? "Webhook on" : "getUpdates";
    case "Has Callback":
      return `${formatNumber(snapshot.topics.length)} topics`;
    case "Lấy tin nhắn - 1":
    case "Lấy tin nhắn - 2":
      return `${formatNumber(snapshot.meta.updateCount)} updates`;
    case "Callback Answer":
      return snapshot.webhook.pending_update_count > 0 ? "pending replies" : "answerCallbackQuery";
    case "Quyết định phê duyệt":
      return snapshot.warnings.length > 0 ? "pending review" : "if approved";
    case "Đồng ý phê duyệt":
      return "ẩn nút";
    case "Từ chối phê duyệt":
      return "ẩn nút";
    case "Forward Tin nhắn":
      return `${formatNumber(snapshot.groups.length)} chats`;
    case "Từ chối tin nhắn":
      return `pending ${formatNumber(snapshot.webhook.pending_update_count)}`;
    case "Gửi tin nhắn xác nhận":
      return `${formatNumber(snapshot.topics.length)} topics`;
    case "Xác nhận nhà cung ứng":
      return `${formatNumber(snapshot.topics.length)} topics`;
    case "Nghiệm thu vật tư":
      return `${formatNumber(snapshot.topics.length)} topics`;
    default:
      return getParameterSubtitle(config.parameters, config.subtitle);
  }
}

function isPlaceholderTopicName(topicName: string, threadId: number) {
  const trimmed = topicName.trim();
  return trimmed === "" || trimmed === `Topic ${threadId}` || trimmed === `Topic #${threadId}`;
}

function createDroppedNodeConfig(templateId: string, index: number): N8nNodeConfig | null {
  const template = NODE_PALETTE.find((item) => item.id === templateId);
  if (!template) return null;

  const id = `local-${template.id}-${Date.now()}-${index}`;
  return {
    id,
    name: `${template.label} ${index}`,
    displayName: "",
    n8nType: template.n8nType,
    typeVersion: template.typeVersion,
    position: [0, 0],
    kind: template.kind,
    accent: template.accent,
    subtitle: template.subtitle,
    detail: template.detail,
    parameters: structuredClone(template.parameters),
    credentials:
      template.n8nType.includes("telegram")
        ? {
            telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
          }
        : undefined,
  };
}

export default function TelegramFlowWorkbench() {
  const [token, setToken] = useState("");
  const [deepScan, setDeepScan] = useState(true);
  const [autoPoll, setAutoPoll] = useState(true);
  const [workflowActive, setWorkflowActive] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [probeBusy, setProbeBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [avatarSyncBusy, setAvatarSyncBusy] = useState(false);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const [refreshConfirmDraft, setRefreshConfirmDraft] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<TelegramWorkflowSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>({ kind: "idle", text: "Ready" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configPanelTab, setConfigPanelTab] = useState<ConfigPanelTab>("target");
  const [configPanelExpanded, setConfigPanelExpanded] = useState(false);
  const [isRenamingNode, setIsRenamingNode] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [selectedMappingRowId, setSelectedMappingRowId] = useState<string | number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [nodeConfigs, setNodeConfigs] = useState<N8nNodeConfig[]>(cloneTemplateNodes);
  const [, setParameterDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(WORKFLOW_TEMPLATE.nodes.map((node) => [node.id, stringifyJson(node.parameters)])),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>("9bfb1a1e-2ae7-41f8-aa01-c8bb9a90a1de");
  const [nodes, setNodes] = useNodesState<WorkflowNode>(createNodes(WORKFLOW_TEMPLATE.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(createEdges(WORKFLOW_TEMPLATE.nodes));
  const [toast, setToast] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<WorkflowNode, Edge> | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const ensureBuiltinNodes = useCallback((configs: N8nNodeConfig[]): N8nNodeConfig[] => {
    const nextConfigs = [...configs];
    const builtins = [
      {
        name: "Xác nhận nhà cung ứng",
        templateId: "supplier-confirmation",
        id: "supplier-confirmation-node",
        position: [-2504, -1408] as [number, number],
        webhookId: "supplier-confirmation-webhook",
      },
      {
        name: "Nghiệm thu vật tư",
        templateId: "inspection-material",
        id: "inspection-material-node",
        position: [-2260, -1264] as [number, number],
        webhookId: "inspection-material-webhook",
      },
    ];

    for (const builtin of builtins) {
      if (nextConfigs.some((config) => config.name === builtin.name)) {
        continue;
      }

      const template = NODE_PALETTE.find((item) => item.id === builtin.templateId);
      if (!template) {
        continue;
      }

      nextConfigs.push({
        id: builtin.id,
        name: template.label,
        n8nType: template.n8nType,
        typeVersion: template.typeVersion,
        position: builtin.position,
        kind: template.kind,
        accent: template.accent,
        subtitle: template.subtitle,
        detail: template.detail,
        parameters: structuredClone(template.parameters),
        credentials: {
          telegramApi: { id: "YMPFyCqpGYxi4sgz", name: "Telegram account" },
        },
        webhookId: builtin.webhookId,
      });
    }

    return nextConfigs;
  }, []);

  const inFlightRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const snapshotRef = useRef<TelegramWorkflowSnapshot | null>(null);
  const workspaceSaveTimerRef = useRef<number | null>(null);
  const workspaceSignatureRef = useRef<string>("");

  const selectedConfig = useMemo(
    () => nodeConfigs.find((node) => node.id === selectedNodeId) ?? nodeConfigs[0],
    [nodeConfigs, selectedNodeId],
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    [nodes, selectedNodeId],
  );
  const nodeNameById = useMemo(() => new Map(nodeConfigs.map((node) => [node.id, getNodeLabel(node)])), [nodeConfigs]);
  const selectedAllowedTopics = useMemo(
    () => (selectedConfig?.name === "Allowed Group Topic" ? getAllowedTopics(selectedConfig.parameters) : []),
    [selectedConfig],
  );
  useEffect(() => {
    setIsRenamingNode(false);
    setRenameDraft(selectedConfig ? getNodeLabel(selectedConfig) : "");
  }, [selectedConfig?.id]);

  useEffect(() => {
    setSelectedMappingRowId(null);
  }, [selectedConfig?.id]);

  const configPanelTabs = useMemo(() => getConfigPanelTabs(selectedConfig), [selectedConfig]);
  const activeConfigPanelTab =
    configPanelTabs.find((tab) => tab.id === configPanelTab)?.id ?? configPanelTabs[0]?.id ?? "target";
  const hasConfigTabs = configPanelTabs.length > 1;
  const primaryConfigTab = configPanelTabs[0]?.id ?? "target";
  const configPanelWrapperClass = configPanelExpanded
    ? "fixed inset-4 z-40"
    : "pointer-events-none absolute right-6 bottom-6 z-20 w-[430px] max-w-[calc(100vw-3rem)]";
  const configPanelCardClass = configPanelExpanded
    ? "pointer-events-auto flex h-full w-full flex-col rounded-[12px] border border-white/10 bg-[#151516]/96 p-4 shadow-[0_28px_90px_rgba(0,0,0,0.52)] backdrop-blur-xl"
    : "pointer-events-auto flex max-h-[calc(100vh-6rem)] w-full flex-col rounded-[8px] border border-white/10 bg-[#151516]/94 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl";

  function renderConfigPanelContent(tab: ConfigPanelTab) {
    if (!selectedConfig) {
      return null;
    }

    if (selectedConfig.name === "Allowed Group Topic") {
      return tab === "target" ? (
        <AllowedTopicPicker
          topics={availableTopics}
          selectedTopics={selectedAllowedTopics}
          selectedCount={selectedAllowedTopics.length}
          hasSnapshot={Boolean(snapshot)}
          avatarRefreshKey={avatarRefreshKey}
          onChange={setAllowedTopicsForSelectedNode}
          onSelectAll={() => setAllowedTopicsForSelectedNode(availableTopics)}
          onClear={() => setAllowedTopicsForSelectedNode([])}
        />
      ) : (
        <div className="rounded-[8px] border border-white/10 bg-white/5 p-3 text-[12px] leading-5 text-white/72">
          Không có cấu hình riêng cho tab này.
        </div>
      );
    }

    if (selectedConfig.name.startsWith("Chuyển tiếp Vật tư")) {
      return tab === "mappings" ? (
        (() => {
          const mappings = ((selectedConfig.parameters.mappings as any[]) || []).filter(Boolean);
          const configuredCount = mappings.filter((row) => Boolean(row.target?.chatId)).length;
          const selectedRow =
            mappings.find((row, idx) => getMappingRowKey(row, idx) === selectedMappingRowId) ??
            mappings[0] ??
            null;
          const selectedRowIndex = selectedRow ? mappings.indexOf(selectedRow) : -1;
          const selectedRowKey = selectedRow ? getMappingRowKey(selectedRow, selectedRowIndex >= 0 ? selectedRowIndex : 0) : null;
          const selectedKeywords = selectedRow ? String(selectedRow.keywords || "") : "";
          const selectedTarget = selectedRow ? (selectedRow.target || null) : null;

          return (
            <div className="space-y-3">
              <div className="rounded-[8px] border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Mapping tin nhắn và nhà cung cấp</div>
                    <div className="mt-1 text-[12px] text-white/70">
                      {formatNumber(mappings.length)} mapping, {formatNumber(configuredCount)} đã gán nhà cung cấp.
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-white/35">
                      Chọn một dòng bên dưới để sửa từ khóa và đích tương ứng.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMappingRow}
                    className="inline-flex h-9 items-center rounded-[6px] border border-sky-400/20 bg-sky-400/10 px-3 text-[11px] font-medium text-sky-300 transition hover:bg-sky-400/20"
                  >
                    + Thêm mapping
                  </button>
                </div>
              </div>

              {mappings.length === 0 ? (
                <div className="rounded-[8px] border border-dashed border-white/10 bg-white/5 px-4 py-5 text-center">
                  <div className="text-[12px] font-medium text-white/72">Chưa có mapping nào</div>
                  <div className="mt-1 text-[11px] leading-5 text-white/35">
                    Tạo mapping đầu tiên để ghép tin nhắn với nhà cung cấp tương ứng.
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMappingRow}
                    className="mt-3 inline-flex h-9 items-center rounded-[6px] border border-white/10 bg-white/5 px-3 text-[11px] font-medium text-white/75 transition hover:bg-white/10"
                  >
                    Tạo mapping đầu tiên
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {mappings.map((row, idx) => {
                      const rowKey = getMappingRowKey(row, idx);
                      const isSelected = rowKey === selectedRowKey;
                      const keywords = formatMappingKeywords(row.keywords);
                      const target = row.target || null;
                      const targetLabel = formatTopicSelectionLabel(target);
                      const isConfigured = Boolean(target?.chatId);

                      return (
                        <div
                          key={rowKey}
                          onClick={() => setSelectedMappingRowId(rowKey)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedMappingRowId(rowKey);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={[
                            "w-full cursor-pointer rounded-[8px] border px-3 py-3 text-left transition",
                            isSelected ? "border-sky-400/25 bg-sky-400/8" : "border-white/10 bg-[#101113] hover:bg-white/5",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-white/72">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-[12px] font-medium text-white">
                                  {keywords === "Chưa có từ khóa" ? "Chưa đặt từ khóa" : keywords}
                                </span>
                                <span
                                  className={[
                                    "shrink-0 rounded-[999px] border px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-wide",
                                    isConfigured
                                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                                      : "border-amber-400/20 bg-amber-400/10 text-amber-200",
                                  ].join(" ")}
                                >
                                  {isConfigured ? "Gán" : "Trống"}
                                </span>
                              </div>
                              <div className="mt-1 text-[11px] leading-5 text-white/42">
                                <span className="text-white/55">Nhà cung cấp:</span> <span className="text-white/75">{targetLabel}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDuplicateMappingRow(rowKey);
                                  }}
                                  className="rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-white/70 transition hover:bg-white/10"
                                  title="Nhân bản mapping"
                                >
                                  Clone
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveMappingRow(rowKey);
                                  }}
                                  className="rounded-[6px] border border-white/10 bg-white/5 p-2 text-white/35 transition hover:bg-rose-400/10 hover:text-rose-300"
                                  title="Xóa mapping"
                                >
                                  <XMarkIcon aria-hidden="true" className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden overflow-hidden rounded-[8px] border border-white/10 bg-[#101113] lg:block">
                    <div className="grid grid-cols-[44px_1.2fr_1fr_124px] items-center gap-3 border-b border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/35">
                      <span>#</span>
                      <span>Từ khóa tin nhắn</span>
                      <span>Nhà cung cấp</span>
                      <span className="text-right">Thao tác</span>
                    </div>

                    <div className="divide-y divide-white/10">
                      {mappings.map((row, idx) => {
                        const rowKey = getMappingRowKey(row, idx);
                        const isSelected = rowKey === selectedRowKey;
                        const keywords = formatMappingKeywords(row.keywords);
                        const target = row.target || null;
                        const targetLabel = formatTopicSelectionLabel(target);
                        const isConfigured = Boolean(target?.chatId);

                        return (
                          <div
                            key={rowKey}
                            onClick={() => setSelectedMappingRowId(rowKey)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedMappingRowId(rowKey);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                            className={[
                              "grid w-full cursor-pointer grid-cols-[44px_1.2fr_1fr_124px] items-center gap-3 px-3 py-3 text-left transition",
                              isSelected ? "bg-sky-400/8" : "hover:bg-white/5",
                            ].join(" ")}
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-white/72">
                              {idx + 1}
                            </span>
                            <span className="min-w-0 truncate text-[12px] text-white/80">
                              {keywords === "Chưa có từ khóa" ? "Chưa đặt từ khóa" : keywords}
                            </span>
                            <span className="min-w-0 truncate text-[12px] text-white/70">{targetLabel}</span>
                            <span className="flex items-center justify-end gap-2">
                              <span
                                className={[
                                  "rounded-[999px] border px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-wide",
                                  isConfigured
                                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                                    : "border-amber-400/20 bg-amber-400/10 text-amber-200",
                                ].join(" ")}
                              >
                                {isConfigured ? "Gán" : "Trống"}
                              </span>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDuplicateMappingRow(rowKey);
                                }}
                                className="rounded-[6px] border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-white/70 transition hover:bg-white/10"
                                title="Nhân bản mapping"
                              >
                                Clone
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemoveMappingRow(rowKey);
                                }}
                                className="rounded-[6px] border border-white/10 bg-white/5 p-2 text-white/35 transition hover:bg-rose-400/10 hover:text-rose-300"
                                title="Xóa mapping"
                              >
                                <XMarkIcon aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {selectedRow ? (
                    <div className="space-y-3 rounded-[8px] border border-white/10 bg-white/5 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Đang sửa mapping</div>
                          <div className="mt-1 text-[12px] text-white/70">
                            Mapping #{selectedRowIndex + 1} - {selectedKeywords.trim() || "chưa có từ khóa"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUpdateRowTarget(selectedRowKey ?? 0, null)}
                          className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-2.5 text-[11px] text-white/70 transition hover:bg-white/10"
                        >
                          Xóa nhà cung cấp
                        </button>
                      </div>

                      <div className={["grid gap-3 grid-cols-1", configPanelExpanded ? "xl:grid-cols-[1fr_1fr]" : ""].join(" ")}>
                        <div className="rounded-[8px] border border-white/10 bg-[#0d1118] p-3">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Từ khóa tin nhắn</div>
                          <div className="mt-1 text-[11px] leading-5 text-white/42">
                            Nhập từ khóa để nhận diện tin nhắn. Ngăn cách nhiều từ bằng dấu phẩy.
                          </div>
                          <input
                            type="text"
                            value={selectedKeywords}
                            onChange={(e) => handleUpdateRowKeywords(selectedRowKey ?? 0, e.target.value)}
                            placeholder="cát, đá, gạch"
                            className="mt-3 h-10 w-full rounded-[6px] border border-white/10 bg-[#101113] px-3 text-[12px] text-white outline-none placeholder:text-white/28 focus:border-sky-400/40"
                          />
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {selectedKeywords
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean)
                              .slice(0, 6)
                              .map((item) => (
                                <span
                                  key={item}
                                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70"
                                >
                                  {item}
                                </span>
                              ))}
                          </div>
                        </div>

                        <div className="rounded-[8px] border border-white/10 bg-[#0d1118] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Nhà cung cấp tương ứng</div>
                              <div className="mt-1 text-[11px] leading-5 text-white/42">
                                Chọn group chat hoặc topic đích để map với tin nhắn này.
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleUpdateRowTarget(selectedRowKey ?? 0, null)}
                              className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-2.5 text-[11px] text-white/70 transition hover:bg-white/10"
                            >
                              Bỏ chọn
                            </button>
                          </div>

                          <div className="mt-3">
                            <TopicTargetPicker
                              topics={availableTopics}
                              value={selectedTarget}
                              mode="fixed"
                              hasSnapshot={Boolean(snapshot)}
                              avatarRefreshKey={avatarRefreshKey}
                              onChange={(topic) => handleUpdateRowTarget(selectedRowKey ?? 0, topic)}
                              onClear={() => handleUpdateRowTarget(selectedRowKey ?? 0, null)}
                              onModeChange={() => undefined}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })()
      ) : (
        <div className="rounded-[8px] border border-white/10 bg-white/5 p-3 text-[12px] leading-5 text-white/72">
          Không có cấu hình riêng cho tab này.
        </div>
      );
    }

    if (tab === "target") {
      if (!isTargetConfigurableNode(selectedConfig.name)) {
        return (
          <div className="rounded-[8px] border border-white/10 bg-white/5 p-3 text-[12px] leading-5 text-white/72">
            Không có cấu hình riêng cho tab này.
          </div>
        );
      }

      return (
        <TopicTargetPicker
          topics={availableTopics}
          value={getTopicSelection(selectedConfig.parameters)}
          mode={getTargetRoutingMode(selectedConfig.parameters)}
          hasSnapshot={Boolean(snapshot)}
          avatarRefreshKey={avatarRefreshKey}
          onChange={setTargetForSelectedNode}
          onClear={() => setTargetForSelectedNode(null)}
          onModeChange={setTargetModeForSelectedNode}
        />
      );
    }

    if (tab === "template") {
      if (!isSafeMessageTemplateEditableNode(selectedConfig.name)) {
        return (
          <div className="rounded-[8px] border border-white/10 bg-white/5 p-3 text-[12px] leading-5 text-white/72">
            Không có cấu hình riêng cho tab này.
          </div>
        );
      }

      return (
        <SafeMessageTemplateEditor
          nodeName={selectedConfig.name}
          value={getMessageTemplateValue(selectedConfig)}
          onChange={(template) => setMessageTemplateForSelectedNode(template)}
        />
      );
    }

    return (
      <div className="rounded-[8px] border border-white/10 bg-white/5 p-3 text-[12px] leading-5 text-white/72">
        Không có cấu hình riêng cho node này.
      </div>
    );
  }

  const availableTopics = useMemo(() => {
    const available = [...getAvailableTopicsFromInventory(runtimeStatus?.inventory), ...getAvailableTopics(snapshot)];
    const seen = new Set<string>();

    return available.filter((topic) => {
      const key = topicKey(topic);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [runtimeStatus?.inventory, snapshot]);
  const visibleExecution = runtimeStatus?.currentExecution ?? runtimeStatus?.lastExecution ?? null;
  const executionVisuals = useMemo(() => {
    const nameToConfig = new Map(nodeConfigs.map((config) => [config.name, config]));
    const statusByNodeId = new Map<string, ExecutionState>();
    const noteByNodeId = new Map<string, string>();
    const edgeKeys = new Set<string>();

    if (!visibleExecution) {
      return { statusByNodeId, noteByNodeId, edgeKeys };
    }

    const pathNodeIds: string[] = [];
    for (const step of visibleExecution.steps) {
      const config = nameToConfig.get(step.nodeName);
      if (!config) continue;

      const status = visibleExecution.activeNodeName === step.nodeName ? "running" : step.status;
      statusByNodeId.set(config.id, status);
      if (step.note) {
        noteByNodeId.set(config.id, step.note);
      }
      pathNodeIds.push(config.id);
    }

    for (let index = 0; index < pathNodeIds.length - 1; index += 1) {
      edgeKeys.add(`${pathNodeIds[index]}->${pathNodeIds[index + 1]}`);
    }

    return { statusByNodeId, noteByNodeId, edgeKeys };
  }, [nodeConfigs, visibleExecution]);
  const visualNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          executionState: executionVisuals.statusByNodeId.get(node.id),
          executionNote: executionVisuals.noteByNodeId.get(node.id),
        },
      })),
    [executionVisuals, nodes],
  );
  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) {
      return;
    }

    setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  }, [selectedEdgeId, setEdges]);

  const visualEdges = useMemo(
    () =>
      edges.map((edge) => {
        const highlighted = executionVisuals.edgeKeys.has(`${edge.source}->${edge.target}`);
        const selected = edge.id === selectedEdgeId;
        if (!highlighted && !selected) return edge;

        const targetStatus = executionVisuals.statusByNodeId.get(edge.target);
        const stroke = selected
          ? "rgba(125,211,252,0.98)"
          : targetStatus === "error"
            ? "rgba(251,113,133,0.95)"
            : targetStatus === "skipped"
              ? "rgba(251,191,36,0.86)"
              : "rgba(56,189,248,0.98)";

        return {
          ...edge,
          animated: targetStatus !== "skipped",
          type: "workflowEdge",
          data: {
            ...(edge.data ?? {}),
            onDelete: removeSelectedEdge,
          },
          style: { ...edge.style, stroke, strokeWidth: selected ? 3.2 : 2.6 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        };
      }),
    [edges, executionVisuals, removeSelectedEdge, selectedEdgeId],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const workspacePatch = useMemo<WorkspaceRecordPatch>(
    () => ({
      ui: {
        token,
        deepScan,
        autoPoll,
        settingsOpen,
        configOpen,
        configPanelTab,
        configPanelExpanded,
        paletteOpen,
        selectedNodeId,
        selectedEdgeId,
        nodeConfigs,
        edges,
        snapshot,
        runtimeStatus,
      },
      inventory: snapshotToInventory(snapshot) ?? runtimeStatus?.inventory ?? undefined,
    }),
    [
      autoPoll,
      configOpen,
      configPanelExpanded,
      configPanelTab,
      deepScan,
      edges,
      nodeConfigs,
      paletteOpen,
      runtimeStatus,
      selectedEdgeId,
      selectedNodeId,
      settingsOpen,
      snapshot,
      token,
    ],
  );

  const workspaceSignature = useMemo(() => JSON.stringify(workspacePatch), [workspacePatch]);

  const persistWorkspaceState = useCallback(async (patch?: WorkspaceRecordPatch) => {
    const payload = patch ?? workspacePatch;
    try {
      await fetch("/api/workspace-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Best-effort only.
    }
  }, [workspacePatch]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (workspaceSignatureRef.current === "") {
      workspaceSignatureRef.current = workspaceSignature;
      return;
    }

    if (workspaceSignature === workspaceSignatureRef.current) {
      return;
    }

    if (workspaceSaveTimerRef.current) {
      clearTimeout(workspaceSaveTimerRef.current);
    }

    workspaceSaveTimerRef.current = window.setTimeout(() => {
      workspaceSaveTimerRef.current = null;
      workspaceSignatureRef.current = workspaceSignature;
      void persistWorkspaceState();
    }, 450);

    return () => {
      if (workspaceSaveTimerRef.current) {
        clearTimeout(workspaceSaveTimerRef.current);
        workspaceSaveTimerRef.current = null;
      }
    };
  }, [hydrated, persistWorkspaceState, workspaceSignature]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaceState() {
      try {
        const response = await fetch("/api/workspace-state", { cache: "no-store" });
        const payload = (await response.json()) as { ok: boolean; state?: WorkspaceRecord; exists?: boolean; error?: string };

        if (!response.ok || !payload.ok || !payload.state || cancelled) {
          return;
        }

        const state = payload.state;

        setToken(state.ui.token);
        setDeepScan(state.ui.deepScan);
        setAutoPoll(state.ui.autoPoll);
        setSettingsOpen(state.ui.settingsOpen);
        setConfigOpen(state.ui.configOpen);
        setConfigPanelTab((state.ui.configPanelTab as ConfigPanelTab | undefined) ?? getDefaultConfigPanelTab(undefined));
        setConfigPanelExpanded(Boolean(state.ui.configPanelExpanded));
        setPaletteOpen(state.ui.paletteOpen);
        setSelectedNodeId(state.ui.selectedNodeId);
        setSelectedEdgeId(state.ui.selectedEdgeId);
        setSnapshot(state.ui.snapshot);
        snapshotRef.current = state.ui.snapshot;
        setRuntimeStatus((state.ui.runtimeStatus as RuntimeStatus | null) ?? null);
        setWorkflowActive(Boolean((state.ui.runtimeStatus as RuntimeStatus | null)?.active));

        if (payload.exists) {
          const loadedNodeConfigs = ensureBuiltinNodes(state.ui.nodeConfigs as N8nNodeConfig[]);
          setNodeConfigs(loadedNodeConfigs);
          setNodes(createNodes(loadedNodeConfigs));
          setEdges(mergeEdgesWithTemplate(state.ui.edges as Edge[], loadedNodeConfigs));
          setParameterDrafts(
            Object.fromEntries(loadedNodeConfigs.map((node) => [node.id, stringifyJson(node.parameters)])),
          );
        }
      } catch {
        // Use in-memory defaults when workspace storage is unavailable.
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    }

    void loadWorkspaceState();

    return () => {
      cancelled = true;
    };
  }, [ensureBuiltinNodes, setEdges, setNodes]);

  useEffect(() => {
    const tabs = getConfigPanelTabs(selectedConfig);
    if (tabs.length === 0 || tabs.some((tab) => tab.id === configPanelTab)) {
      return;
    }

    setConfigPanelTab(tabs[0]?.id ?? "target");
  }, [configPanelTab, selectedConfig]);

  const syncNodes = useCallback(
    (configs: N8nNodeConfig[], nextSnapshot: TelegramWorkflowSnapshot | null) => {
      const configById = new Map(configs.map((config) => [config.id, config]));
      setNodes((current) =>
        current.map((node) => {
          const config = configById.get(node.id);
          if (!config) return node;
          return {
            ...node,
            data: {
              ...node.data,
              title: getNodeLabel(config),
              subtitle: normalizeSubtitle(nextSnapshot, config),
              sourceName: config.name,
              detail: config.detail,
              kind: config.kind,
              accent: config.accent,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const addNodeFromPalette = useCallback(
    (templateId: string, point: { x: number; y: number }) => {
      const nextIndex = nodeConfigs.length + 1;
      const nextConfig = createDroppedNodeConfig(templateId, nextIndex);
      if (!nextConfig) return;

      nextConfig.position = fromCanvasPosition(point);
      const nextNode: WorkflowNode = {
        id: nextConfig.id,
        type: "workflowNode",
        position: point,
        data: {
          title: getNodeLabel(nextConfig),
          subtitle: nextConfig.subtitle,
          detail: nextConfig.detail,
          sourceName: nextConfig.name,
          kind: nextConfig.kind,
          accent: nextConfig.accent,
        },
      };

      setNodeConfigs((current) => [...current, nextConfig]);
      setNodes((current) => [...current, nextNode]);
      setParameterDrafts((current) => ({
        ...current,
        [nextConfig.id]: stringifyJson(nextConfig.parameters),
      }));
      setSelectedNodeId(nextConfig.id);
      setConfigOpen(true);
      showToast("Đã thêm node");
    },
    [nodeConfigs.length, setNodes, showToast],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const edgeStyle = {
        animated: false,
        type: "smoothstep",
        style: { stroke: "rgba(184, 193, 212, 0.42)", strokeWidth: 1.35 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(184, 193, 212, 0.48)" },
      };

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            ...edgeStyle,
          },
          eds,
        ),
      );
      showToast("Đã nối line connect");
    },
    [setEdges, showToast],
  );

  const handleDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, templateId: string) => {
    event.dataTransfer.setData("application/x-n8n-node", templateId);
    event.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleCanvasDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const templateId = event.dataTransfer.getData("application/x-n8n-node");
      if (!templateId || !flowInstance) return;

      const point = flowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNodeFromPalette(templateId, point);
    },
    [addNodeFromPalette, flowInstance],
  );

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange<WorkflowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));

      const removedIds = changes
        .filter((change) => change.type === "remove")
        .map((change) => change.id);

      if (removedIds.length === 0) {
        return;
      }

      setNodeConfigs((configs) => configs.filter((config) => !removedIds.includes(config.id)));
      setParameterDrafts((drafts) => {
        const nextDrafts = { ...drafts };
        for (const removedId of removedIds) {
          delete nextDrafts[removedId];
        }
        return nextDrafts;
      });

      if (removedIds.includes(selectedNodeId)) {
        setSelectedNodeId("");
        setConfigOpen(false);
      }
    },
    [selectedNodeId, setNodes],
  );

  const handleNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: WorkflowNode) => {
    setNodeConfigs((current) =>
      current.map((config) => (config.id === node.id ? { ...config, position: fromCanvasPosition(node.position) } : config)),
    );
  }, []);

  const setAllowedTopicsForSelectedNode = useCallback(
    (topics: AllowedTopicSelection[]) => {
      if (!selectedConfig || selectedConfig.name !== "Allowed Group Topic") {
        return;
      }

      const nextTopics = topics;
      setNodeConfigs((current) => {
        const next = current.map((node) =>
          node.id === selectedConfig.id
            ? {
                ...node,
                parameters: {
                  ...node.parameters,
                  allowedTopics: nextTopics,
                },
              }
            : node,
        );
        syncNodes(next, snapshot);
        return next;
      });
      setParameterDrafts((current) => ({
        ...current,
        [selectedConfig.id]: stringifyJson({
          ...selectedConfig.parameters,
          allowedTopics: nextTopics,
        }),
      }));
    },
    [selectedConfig, snapshot, syncNodes],
  );

  const setTargetForSelectedNode = useCallback(
    (target: AllowedTopicSelection | null) => {
      if (
        !selectedConfig ||
        (!isTargetConfigurableNode(selectedConfig.name))
      ) {
        return;
      }

      setNodeConfigs((current) => {
        const next = current.map((node) => {
          if (node.id !== selectedConfig.id) {
            return node;
          }

          const nextParams: JsonRecord = {
            ...node.parameters,
            target,
            targetMode: target ? "fixed" : (node.parameters.targetMode ?? "fixed"),
          };

          if (isForwardOrRejectNode(node.name)) {
            nextParams.destinationChatId = target ? String(target.chatId) : "";
          } else if (node.name.startsWith("Gửi tin nhắn xác nhận") || isSupplierConfirmationNode(node.name) || isInspectionMaterialNode(node.name)) {
            nextParams.chatId = target ? `=-${Math.abs(target.chatId)}` : "";
            nextParams.additionalFields = {
              ...(nextParams.additionalFields as JsonRecord || {}),
              message_thread_id: target?.threadId ?? null,
            };
          }

          return {
            ...node,
            parameters: nextParams,
          };
        });
        syncNodes(next, snapshot);
        return next;
      });
      setParameterDrafts((current) => {
        const node = nodeConfigs.find((n) => n.id === selectedConfig.id);
        const currentParams = node ? node.parameters : {};
        const nextParams: JsonRecord = {
          ...currentParams,
          target,
          targetMode: target ? "fixed" : (currentParams.targetMode ?? "fixed"),
        };

        if (isForwardOrRejectNode(selectedConfig.name)) {
          nextParams.destinationChatId = target ? String(target.chatId) : "";
        } else if (selectedConfig.name.startsWith("Gửi tin nhắn xác nhận") || isSupplierConfirmationNode(selectedConfig.name) || isInspectionMaterialNode(selectedConfig.name)) {
          nextParams.chatId = target ? `=-${Math.abs(target.chatId)}` : "";
          nextParams.additionalFields = {
            ...(nextParams.additionalFields as JsonRecord || {}),
            message_thread_id: target?.threadId ?? null,
          };
        }

        return {
          ...current,
          [selectedConfig.id]: stringifyJson(nextParams),
        };
      });
    },
    [nodeConfigs, selectedConfig, snapshot, syncNodes],
  );

  const setTargetModeForSelectedNode = useCallback(
    (mode: TargetRoutingMode) => {
      if (!selectedConfig || !isTargetConfigurableNode(selectedConfig.name)) {
        return;
      }

      setNodeConfigs((current) => {
        const next = current.map((node) => {
          if (node.id !== selectedConfig.id) {
            return node;
          }

          return {
            ...node,
            parameters: {
              ...node.parameters,
              targetMode: mode,
            },
          };
        });
        syncNodes(next, snapshot);
        return next;
      });

      setParameterDrafts((current) => {
        const node = nodeConfigs.find((n) => n.id === selectedConfig.id);
        const currentParams = node ? node.parameters : {};
        return {
          ...current,
          [selectedConfig.id]: stringifyJson({
            ...currentParams,
            targetMode: mode,
          }),
        };
      });
    },
    [nodeConfigs, selectedConfig, snapshot, syncNodes],
  );

  const setMessageTemplateForSelectedNode = useCallback(
    (template: string) => {
      if (!selectedConfig || !isMessageTemplateNode(selectedConfig.name)) {
        return;
      }

      setNodeConfigs((current) => {
        const next = current.map((node) => {
          if (node.id !== selectedConfig.id) {
            return node;
          }

          return {
            ...node,
            parameters: {
              ...node.parameters,
              messageTemplate: template,
            },
          };
        });
        syncNodes(next, snapshot);
        return next;
      });
    },
    [selectedConfig, snapshot, syncNodes],
  );

  const setDisplayNameForSelectedNode = useCallback(
    (displayName: string) => {
      if (!selectedConfig) {
        return;
      }

      setNodeConfigs((current) => {
        const next = current.map((node) => {
          if (node.id !== selectedConfig.id) {
            return node;
          }

          return {
            ...node,
            displayName: displayName.trim(),
          };
        });
        syncNodes(next, snapshot);
        return next;
      });
    },
    [selectedConfig, snapshot, syncNodes],
  );

  const beginNodeRename = useCallback(() => {
    if (!selectedConfig) {
      return;
    }

    setRenameDraft(getNodeLabel(selectedConfig));
    setIsRenamingNode(true);
  }, [selectedConfig]);

  const commitNodeRename = useCallback(() => {
    if (!selectedConfig) {
      return;
    }

    setDisplayNameForSelectedNode(renameDraft);
    setIsRenamingNode(false);
  }, [renameDraft, selectedConfig, setDisplayNameForSelectedNode]);

  const cancelNodeRename = useCallback(() => {
    setRenameDraft(selectedConfig ? getNodeLabel(selectedConfig) : "");
    setIsRenamingNode(false);
  }, [selectedConfig]);

  const updateNodeMappings = useCallback((mappings: any[]) => {
    if (!selectedConfig) return;
    setNodeConfigs((current) => {
      const next = current.map((node) => {
        if (node.id !== selectedConfig.id) {
          return node;
        }

        const nextParams: JsonRecord = {
          ...node.parameters,
          mappings,
        };

        return {
          ...node,
          parameters: nextParams,
        };
      });
      syncNodes(next, snapshot);
      return next;
    });

    setParameterDrafts((current) => {
      const node = nodeConfigs.find((n) => n.id === selectedConfig.id);
      const currentParams = node ? node.parameters : {};
      const nextParams: JsonRecord = {
        ...currentParams,
        mappings,
      };

      return {
        ...current,
        [selectedConfig.id]: stringifyJson(nextParams),
      };
    });
  }, [selectedConfig, nodeConfigs, snapshot, syncNodes]);

  const handleDuplicateMappingRow = useCallback(
    (rowIdOrIndex: string | number) => {
      if (!selectedConfig) return;
      const currentMappings = (selectedConfig.parameters.mappings as any[]) || [];
      const sourceRow = currentMappings.find((row, idx) => (row.id || idx) === rowIdOrIndex);
      if (!sourceRow) return;

      const nextMappings = [
        ...currentMappings,
        {
          ...sourceRow,
          id: `row-${Date.now()}-${currentMappings.length}`,
        },
      ];

      updateNodeMappings(nextMappings);
      setSelectedMappingRowId(nextMappings[nextMappings.length - 1].id);
    },
    [selectedConfig, updateNodeMappings],
  );

  const handleAddMappingRow = useCallback(() => {
    if (!selectedConfig) return;
    const currentMappings = (selectedConfig.parameters.mappings as any[]) || [];
    const nextId = `row-${Date.now()}-${currentMappings.length}`;
    const nextMappings = [
      ...currentMappings,
      {
        id: nextId,
        keywords: "",
        target: null,
      },
    ];

    updateNodeMappings(nextMappings);
    setSelectedMappingRowId(nextId);
  }, [selectedConfig, updateNodeMappings]);

  const handleRemoveMappingRow = useCallback((rowIdOrIndex: string | number) => {
    if (!selectedConfig) return;
    const currentMappings = (selectedConfig.parameters.mappings as any[]) || [];
    const removedIndex = currentMappings.findIndex((row, idx) => (row.id || idx) === rowIdOrIndex);
    const nextMappings = currentMappings.filter((row, idx) => {
      const id = row.id || idx;
      return id !== rowIdOrIndex;
    });

    updateNodeMappings(nextMappings);
    if (selectedMappingRowId === rowIdOrIndex) {
      const replacement = nextMappings[removedIndex] ?? nextMappings[removedIndex - 1] ?? nextMappings[0] ?? null;
      setSelectedMappingRowId(replacement ? replacement.id || 0 : null);
    }
  }, [selectedConfig, selectedMappingRowId, updateNodeMappings]);

  const handleUpdateRowKeywords = useCallback((rowIdOrIndex: string | number, keywords: string) => {
    if (!selectedConfig) return;
    const currentMappings = (selectedConfig.parameters.mappings as any[]) || [];
    const nextMappings = currentMappings.map((row, idx) => {
      const id = row.id || idx;
      if (id === rowIdOrIndex) {
        return { ...row, keywords };
      }
      return row;
    });

    updateNodeMappings(nextMappings);
  }, [selectedConfig, updateNodeMappings]);

  const handleUpdateRowTarget = useCallback((rowIdOrIndex: string | number, target: AllowedTopicSelection | null) => {
    if (!selectedConfig) return;
    const currentMappings = (selectedConfig.parameters.mappings as any[]) || [];
    const nextMappings = currentMappings.map((row, idx) => {
      const id = row.id || idx;
      if (id === rowIdOrIndex) {
        return { ...row, target };
      }
      return row;
    });

    updateNodeMappings(nextMappings);
  }, [selectedConfig, updateNodeMappings]);

  const applyRuntimeStatus = useCallback((nextStatus: RuntimeStatus) => {
    setRuntimeStatus(nextStatus);
    setWorkflowActive(nextStatus.active);
  }, []);

  const refreshRuntimeStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/local-workflow", { cache: "no-store" });
      const payload = (await response.json()) as { ok: boolean; status: RuntimeStatus; error?: string };
      if (payload.status) {
        applyRuntimeStatus(payload.status);
      }
    } catch {
      // Status refresh is best-effort; workflow controls surface action errors directly.
    }
  }, [applyRuntimeStatus]);

  const startWorkflow = useCallback(async () => {
    setRuntimeBusy(true);
    setStatus({ kind: "loading", text: "Starting local workflow" });

    // Collect all forward targets from configs
    const forwardTargets: Array<{ nodeName: string; target?: AllowedTopicSelection; keywords?: string; routeMode?: TargetRoutingMode }> = [];
    const messageTemplates: MessageTemplateConfig[] = [];
    for (const config of nodeConfigs) {
      if (isForwardOrRejectNode(config.name) || isSupplierConfirmationNode(config.name) || isInspectionMaterialNode(config.name) || config.name.startsWith("Gửi tin nhắn xác nhận")) {
        if (config.parameters.mappings && Array.isArray(config.parameters.mappings)) {
          for (const mapping of config.parameters.mappings) {
            if (mapping.target && mapping.target.chatId) {
              forwardTargets.push({
                nodeName: `${config.name} (${mapping.keywords || "không từ khóa"})`,
                target: mapping.target,
                keywords: typeof mapping.keywords === "string" ? mapping.keywords : undefined,
                routeMode: "fixed",
              });
            }
          }
        } else {
          const targetMode = getTargetRoutingMode(config.parameters);
          const target = getTopicSelection(config.parameters);
          if (targetMode === "previous" || (target && target.chatId)) {
            forwardTargets.push({
              nodeName: config.name,
              target: target ?? undefined,
              keywords: typeof config.parameters.keywords === "string" ? config.parameters.keywords : undefined,
              routeMode: targetMode,
            });
          }
        }
      }

      if (isMessageTemplateNode(config.name)) {
        messageTemplates.push({
          nodeName: config.name,
          template: getMessageTemplateValue(config),
        });
      }
    }

    try {
      const response = await fetch("/api/local-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          token: token.trim() || undefined,
          allowedTopics: getAllowedTopicsFromConfigs(nodeConfigs),
          approvalTarget: getTargetFromConfig(nodeConfigs, "Gửi tin nhắn xác nhận") ||
                          getTargetFromConfigPrefix(nodeConfigs, "Gửi tin nhắn xác nhận"),
          approvalTargetMode: getTargetRoutingMode(
            nodeConfigs.find((config) => config.name === "Gửi tin nhắn xác nhận" || config.name.startsWith("Gửi tin nhắn xác nhận"))?.parameters,
          ),
          forwardTarget: getTargetFromConfig(nodeConfigs, "Forward Tin nhắn") ||
                         getTargetFromConfigPrefix(nodeConfigs, "Chuyển tiếp"),
          forwardTargetMode: getTargetRoutingMode(
            nodeConfigs.find((config) => config.name === "Forward Tin nhắn" || config.name.startsWith("Chuyển tiếp"))?.parameters,
          ),
          forwardTargets,
          messageTemplates,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; status?: RuntimeStatus; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Không start được local workflow.");
      }
      if (payload.status) {
        applyRuntimeStatus(payload.status);
      }
      setStatus({ kind: "success", text: "Local workflow started" });
      showToast("Local workflow started");
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không start được local workflow.");
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setRuntimeBusy(false);
    }
  }, [applyRuntimeStatus, nodeConfigs, showToast, token]);

  const stopWorkflow = useCallback(async () => {
    setRuntimeBusy(true);

    try {
      const response = await fetch("/api/local-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const payload = (await response.json()) as { ok: boolean; status?: RuntimeStatus; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Không stop được local workflow.");
      }
      if (payload.status) {
        applyRuntimeStatus(payload.status);
      }
      setAutoPoll(false);
      setStatus({ kind: "idle", text: "Local workflow stopped" });
      showToast("Local workflow stopped");
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không stop được local workflow.");
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setRuntimeBusy(false);
    }
  }, [applyRuntimeStatus, showToast]);

  const probeInventory = useCallback(async () => {
    if (probeBusy || workflowActive) {
      return;
    }

    setProbeBusy(true);
    setStatus({ kind: "loading", text: "Probing inventory" });

    try {
      const response = await fetch("/api/local-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "probe",
          token: token.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        status?: RuntimeStatus;
        probedGroups?: number;
        probedTopics?: number;
        failedTargets?: string[];
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Không probe được inventory.");
      }

      if (payload.status) {
        applyRuntimeStatus(payload.status);
      }

      const parts = [
        payload.probedGroups ? `${payload.probedGroups} group` : null,
        payload.probedTopics ? `${payload.probedTopics} topic` : null,
      ].filter(Boolean);
      showToast(parts.length ? `Probe xong ${parts.join(" / ")}` : "Probe xong");
      setStatus({ kind: "success", text: `Probe xong ${parts.join(" / ") || "inventory"}` });
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không probe được inventory.");
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setProbeBusy(false);
    }
  }, [applyRuntimeStatus, probeBusy, showToast, token, workflowActive]);

  const fetchWorkflow = useCallback(async (options: { silent?: boolean } = {}) => {
    if (inFlightRef.current) {
      return;
    }

    const trimmedToken = token.trim();
    inFlightRef.current = true;
    setIsFetching(true);
    if (!options.silent) {
      setStatus({ kind: "loading", text: "Loading workflow" });
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scan",
          token: trimmedToken || undefined,
          deepScan,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as TelegramWorkflowSnapshot | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Không quét được Telegram");
      }

      const nextSnapshot = payload as TelegramWorkflowSnapshot;
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      setStatus({
        kind: "success",
        text: `Đã scan ${formatNumber(nextSnapshot.groups.length)} group / ${formatNumber(nextSnapshot.topics.length)} topic`,
      });
      syncNodes(nodeConfigs, nextSnapshot);
      if (!options.silent) {
        showToast(nextSnapshot.warnings[0] ?? "Đã cập nhật group/topic");
      }
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không quét được Telegram");
      if (message !== "The operation was aborted.") {
        if (!options.silent) {
          setStatus({ kind: "error", text: message });
          showToast(message);
        }
      }
    } finally {
      inFlightRef.current = false;
      setIsFetching(false);
      abortRef.current = null;
    }
  }, [deepScan, nodeConfigs, showToast, syncNodes, token]);

  const refreshInventory = useCallback(async () => {
    if (refreshBusy) {
      return;
    }

    const trimmedToken = token.trim();
    setRefreshBusy(true);
    setStatus({ kind: "loading", text: "Refreshing inventory" });

    try {
      const response = await fetch("/api/local-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refreshInventory",
          token: trimmedToken || undefined,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; status?: RuntimeStatus; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Không refresh được inventory.");
      }

      if (payload.status) {
        applyRuntimeStatus(payload.status);
      }

      snapshotRef.current = null;
      setSnapshot(null);
      await fetchWorkflow({ silent: true });
      showToast("Inventory cache cleared");
      setStatus({ kind: "success", text: "Inventory đã được refresh" });
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không refresh được inventory.");
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setRefreshBusy(false);
    }
  }, [applyRuntimeStatus, fetchWorkflow, refreshBusy, showToast, token]);

  const syncAvatarCache = useCallback(async () => {
    if (avatarSyncBusy) {
      return;
    }

    const trimmedToken = token.trim();
    setAvatarSyncBusy(true);
    setStatus({ kind: "loading", text: "Syncing avatars" });

    try {
      clearAvatarPreviewCache();
      const response = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "syncAvatar",
          token: trimmedToken || undefined,
        }),
      });

      const payload = (await response.json()) as { ok: boolean; syncedCount?: number; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Không sync được avatar.");
      }

      setAvatarRefreshKey((value) => value + 1);
      const syncedCount = payload.syncedCount ?? 0;
      showToast(syncedCount > 0 ? `Đã đồng bộ ${syncedCount} avatar` : "Đồng bộ avatar xong");
      setStatus({ kind: "success", text: `Đã đồng bộ ${syncedCount} avatar` });
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không sync được avatar.");
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setAvatarSyncBusy(false);
    }
  }, [avatarSyncBusy, showToast, token]);

  const openRefreshConfirm = useCallback(() => {
    setRefreshConfirmDraft("");
    setRefreshConfirmOpen(true);
  }, []);

  const closeRefreshConfirm = useCallback(() => {
    if (refreshBusy) {
      return;
    }
    setRefreshConfirmOpen(false);
    setRefreshConfirmDraft("");
  }, [refreshBusy]);

  const confirmRefreshInventory = useCallback(async () => {
    if (refreshBusy) {
      return;
    }

    if (refreshConfirmDraft.trim().toUpperCase() !== "REFRESH") {
      setStatus({ kind: "error", text: 'Gõ "REFRESH" để xác nhận.' });
      return;
    }

    try {
      await refreshInventory();
      setRefreshConfirmOpen(false);
      setRefreshConfirmDraft("");
    } catch {
      // refreshInventory already surfaces errors.
    }
  }, [refreshBusy, refreshConfirmDraft, refreshInventory]);

  const handleDeleteWebhook = useCallback(async () => {
    if (deleteBusy) {
      return;
    }

    const trimmedToken = token.trim();
    setDeleteBusy(true);
    setStatus({ kind: "loading", text: "Deleting webhook" });

    try {
      const response = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteWebhook",
          token: trimmedToken || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Không tắt được webhook");
      }

      setStatus({ kind: "success", text: "Webhook off" });
      showToast("Webhook off");
      await fetchWorkflow();
    } catch (error) {
      const message = getCleanErrorMessage(error, "Không tắt được webhook");
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, fetchWorkflow, showToast, token]);

  useEffect(() => {
    if (!hydrated || !autoPoll || workflowActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const kickoff = window.setTimeout(() => {
      void fetchWorkflow({ silent: true });
    }, 0);

    intervalRef.current = window.setInterval(() => {
      void fetchWorkflow({ silent: true });
    }, 12000);

    return () => {
      window.clearTimeout(kickoff);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoPoll, fetchWorkflow, hydrated, workflowActive]);

  useEffect(
    () => () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (workspaceSaveTimerRef.current) {
        clearTimeout(workspaceSaveTimerRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void refreshRuntimeStatus();
    }, 0);

    const statusTimer = window.setInterval(() => {
      void refreshRuntimeStatus();
    }, 1000);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(statusTimer);
    };
  }, [refreshRuntimeStatus]);

  const inventoryGroupCount = runtimeStatus?.inventory.groups.length ?? 0;
  const inventoryTopicCount = runtimeStatus?.inventory.topics.length ?? 0;
  const workflowStateLabel = workflowActive ? "Active" : "Stopped";
  const workflowStateClass = workflowActive ? "text-emerald-300" : "text-rose-300";
  const runtimeHandled = runtimeStatus?.handledCount ?? 0;
  const runtimeIgnored = runtimeStatus?.ignoredCount ?? 0;
  const runtimeLastUpdate = runtimeStatus?.lastUpdateAt
    ? new Date(runtimeStatus.lastUpdateAt).toLocaleTimeString()
    : "None";
  const statusColor =
    status.kind === "error"
      ? "text-rose-300"
      : status.kind === "success"
        ? "text-emerald-300"
        : status.kind === "loading"
          ? "text-sky-300"
          : "text-white/60";
  const backgroundDots = "rgba(255,255,255,0.055)";
  const edgeStroke = "rgba(203, 213, 225, 0.42)";
  const edgeArrow = "rgba(203, 213, 225, 0.42)";

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#101010] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:18px_18px] opacity-35" />

      <div className="absolute inset-0">
        <ReactFlow
          nodes={visualNodes}
          edges={visualEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setFlowInstance}
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setSelectedEdgeId(null);
            setConfigOpen(true);
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id);
            setConfigOpen(false);
          }}
          onEdgesDelete={() => {
            setSelectedEdgeId(null);
          }}
          onPaneClick={() => {
            setSelectedEdgeId(null);
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.32, maxZoom: 0.82 }}
          minZoom={0.45}
          maxZoom={1.35}
          deleteKeyCode={["Delete", "Backspace"]}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          className="h-full w-full"
          defaultEdgeOptions={{
            type: "workflowEdge",
          style: { stroke: edgeStroke, strokeWidth: 1.35 },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeArrow },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color={backgroundDots} />
        </ReactFlow>
      </div>

      <div className="pointer-events-none absolute left-6 top-6 z-20 flex max-w-[calc(100vw-3rem)] flex-wrap items-center gap-2">
        <div className="pointer-events-auto rounded-[8px] border border-white/10 bg-[#151516]/94 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-[180px] max-w-[220px]">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Workflow</div>
              <div className="truncate text-sm font-medium text-white">{WORKFLOW_TEMPLATE.name}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void (workflowActive ? stopWorkflow() : startWorkflow())}
                disabled={runtimeBusy}
                title={workflowActive ? "Stop Workflow" : "Start Workflow"}
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-[6px] border transition disabled:cursor-not-allowed disabled:opacity-60",
                  workflowActive
                    ? "border-rose-400/30 bg-rose-400/12 text-rose-300 hover:bg-rose-400/20"
                    : "border-emerald-400/30 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/20",
                ].join(" ")}
              >
                {runtimeBusy ? (
                  <span className="text-[10px] font-medium text-white/50">...</span>
                ) : workflowActive ? (
                  <StopIcon className="h-5 w-5" />
                ) : (
                  <PlayIcon className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaletteOpen((value) => !value);
                }}
                title="Nodes Palette"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-[6px] border transition",
                  paletteOpen ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300" : "border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <SquaresPlusIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={openRefreshConfirm}
                disabled={refreshBusy}
                title="Refresh inventory"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-[6px] border transition disabled:cursor-not-allowed disabled:opacity-60",
                  refreshBusy
                    ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
                    : "border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {refreshBusy ? (
                  <span className="text-[10px] font-medium text-white/55">...</span>
                ) : (
                  <ArrowPathIcon className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void syncAvatarCache()}
                disabled={avatarSyncBusy}
                title="Sync avatars"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-[6px] border transition disabled:cursor-not-allowed disabled:opacity-60",
                  avatarSyncBusy
                    ? "border-violet-400/25 bg-violet-400/10 text-violet-200"
                    : "border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {avatarSyncBusy ? (
                  <span className="text-[10px] font-medium text-white/55">...</span>
                ) : (
                  <PhotoIcon className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfigOpen((value) => !value)}
                title="Node Settings"
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-[6px] border transition",
                  configOpen ? "border-amber-400/30 bg-amber-400/15 text-amber-300" : "border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <AdjustmentsHorizontalIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {paletteOpen ? (
        <Card className="pointer-events-auto absolute left-6 top-[108px] z-20 w-[320px] border-white/10 bg-[#151516]/94 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-3">
            <div>
              <CardTitle className="text-sm font-medium text-white">Palette</CardTitle>
              <CardDescription className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                Nodes
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setPaletteOpen(false)}
              aria-label="Đóng"
              title="Đóng"
              className="text-white/45 hover:bg-white/10 hover:text-white"
            >
              <XMarkIcon aria-hidden="true" className="h-4 w-4" />
            </Button>
          </CardHeader>
          <Separator className="bg-white/10" />
          <CardContent className="p-4 pt-0">
            <ScrollArea className="h-[28rem] pr-3">
              <div className="space-y-2">
                {NODE_PALETTE.map((item) => {
                  const style = getPaletteIcon(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      draggable
                      onDragStart={(event) => handleDragStart(event, item.id)}
                      onDoubleClick={() => addNodeFromPalette(item.id, { x: 520 + nodeConfigs.length * 18, y: 420 })}
                      className="flex w-full cursor-grab items-center gap-3 rounded-[8px] border border-white/10 bg-white/5 p-2.5 text-left transition hover:bg-white/10 active:cursor-grabbing"
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border ${style.bg}`}>
                        {style.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold text-white">{item.label}</span>
                        <span className="mt-0.5 block truncate font-mono text-[10px] text-white/35">{item.n8nType}</span>
                      </div>
                      <div className="shrink-0 flex flex-col items-end justify-center">
                        <Badge
                          variant="secondary"
                          className={`rounded-[4px] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                            item.kind === "condition"
                              ? "border-emerald-500/15 bg-emerald-500/10 text-emerald-300"
                              : "border-sky-500/15 bg-sky-500/10 text-sky-300"
                          }`}
                        >
                          {item.kind}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : null}

      {configOpen ? (
        <div className={configPanelWrapperClass}>
          <Card className={configPanelCardClass}>
            {hasConfigTabs ? (
              <Tabs value={activeConfigPanelTab} onValueChange={(value) => setConfigPanelTab(value as ConfigPanelTab)} className="flex h-full w-full flex-col">
                <CardHeader className="space-y-3 p-4 pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardDescription className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                        Node
                      </CardDescription>
                      {selectedConfig ? (
                        isRenamingNode ? (
                          <Input
                            autoFocus
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={commitNodeRename}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitNodeRename();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelNodeRename();
                              }
                            }}
                            className="mt-2 h-9 w-full rounded-[6px] border-sky-400/30 bg-[#101011] px-3 text-[14px] font-medium text-white outline-none focus:border-sky-400/50"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={beginNodeRename}
                            className="mt-2 block w-full truncate text-left text-sm font-medium text-white transition hover:text-sky-300"
                            title="Bấm để đổi tên"
                          >
                            {getNodeLabel(selectedConfig)}
                          </button>
                        )
                      ) : (
                        <div className="mt-2 truncate text-sm font-medium text-white">Node</div>
                      )}
                      <CardDescription className="mt-1 truncate text-[11px] leading-5 text-white/35">
                        {selectedConfig ? normalizeSubtitle(snapshot, selectedConfig) : "Chọn node để cấu hình"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setConfigPanelExpanded((value) => !value)}
                        aria-label={configPanelExpanded ? "Thu nhỏ" : "Phóng to"}
                        title={configPanelExpanded ? "Thu nhỏ" : "Phóng to"}
                        className="border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white"
                      >
                        {configPanelExpanded ? <ArrowsPointingInIcon aria-hidden="true" className="h-4 w-4" /> : <ArrowsPointingOutIcon aria-hidden="true" className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setConfigOpen(false)}
                        aria-label="Đóng"
                        title="Đóng"
                        className="border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white"
                      >
                        <XMarkIcon aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-[8px] border border-white/10 bg-white/5 p-1">
                    {configPanelTabs.map((tab) => (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        title={tab.id === "template" ? MESSAGE_TEMPLATE_HELP_TEXT : undefined}
                        className="rounded-[6px] px-3 py-1.5 text-[11px] font-medium text-white/60 data-active:bg-sky-400 data-active:text-slate-950 hover:bg-white/10 hover:text-white"
                      >
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </CardHeader>

                <Separator className="bg-white/10" />
                <CardContent className="min-h-0 flex-1 px-4 pb-4 pt-3">
                  <ScrollArea className="h-[calc(100vh-10rem)] pr-2">
                    <div className="space-y-4 pr-1">
                      {configPanelTabs.map((tab) => (
                        <TabsContent key={tab.id} value={tab.id} className="mt-0 outline-none">
                          {selectedConfig ? renderConfigPanelContent(tab.id) : null}
                        </TabsContent>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Tabs>
            ) : (
              <>
                <CardHeader className="space-y-3 p-4 pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardDescription className="text-[10px] uppercase tracking-[0.28em] text-white/35">
                        Node
                      </CardDescription>
                      {selectedConfig ? (
                        isRenamingNode ? (
                          <Input
                            autoFocus
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={commitNodeRename}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                commitNodeRename();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelNodeRename();
                              }
                            }}
                            className="mt-2 h-9 w-full rounded-[6px] border-sky-400/30 bg-[#101011] px-3 text-[14px] font-medium text-white outline-none focus:border-sky-400/50"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={beginNodeRename}
                            className="mt-2 block w-full truncate text-left text-sm font-medium text-white transition hover:text-sky-300"
                            title="Bấm để đổi tên"
                          >
                            {getNodeLabel(selectedConfig)}
                          </button>
                        )
                      ) : (
                        <div className="mt-2 truncate text-sm font-medium text-white">Node</div>
                      )}
                      <CardDescription className="mt-1 truncate text-[11px] leading-5 text-white/35">
                        {selectedConfig ? normalizeSubtitle(snapshot, selectedConfig) : "Chọn node để cấu hình"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setConfigPanelExpanded((value) => !value)}
                        aria-label={configPanelExpanded ? "Thu nhỏ" : "Phóng to"}
                        title={configPanelExpanded ? "Thu nhỏ" : "Phóng to"}
                        className="border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white"
                      >
                        {configPanelExpanded ? <ArrowsPointingInIcon aria-hidden="true" className="h-4 w-4" /> : <ArrowsPointingOutIcon aria-hidden="true" className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setConfigOpen(false)}
                        aria-label="Đóng"
                        title="Đóng"
                        className="border-white/10 bg-white/5 text-white/35 hover:bg-white/10 hover:text-white"
                      >
                        <XMarkIcon aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <Separator className="bg-white/10" />
                <CardContent className="min-h-0 flex-1 px-4 pb-4 pt-3">
                  <ScrollArea className="h-[calc(100vh-10rem)] pr-2">
                    <div className="space-y-4 pr-1">
                      {selectedConfig ? renderConfigPanelContent(primaryConfigTab) : null}
                    </div>
                  </ScrollArea>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-[8px] border border-white/10 bg-[#151516]/94 px-4 py-2 text-[12px] text-white shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          {toast}
        </div>
      ) : null}

      <AlertDialog open={refreshConfirmOpen} onOpenChange={(open) => !open && closeRefreshConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa cache inventory và quét lại</AlertDialogTitle>
            <AlertDialogDescription>
              Thao tác này sẽ xóa cache group/topic hiện tại ngay lập tức, rồi quét lại Telegram để nạp dữ liệu mới.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-[8px] border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] leading-5 text-amber-50/90">
            Thao tác này sẽ xóa cache group/topic hiện tại ngay lập tức, rồi quét lại Telegram để nạp dữ liệu mới.
          </div>

          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Nhập xác nhận</div>
            <Input
              autoFocus
              value={refreshConfirmDraft}
              onChange={(event) => setRefreshConfirmDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeRefreshConfirm();
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  void confirmRefreshInventory();
                }
              }}
              placeholder='Gõ "REFRESH"'
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={refreshBusy}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={refreshBusy || refreshConfirmDraft.trim().toUpperCase() !== "REFRESH"}
              onClick={() => void confirmRefreshInventory()}
              className="bg-rose-500 text-white hover:bg-rose-500/90"
            >
              {refreshBusy ? "Đang refresh..." : "Xóa cache và refresh"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function MetaBox({ label, value, valueClassName = "text-white/75" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</div>
      <div className={["mt-1 truncate text-[12px]", valueClassName].join(" ")}>{value}</div>
    </div>
  );
}

const avatarPreviewCache = new Map<number, string>();
const avatarPreviewInFlight = new Map<number, Promise<string | null>>();

function clearAvatarPreviewCache() {
  for (const url of avatarPreviewCache.values()) {
    URL.revokeObjectURL(url);
  }
  avatarPreviewCache.clear();
  avatarPreviewInFlight.clear();
}

function GroupAvatar({ title, chatId, refreshKey }: { title: string; chatId: number; refreshKey: number }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const cleanTitle = title.trim();
  const fallback = cleanTitle ? cleanTitle.charAt(0).toUpperCase() : "G";

  useEffect(() => {
    let cancelled = false;

    async function loadAvatar() {
      const cached = avatarPreviewCache.get(chatId);
      if (cached) {
        if (!cancelled) {
          setImageSrc(cached);
        }
        return;
      }

      const inFlight = avatarPreviewInFlight.get(chatId);
      if (inFlight) {
        const pending = await inFlight;
        if (!cancelled) {
          setImageSrc(pending);
        }
        return;
      }

      const endpoint = `/api/telegram/chat-photo?chatId=${chatId}`;
      const cachedEndpoint = `${endpoint}&v=${refreshKey}`;

      const request = (async () => {
        try {
          const response = await fetch(cachedEndpoint);

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          avatarPreviewCache.set(chatId, objectUrl);
          return objectUrl;
        } catch (error) {
          return null;
        } finally {
          avatarPreviewInFlight.delete(chatId);
        }
      })();

      avatarPreviewInFlight.set(chatId, request);
      const nextImage = await request;
      if (!cancelled) {
        setImageSrc(nextImage);
      }
    }

    void loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [chatId, cleanTitle, refreshKey]);

  return (
    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-[11px] font-semibold text-white/70">
      {imageSrc ? (
        <img src={imageSrc} alt="" className="size-full object-cover" />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}

function AllowedTopicPicker({
  topics,
  selectedTopics,
  selectedCount,
  hasSnapshot,
  avatarRefreshKey,
  onChange,
  onSelectAll,
  onClear,
}: {
  topics: AllowedTopicSelection[];
  selectedTopics: AllowedTopicSelection[];
  selectedCount: number;
  hasSnapshot: boolean;
  avatarRefreshKey: number;
  onChange: (topics: AllowedTopicSelection[]) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const selectedKeys = new Set(selectedTopics.map(topicKey));
  const groups = groupTopics(topics);
  const [open, setOpen] = useState(false);

  function toggleTopic(topic: AllowedTopicSelection) {
    const key = topicKey(topic);
    const exists = selectedKeys.has(key);
    onChange(exists ? selectedTopics.filter((item) => topicKey(item) !== key) : [...selectedTopics, topic]);
  }

  function toggleGroup(groupTopicsList: AllowedTopicSelection[]) {
    const groupKeys = new Set(groupTopicsList.map(topicKey));
    const allSelected = groupTopicsList.every((topic) => selectedKeys.has(topicKey(topic)));

    if (allSelected) {
      onChange(selectedTopics.filter((topic) => !groupKeys.has(topicKey(topic))));
      return;
    }

    const next = [...selectedTopics];
    for (const topic of groupTopicsList) {
      if (!selectedKeys.has(topicKey(topic))) {
        next.push(topic);
      }
    }
    onChange(next);
  }

  return (
    <div className="rounded-[6px] border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Group chat / topic</div>
          <div className="mt-1 text-[12px] text-white/72">{formatNumber(selectedCount)} topic chọn</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)} className="h-8 px-2.5 text-[11px]">
            Thêm
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSelectAll} className="h-8 px-2.5 text-[11px]">
            All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClear} className="h-8 px-2.5 text-[11px]">
            Clear
          </Button>
        </div>
      </div>

      {!hasSnapshot ? (
        <div className="mt-3 rounded-[6px] border border-amber-300/15 bg-amber-300/8 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
          Scan bot để lấy group/topic hiện có.
        </div>
      ) : null}
      <CommandDialog
        key={`allowed-topics-${open ? "open" : "closed"}`}
        open={open}
        onOpenChange={setOpen}
        title="Chọn group/topic"
        description="Tìm group hoặc topic rồi bấm Add để thêm vào workflow."
        className="!h-[min(68vh,calc(100vh-2rem))] !max-h-[min(68vh,calc(100vh-2rem))] !w-[min(42rem,calc(100%-2rem))] !max-w-none overflow-hidden p-0"
        showCloseButton
      >
        <Command className="h-full min-h-0 bg-background text-foreground">
          <CommandInput placeholder="Tìm group hoặc topic..." />
          <CommandList className="min-h-0 flex-1 overflow-y-auto">
            <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>

            {groups.map((group) => {
              const groupSelectedCount = group.topics.filter((topic) => selectedKeys.has(topicKey(topic))).length;
              const groupItem = topics.find((topic) => topic.chatId === group.chatId && topic.threadId === null) ?? null;
              const groupSelected = groupItem ? selectedKeys.has(topicKey(groupItem)) : false;

              return (
                <CommandGroup
                  key={group.chatId}
                  heading={`${group.chatTitle} · ${formatNumber(groupSelectedCount)}/${formatNumber(group.topics.length)} topic`}
                >
                  {groupItem ? (
                    <CommandItem
                      value={`${group.chatTitle} all messages group`}
                      onSelect={() => toggleTopic(groupItem)}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/40"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <GroupAvatar title={group.chatTitle} chatId={group.chatId} refreshKey={avatarRefreshKey} />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-foreground">All messages</div>
                          <div className="text-[10px] text-muted-foreground">{group.chatTitle}</div>
                        </div>
                      </div>
                      <span
                        className={[
                          "relative ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                          groupSelected ? "border-rose-400/30 bg-rose-400/15 text-rose-300" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
                        ].join(" ")}
                      >
                        <PlusIcon
                          aria-hidden="true"
                          className={[
                            "pointer-events-none absolute inset-0 m-auto size-4 transition duration-150",
                            groupSelected ? "scale-75 opacity-0" : "scale-100 opacity-100",
                          ].join(" ")}
                        />
                        <XCircleIcon
                          aria-hidden="true"
                          className={[
                            "pointer-events-none absolute inset-0 m-auto size-4 transition duration-150",
                            groupSelected ? "scale-100 opacity-100" : "scale-75 opacity-0",
                          ].join(" ")}
                        />
                      </span>
                    </CommandItem>
                  ) : null}

                  {group.topics.map((topic) => {
                    const key = topicKey(topic);
                    const checked = selectedKeys.has(key);

                    return (
                    <CommandItem
                      key={key}
                      value={`${group.chatTitle} ${topic.topicName} topic ${topic.threadId ?? ""}`}
                      onSelect={() => toggleTopic(topic)}
                      className="flex items-center justify-between gap-3 border-l border-border/40 pl-6"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <GroupAvatar title={group.chatTitle} chatId={group.chatId} refreshKey={avatarRefreshKey} />
                        <div className="min-w-0">
                          <div className="truncate text-[11px] text-foreground">
                            {formatTopicDisplayName(topic.topicName, topic.threadId)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{group.chatTitle}</div>
                        </div>
                      </div>
                      <span
                        className={[
                          "relative ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                          checked ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-background text-muted-foreground",
                          ].join(" ")}
                      >
                          <PlusIcon
                            aria-hidden="true"
                            className={[
                              "pointer-events-none absolute inset-0 m-auto size-4 transition duration-150",
                              checked ? "scale-75 opacity-0" : "scale-100 opacity-100",
                            ].join(" ")}
                          />
                          <XCircleIcon
                            aria-hidden="true"
                            className={[
                              "pointer-events-none absolute inset-0 m-auto size-4 transition duration-150",
                              checked ? "scale-100 opacity-100" : "scale-75 opacity-0",
                            ].join(" ")}
                          />
                      </span>
                    </CommandItem>
                  );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}

function TopicTargetPicker({
  topics,
  value,
  mode,
  hasSnapshot,
  avatarRefreshKey,
  onChange,
  onClear,
  onModeChange,
}: {
  topics: AllowedTopicSelection[];
  value: AllowedTopicSelection | null;
  mode: TargetRoutingMode;
  hasSnapshot: boolean;
  avatarRefreshKey: number;
  onChange: (topic: AllowedTopicSelection) => void;
  onClear: () => void;
  onModeChange: (mode: TargetRoutingMode) => void;
}) {
  const selectedKey = value ? topicKey(value) : null;
  const groups = buildTopicPickerGroups(topics);
  const [open, setOpen] = useState(false);

  function chooseTopic(topic: AllowedTopicSelection) {
    const key = topicKey(topic);
    if (selectedKey === key) {
      onClear();
      return;
    }
    onChange(topic);
  }

  const selectionLabel = value ? formatTopicSelectionLabel(value) : "Chưa chọn";

  return (
    <div className="rounded-[6px] border border-white/10 bg-white/5 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Group chat / topic</div>
          <div className="mt-1 truncate text-[12px] text-white/72">{selectionLabel}</div>
          {mode === "previous" ? (
            <div className="mt-1 truncate text-[10px] text-sky-100/70">Đang dùng group/topic từ nguồn trước đó</div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-start gap-1.5 sm:justify-end">
          <button
            type="button"
            aria-pressed={mode === "previous"}
            onClick={() => onModeChange(mode === "previous" ? "fixed" : "previous")}
            className={[
              "inline-flex h-8 min-w-[132px] items-center justify-between gap-3 rounded-[6px] border px-3 text-[11px] font-medium transition",
              mode === "previous"
                ? "border-sky-400/30 bg-sky-400/15 text-sky-100"
                : "border-white/10 bg-white/5 text-white/72 hover:bg-white/10",
            ].join(" ")}
          >
            <span className="whitespace-nowrap">Đích trước đó</span>
            <span
              className={[
                "relative inline-flex h-4 w-7 shrink-0 rounded-full transition",
                mode === "previous" ? "bg-sky-400/70" : "bg-white/15",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white transition",
                  mode === "previous" ? "left-3.5" : "left-0.5",
                ].join(" ")}
              />
            </span>
          </button>
          {mode === "fixed" ? (
            <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)} className="h-8 whitespace-nowrap px-2.5 text-[11px]">
              Chọn
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onClear} className="h-8 whitespace-nowrap px-2.5 text-[11px]">
            Clear
          </Button>
        </div>
      </div>

      {!hasSnapshot ? (
        <div className="mt-3 rounded-[6px] border border-amber-300/15 bg-amber-300/8 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
          Scan bot để lấy group/topic hiện có.
        </div>
      ) : mode === "previous" ? (
        <div className="mt-3 rounded-[6px] border border-sky-300/15 bg-sky-300/8 px-3 py-2 text-[11px] leading-5 text-sky-100/80">
          Node sẽ gửi vào group/topic của tin nhắn trước đó. Không cần chọn đích cố định.
        </div>
      ) : null}
      {mode === "fixed" ? (
      <CommandDialog
        key={`topic-target-${open ? "open" : "closed"}`}
        open={open}
        onOpenChange={setOpen}
        title="Chọn group/topic"
          description="Tìm group hoặc topic rồi chọn đích."
          className="!h-[min(68vh,calc(100vh-2rem))] !max-h-[min(68vh,calc(100vh-2rem))] !w-[min(42rem,calc(100%-2rem))] !max-w-none overflow-hidden p-0"
          showCloseButton
        >
          <Command className="h-full min-h-0 bg-background text-foreground">
            <CommandInput placeholder="Tìm group hoặc topic..." />
            <CommandList className="min-h-0 flex-1 overflow-y-auto">
              <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>

              {groups.map((group) => {
                const groupKey = topicKey(group.group);
                const groupSelected = selectedKey === groupKey;

                return (
                  <CommandGroup key={group.chatId} heading={group.chatTitle}>
                    <CommandItem
                      value={`${group.chatTitle} all messages group`}
                      onSelect={() => chooseTopic(group.group)}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/40"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <GroupAvatar title={group.chatTitle} chatId={group.chatId} refreshKey={avatarRefreshKey} />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-foreground">All messages</div>
                          <div className="text-[10px] text-muted-foreground">{group.chatTitle}</div>
                        </div>
                      </div>
                      <span
                        className={[
                          "ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                          groupSelected ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-background text-muted-foreground",
                        ].join(" ")}
                      >
                        {groupSelected ? <CheckCircleIcon aria-hidden="true" className="size-4" /> : <PlusIcon aria-hidden="true" className="size-4" />}
                      </span>
                    </CommandItem>

                    {group.topics.map((topic) => {
                      const key = topicKey(topic);
                      const checked = selectedKey === key;

                      return (
                        <CommandItem
                          key={key}
                          value={`${group.chatTitle} ${topic.topicName} topic ${topic.threadId ?? ""}`}
                          onSelect={() => chooseTopic(topic)}
                          className="flex items-center justify-between gap-3 border-l border-border/40 pl-6"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <GroupAvatar title={group.chatTitle} chatId={group.chatId} refreshKey={avatarRefreshKey} />
                            <div className="min-w-0">
                              <div className="truncate text-[11px] text-foreground">
                                {formatTopicDisplayName(topic.topicName, topic.threadId)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">{group.chatTitle}</div>
                            </div>
                          </div>
                          <span
                            className={[
                              "ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md border",
                              checked ? "border-rose-400/30 bg-rose-400/15 text-rose-300" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
                            ].join(" ")}
                          >
                            {checked ? <XCircleIcon aria-hidden="true" className="size-4" /> : <PlusIcon aria-hidden="true" className="size-4" />}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </CommandDialog>
      ) : null}
    </div>
  );
}

function SafeMessageTemplateEditor({
  nodeName,
  value,
  onChange,
}: {
  nodeName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const isRejectNode = nodeName.startsWith("Từ chối tin nhắn");
  const isInspectionNode = nodeName.startsWith("Nghiệm thu vật tư");
  const editableText = getSafeMessageTemplateText(nodeName, value);

  const handleChange = useCallback(
    (nextText: string) => {
      onChange(buildSafeMessageTemplate(nodeName, nextText));
    },
    [nodeName, onChange],
  );

  if (!isRejectNode && !isInspectionNode) {
    return (
      <div className="rounded-[8px] border border-white/10 bg-white/5 p-3 text-[12px] leading-5 text-white/72">
        Không hỗ trợ chỉnh trực tiếp phần mẫu này.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[6px] border border-white/10 bg-white/5 p-3">
      <div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/35">
          <span>Mẫu tin nhắn</span>
          <HoverTip text={MESSAGE_TEMPLATE_HELP_TEXT} />
        </div>
        <div className="mt-1 text-[12px] text-white/52">Chỉ sửa phần chữ. Biến và cú pháp được khóa cứng.</div>
      </div>

      {isRejectNode ? (
        <>
          <div className="rounded-[6px] border border-white/10 bg-black/10 px-3 py-2 text-[11px] leading-5 text-white/45">
            Phần khóa: <span className="font-mono text-white/75">{"{{originalText}}"}</span>
          </div>
          <label className="block">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Text được sửa</div>
            <Textarea
              value={editableText}
              onChange={(event) => handleChange(event.target.value)}
              rows={2}
              className="mt-2 w-full bg-[#0d1118] px-3 py-2 text-[12px] leading-5 text-white placeholder:text-white/28 focus:border-sky-400/40"
              placeholder="Đã bị từ chối: "
            />
          </label>
          <div className="rounded-[6px] border border-white/10 bg-black/10 px-3 py-2 text-[11px] leading-5 text-white/45">
            Kết quả: <span className="text-white/75">{editableText || "Đã bị từ chối: "}</span>
            <span className="font-mono text-white/75">{"{{originalText}}"}</span>
          </div>
        </>
      ) : null}

      {isInspectionNode ? (
        <>
          <div className="rounded-[6px] border border-white/10 bg-black/10 px-3 py-2 text-[11px] leading-5 text-white/45">
            Phần khóa: <span className="font-mono text-white/75">{"📋 <b>{{userName}}</b>"}</span> và{" "}
            <span className="font-mono text-white/75">{"{{replyText}}"}</span>
          </div>
          <label className="block">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Text được sửa</div>
            <Textarea
              value={editableText}
              onChange={(event) => handleChange(event.target.value)}
              rows={3}
              className="mt-2 w-full bg-[#0d1118] px-3 py-2 text-[12px] leading-5 text-white placeholder:text-white/28 focus:border-sky-400/40"
              placeholder=" nghiệm thu vật tư sau xác nhận nhà cung ứng.\n\n"
            />
          </label>
          <div className="rounded-[6px] border border-white/10 bg-black/10 px-3 py-2 text-[11px] leading-5 text-white/45">
            Kết quả: <span className="font-mono text-white/75">{"📋 <b>{{userName}}</b>"}</span>
            <span className="text-white/75">{editableText || " nghiệm thu vật tư sau xác nhận nhà cung ứng.\n\n"}</span>
            <span className="font-mono text-white/75">{"{{replyText}}"}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function groupTopics(topics: AllowedTopicSelection[]) {
  const groups = new Map<number, { chatId: number; chatTitle: string; topics: AllowedTopicSelection[] }>();

  for (const topic of topics) {
    const existing = groups.get(topic.chatId);
    if (existing) {
      existing.topics.push(topic);
      continue;
    }

    groups.set(topic.chatId, {
      chatId: topic.chatId,
      chatTitle: topic.chatTitle,
      topics: [topic],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    topics: group.topics.sort((first, second) => {
      if (first.threadId === null) return -1;
      if (second.threadId === null) return 1;
      return first.topicName.localeCompare(second.topicName);
    }),
  }));
}

function normalizePickerQuery(query: string) {
  return query.trim().toLowerCase();
}

function topicMatchesQuery(topic: AllowedTopicSelection, query: string) {
  if (!query) {
    return true;
  }

  const chatTitle = topic.chatTitle.toLowerCase();
  const topicName = topic.topicName.toLowerCase();
  const threadIdText = topic.threadId === null ? "all messages" : `topic #${topic.threadId}`;
  return chatTitle.includes(query) || topicName.includes(query) || threadIdText.includes(query);
}

function filterTopicGroups(
  groups: ReturnType<typeof groupTopics>,
  query: string,
): Array<{ chatId: number; chatTitle: string; topics: AllowedTopicSelection[]; matchGroup: boolean }> {
  const normalized = normalizePickerQuery(query);
  if (!normalized) {
    return [];
  }

  return groups
    .map((group) => {
      const matchGroup = group.chatTitle.toLowerCase().includes(normalized);
      const topics = matchGroup ? group.topics : group.topics.filter((topic) => topicMatchesQuery(topic, normalized));
      return topics.length > 0 ? { chatId: group.chatId, chatTitle: group.chatTitle, topics, matchGroup } : null;
    })
    .filter(Boolean) as Array<{ chatId: number; chatTitle: string; topics: AllowedTopicSelection[]; matchGroup: boolean }>;
}

function ToggleButton({
  active,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex h-10 items-center justify-between gap-3 rounded-[6px] border px-3 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-55",
        active ? "border-sky-400/30 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/5 text-white/72",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "h-2.5 w-2.5 rounded-full",
          active ? "bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.45)]" : "bg-white/28",
        ].join(" ")}
      />
    </button>
  );
}

function getCleanErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg === "Failed to fetch" || msg.includes("fetch failed")) {
      return "Không thể kết nối đến server (Failed to fetch). Vui lòng đảm bảo server đang chạy.";
    }
    return msg;
  }
  return fallback;
}

