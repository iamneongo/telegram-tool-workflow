"use client";

import {
  ArrowPathRoundedSquareIcon,
  ArrowRightIcon,
  BoltIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
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

type NodeAccent = "cyan" | "emerald" | "amber" | "rose";
type NodeKind = "trigger" | "condition" | "action";
type JsonRecord = Record<string, unknown>;

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
    groups: { chatId: number; chatTitle: string; chatType: string }[];
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
      target: null,
      destinationChatId: "",
      sourceChatId: "",
      messageId: "",
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
};

function getNodeDisplayName(name: string) {
  return NODE_DISPLAY_NAMES[name] ?? name;
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
  if (sourceName.includes("Forward")) return <ArrowRightIcon aria-hidden="true" className={className} />;
  if (sourceName.includes("Gửi") || sourceName.includes("Lấy")) {
    return <ChatBubbleBottomCenterTextIcon aria-hidden="true" className={className} />;
  }
  if (sourceName.includes("Callback")) return <QuestionMarkCircleIcon aria-hidden="true" className={className} />;
  return <PaperAirplaneIcon aria-hidden="true" className={className} />;
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
      title: getNodeDisplayName(config.name),
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
  const target = getTopicSelection(node.parameters);
  if (!target || !target.chatId) return undefined;
  return target;
}

function getTargetFromConfigPrefix(configs: N8nNodeConfig[], prefix: string) {
  const node = configs.find((config) => config.name.startsWith(prefix));
  if (!node) return undefined;
  const target = getTopicSelection(node.parameters);
  if (!target || !target.chatId) return undefined;
  return target;
}

function isForwardOrRejectNode(nodeName: string) {
  return nodeName.startsWith("Forward Tin nhắn") ||
         nodeName.startsWith("Chuyển tiếp") ||
         nodeName.startsWith("Từ chối tin nhắn");
}

function isTargetConfigurableNode(nodeName: string) {
  return isForwardOrRejectNode(nodeName) ||
         nodeName.startsWith("Gửi tin nhắn xác nhận");
}

function formatTopicSelectionLabel(target: AllowedTopicSelection | null) {
  if (!target) {
    return "Chưa chọn";
  }

  return target.threadId === null ? target.chatTitle : `${target.chatTitle} / ${formatTopicDisplayName(target.topicName)}`;
}

function formatTopicDisplayName(topicName: string) {
  const value = topicName.trim();
  if (!value) {
    return "Topic";
  }

  return value;
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
  for (const topic of next.topics) topics.set(`${topic.chatId}:${topic.threadId}`, topic);

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

  if (isForwardOrRejectNode(config.name) || config.name.startsWith("Gửi tin nhắn xác nhận")) {
    const target = getTopicSelection(config.parameters);
    return target ? formatTopicSelectionLabel(target) : "select target";
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
    default:
      return getParameterSubtitle(config.parameters, config.subtitle);
  }
}

function createDroppedNodeConfig(templateId: string, index: number): N8nNodeConfig | null {
  const template = NODE_PALETTE.find((item) => item.id === templateId);
  if (!template) return null;

  const id = `local-${template.id}-${Date.now()}-${index}`;
  return {
    id,
    name: `${template.label} ${index}`,
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
  const [isFetching, setIsFetching] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<TelegramWorkflowSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>({ kind: "idle", text: "Ready" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [nodeConfigs, setNodeConfigs] = useState<N8nNodeConfig[]>(cloneTemplateNodes);
  const [, setParameterDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(WORKFLOW_TEMPLATE.nodes.map((node) => [node.id, stringifyJson(node.parameters)])),
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>("9bfb1a1e-2ae7-41f8-aa01-c8bb9a90a1de");
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(createNodes(WORKFLOW_TEMPLATE.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(createEdges(WORKFLOW_TEMPLATE.nodes));
  const [toast, setToast] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<WorkflowNode, Edge> | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

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
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const nodeNameById = useMemo(() => new Map(nodeConfigs.map((node) => [node.id, node.name])), [nodeConfigs]);
  const selectedEdgeLabel = selectedEdge
    ? `${nodeNameById.get(selectedEdge.source) ?? "Node"} → ${nodeNameById.get(selectedEdge.target) ?? "Node"}`
    : null;
  const selectedAllowedTopics = useMemo(
    () => (selectedConfig?.name === "Allowed Group Topic" ? getAllowedTopics(selectedConfig.parameters) : []),
    [selectedConfig],
  );
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
          style: { ...edge.style, stroke, strokeWidth: selected ? 3.2 : 2.6 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        };
      }),
    [edges, executionVisuals, selectedEdgeId],
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
        setPaletteOpen(state.ui.paletteOpen);
        setSelectedNodeId(state.ui.selectedNodeId);
        setSelectedEdgeId(state.ui.selectedEdgeId);
        setSnapshot(state.ui.snapshot);
        snapshotRef.current = state.ui.snapshot;
        setRuntimeStatus((state.ui.runtimeStatus as RuntimeStatus | null) ?? null);
        setWorkflowActive(Boolean((state.ui.runtimeStatus as RuntimeStatus | null)?.active));

        if (payload.exists) {
          const loadedNodeConfigs = state.ui.nodeConfigs as N8nNodeConfig[];
          setNodeConfigs(loadedNodeConfigs);
          setNodes(createNodes(loadedNodeConfigs));
          setEdges(state.ui.edges as Edge[]);
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
  }, [setEdges, setNodes]);

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
              title: getNodeDisplayName(config.name),
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
          title: getNodeDisplayName(nextConfig.name),
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

  const removeSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) {
      return;
    }

    setEdges((current) => current.filter((edge) => edge.id !== selectedEdgeId));
    setSelectedEdgeId(null);
    showToast("Đã xóa line connect");
  }, [selectedEdgeId, setEdges, showToast]);

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
          };

          if (isForwardOrRejectNode(node.name)) {
            nextParams.destinationChatId = target ? String(target.chatId) : "";
          } else if (node.name.startsWith("Gửi tin nhắn xác nhận")) {
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
        };

        if (isForwardOrRejectNode(selectedConfig.name)) {
          nextParams.destinationChatId = target ? String(target.chatId) : "";
        } else if (selectedConfig.name.startsWith("Gửi tin nhắn xác nhận")) {
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
    const forwardTargets: Array<{ nodeName: string; target: AllowedTopicSelection }> = [];
    for (const config of nodeConfigs) {
      if (isForwardOrRejectNode(config.name)) {
        const target = getTopicSelection(config.parameters);
        if (target && target.chatId) {
          forwardTargets.push({
            nodeName: config.name,
            target,
          });
        }
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
          forwardTarget: getTargetFromConfig(nodeConfigs, "Forward Tin nhắn") ||
                         getTargetFromConfigPrefix(nodeConfigs, "Chuyển tiếp"),
          forwardTargets,
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
      const mergedSnapshot = mergeWorkflowSnapshots(snapshotRef.current, nextSnapshot);
      snapshotRef.current = mergedSnapshot;
      setSnapshot(mergedSnapshot);
      setStatus({
        kind: "success",
        text: `Đã scan ${formatNumber(mergedSnapshot.groups.length)} group / ${formatNumber(mergedSnapshot.topics.length)} topic`,
      });
      syncNodes(nodeConfigs, mergedSnapshot);
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

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#101010] text-white">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:18px_18px] opacity-35" />

      <div className="absolute inset-0">
        <ReactFlow
          nodes={visualNodes}
          edges={visualEdges}
          onNodesChange={onNodesChange}
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
            type: "smoothstep",
            style: { stroke: "rgba(203, 213, 225, 0.42)", strokeWidth: 1.35 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(203, 213, 225, 0.42)" },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.055)" />
        </ReactFlow>
      </div>

      <div className="pointer-events-none absolute left-6 top-6 z-20 flex max-w-[calc(100vw-3rem)] flex-wrap items-center gap-2">
        <div className="pointer-events-auto rounded-[8px] border border-white/10 bg-[#151516]/92 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="min-w-[210px]">
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Workflow</div>
              <div className="truncate text-sm font-medium text-white/85">{WORKFLOW_TEMPLATE.name}</div>
            </div>
            <button
              type="button"
              onClick={() => void (workflowActive ? stopWorkflow() : startWorkflow())}
              disabled={runtimeBusy}
              className={[
                "h-9 rounded-[6px] border px-3.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
                workflowActive
                  ? "border-rose-400/30 bg-rose-400/12 text-rose-100 hover:bg-rose-400/18"
                  : "border-emerald-400/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20",
              ].join(" ")}
            >
              {runtimeBusy ? "..." : workflowActive ? "Stop" : "Start"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((value) => !value);
                setPaletteOpen(false);
              }}
              className={[
                "h-9 rounded-[6px] border px-3.5 text-[12px] font-medium transition",
                settingsOpen ? "border-sky-400/30 bg-sky-400/15 text-sky-100" : "border-white/10 bg-white/5 text-white/75",
              ].join(" ")}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => {
                setPaletteOpen((value) => !value);
                setSettingsOpen(false);
              }}
              className={[
                "h-9 rounded-[6px] border px-3.5 text-[12px] font-medium transition",
                paletteOpen ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-white/5 text-white/75",
              ].join(" ")}
            >
              Nodes
            </button>
            <button
              type="button"
              onClick={() => setConfigOpen((value) => !value)}
              className={[
                "h-9 rounded-[6px] border px-3.5 text-[12px] font-medium transition",
                configOpen ? "border-amber-400/30 bg-amber-400/15 text-amber-100" : "border-white/10 bg-white/5 text-white/75",
              ].join(" ")}
            >
              Config
            </button>
          </div>
        </div>
      </div>

      {selectedEdge ? (
        <div className="pointer-events-none absolute right-6 top-6 z-30">
          <div className="pointer-events-auto rounded-[8px] border border-sky-400/20 bg-[#151516]/94 px-3 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Line</div>
            <div className="mt-1 max-w-[220px] truncate text-[12px] text-white/78">{selectedEdgeLabel}</div>
            <button
              type="button"
              onClick={removeSelectedEdge}
              className="mt-2 h-8 rounded-[6px] border border-rose-400/25 bg-rose-400/12 px-3 text-[11px] font-medium text-rose-100 transition hover:bg-rose-400/18"
            >
              Delete line
            </button>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="pointer-events-auto absolute left-6 top-[108px] z-30 w-[360px] rounded-[8px] border border-white/10 bg-[#151516]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Settings</div>
              <div className="mt-1 text-sm font-medium text-white">Telegram scan</div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Đóng"
              title="Đóng"
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <XMarkIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">Token</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="env token"
                className="mt-1 h-10 w-full rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-sky-400/40"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void fetchWorkflow()}
                disabled={isFetching || workflowActive}
                className="h-10 rounded-[6px] bg-sky-400 px-3 text-[12px] font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {workflowActive ? "Running" : isFetching ? "Scanning" : "Scan now"}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteWebhook()}
                disabled={deleteBusy}
                className="h-10 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteBusy ? "Working" : "Webhook off"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void probeInventory()}
                disabled={probeBusy || workflowActive}
                className="h-10 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {probeBusy ? "Probing" : workflowActive ? "Stop to probe" : "Probe inventory"}
              </button>
              <div className="rounded-[6px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] leading-5 text-white/48">
                Gửi thử rồi xoá ngay để ghi nhớ group thực tế.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ToggleButton
                active={autoPoll}
                disabled={workflowActive}
                label="Auto scan"
                onClick={() => setAutoPoll((value) => !value)}
              />
              <ToggleButton active={deepScan} label="Deep scan" onClick={() => setDeepScan((value) => !value)} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MetaBox label="State" value={workflowStateLabel} valueClassName={workflowStateClass} />
              <MetaBox label="Webhook" value={snapshot?.webhook.url ? "On" : "Off"} />
              <MetaBox label="Inventory" value={`${formatNumber(inventoryGroupCount)} / ${formatNumber(inventoryTopicCount)}`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MetaBox label="Handled" value={formatNumber(runtimeHandled)} />
              <MetaBox label="Ignored" value={formatNumber(runtimeIgnored)} />
              <MetaBox label="Last event" value={runtimeLastUpdate} />
            </div>
            {runtimeStatus?.lastError ? (
              <div className="rounded-[6px] border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[12px] leading-5 text-rose-100">
                {runtimeStatus.lastError}
              </div>
            ) : null}
            {runtimeStatus?.logs.length ? (
              <div className="max-h-36 overflow-auto rounded-[6px] border border-white/10 bg-white/[0.03] p-2">
                {runtimeStatus.logs.slice(0, 5).map((log) => (
                  <div key={`${log.at}-${log.updateId ?? log.message}`} className="py-1 text-[11px] leading-4 text-white/64">
                    <span className="text-white/35">{new Date(log.at).toLocaleTimeString()}</span> {log.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {paletteOpen ? (
        <div className="pointer-events-auto absolute left-6 top-[108px] z-20 w-[240px] rounded-[8px] border border-white/10 bg-[#151516]/94 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Nodes</div>
              <div className="mt-1 text-sm font-medium text-white">Palette</div>
            </div>
            <button
              type="button"
              onClick={() => setPaletteOpen(false)}
              aria-label="Đóng"
              title="Đóng"
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <XMarkIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {NODE_PALETTE.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(event) => handleDragStart(event, item.id)}
                onDoubleClick={() => addNodeFromPalette(item.id, { x: 520 + nodeConfigs.length * 18, y: 420 })}
                className="flex w-full items-center justify-between gap-3 rounded-[6px] border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition hover:bg-white/[0.08]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-white/82">{item.label}</span>
                  <span className="block truncate text-[10px] text-white/38">{item.n8nType}</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/35">{item.kind}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {configOpen ? (
        <div className="pointer-events-none absolute right-6 bottom-6 z-20 w-[380px] max-w-[calc(100vw-3rem)]">
          <div className="pointer-events-auto rounded-[8px] border border-white/10 bg-[#151516]/94 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Thiết lập</div>
                <div className="mt-2 truncate text-sm font-medium text-white">
                  {selectedConfig ? getNodeDisplayName(selectedConfig.name) : "Node"}
                </div>
                {selectedConfig ? (
                  <div className="mt-1 text-[12px] leading-5 text-white/48">{getNodeSetupSummary(selectedConfig.name)}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                aria-label="Đóng"
                title="Đóng"
                className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <XMarkIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {selectedConfig ? (
              <div className="mt-4 space-y-3">
                {selectedConfig.name === "Allowed Group Topic" ? (
                  <AllowedTopicPicker
                    topics={availableTopics}
                    selectedTopics={selectedAllowedTopics}
                    selectedCount={selectedAllowedTopics.length}
                    hasSnapshot={Boolean(snapshot)}
                    onChange={setAllowedTopicsForSelectedNode}
                    onSelectAll={() => setAllowedTopicsForSelectedNode(availableTopics)}
                    onClear={() => setAllowedTopicsForSelectedNode([])}
                  />
                ) : isTargetConfigurableNode(selectedConfig.name) ? (
                  <TopicTargetPicker
                    topics={availableTopics}
                    value={getTopicSelection(selectedConfig.parameters)}
                    hasSnapshot={Boolean(snapshot)}
                    onChange={setTargetForSelectedNode}
                    onClear={() => setTargetForSelectedNode(null)}
                  />
                ) : (
                  <div className="rounded-[6px] border border-white/10 bg-white/[0.03] px-3 py-3 text-[12px] leading-5 text-white/68">
                    Node này đã được cấu hình sẵn. Chỉ cần bấm Start là chạy.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-6 bottom-6 z-20 flex items-end gap-3">
        <div className="pointer-events-auto rounded-[8px] border border-white/10 bg-[#151516]/92 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Status</div>
          <div className={["mt-1 text-sm font-medium", statusColor].join(" ")}>{status.text}</div>
          <div className="mt-1 text-[11px] text-white/35">
            {snapshot ? `${snapshot.meta.updateCount} update(s)` : selectedNode?.data.title ?? "waiting"}
          </div>
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-[8px] border border-white/10 bg-[#151516]/94 px-4 py-2 text-[12px] text-white shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function MetaBox({ label, value, valueClassName = "text-white/75" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-[6px] border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</div>
      <div className={["mt-1 truncate text-[12px]", valueClassName].join(" ")}>{value}</div>
    </div>
  );
}

function AllowedTopicPicker({
  topics,
  selectedTopics,
  selectedCount,
  hasSnapshot,
  onChange,
  onSelectAll,
  onClear,
}: {
  topics: AllowedTopicSelection[];
  selectedTopics: AllowedTopicSelection[];
  selectedCount: number;
  hasSnapshot: boolean;
  onChange: (topics: AllowedTopicSelection[]) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const selectedKeys = new Set(selectedTopics.map(topicKey));
  const groups = groupTopics(topics);

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
    <div className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Group chat / topic</div>
          <div className="mt-1 text-[12px] text-white/72">{formatNumber(selectedCount)} topic chọn</div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onSelectAll}
            className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-2.5 text-[11px] text-white/75 transition hover:bg-white/10"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClear}
            className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-2.5 text-[11px] text-white/75 transition hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      </div>

      {!hasSnapshot ? (
        <div className="mt-3 rounded-[6px] border border-amber-300/15 bg-amber-300/8 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
          Scan bot để lấy group/topic hiện có.
        </div>
      ) : null}

      <div className="mt-3 max-h-72 space-y-2 overflow-auto">
        {groups.length === 0 ? (
          <div className="rounded-[6px] border border-white/10 bg-white/[0.03] px-3 py-3 text-[12px] text-white/45">
            Chưa có group/topic.
          </div>
        ) : null}

        {groups.map((group) => {
          const groupSelectedCount = group.topics.filter((topic) => selectedKeys.has(topicKey(topic))).length;
          const allSelected = groupSelectedCount === group.topics.length && group.topics.length > 0;

          return (
            <div key={group.chatId} className="overflow-hidden rounded-[6px] border border-white/10 bg-[#101113]">
              <button
                type="button"
                onClick={() => toggleGroup(group.topics)}
                className={[
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition",
                  allSelected ? "bg-emerald-400/10" : "bg-white/[0.035] hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-white/86">{group.chatTitle}</span>
                  <span className="block text-[10px] text-white/36">
                    {formatNumber(groupSelectedCount)}/{formatNumber(group.topics.length)}
                  </span>
                </span>
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    allSelected ? "border-emerald-300/60 bg-emerald-300 text-slate-950" : "border-white/20 bg-white/5 text-transparent",
                  ].join(" ")}
                >
                  ✓
                </span>
              </button>

              <div>
                {group.topics.map((topic) => {
                  const key = topicKey(topic);
                  const checked = selectedKeys.has(key);

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      title={topic.threadId === null ? topic.topicName : formatTopicDisplayName(topic.topicName)}
                      className={[
                        "grid w-full grid-cols-[20px_1fr] items-center gap-2 border-t border-white/7 px-3 py-2 text-left transition",
                        checked ? "bg-emerald-400/8" : "hover:bg-white/[0.035]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                          checked ? "border-emerald-300/60 bg-emerald-300 text-slate-950" : "border-white/20 bg-white/5 text-transparent",
                        ].join(" ")}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 truncate text-[12px] text-white/76">{formatTopicDisplayName(topic.topicName)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopicTargetPicker({
  topics,
  value,
  hasSnapshot,
  onChange,
  onClear,
}: {
  topics: AllowedTopicSelection[];
  value: AllowedTopicSelection | null;
  hasSnapshot: boolean;
  onChange: (topic: AllowedTopicSelection) => void;
  onClear: () => void;
}) {
  const selectedKey = value ? topicKey(value) : null;
  const groups = buildTopicPickerGroups(topics);

  function chooseTopic(topic: AllowedTopicSelection) {
    const key = topicKey(topic);
    if (selectedKey === key) {
      onClear();
      return;
    }
    onChange(topic);
  }

  return (
    <div className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Group chat / topic</div>
          <div className="mt-1 text-[12px] text-white/72">{formatTopicSelectionLabel(value)}</div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-2.5 text-[11px] text-white/75 transition hover:bg-white/10"
        >
          Clear
        </button>
      </div>

      {!hasSnapshot ? (
        <div className="mt-3 rounded-[6px] border border-amber-300/15 bg-amber-300/8 px-3 py-2 text-[11px] leading-5 text-amber-100/80">
          Scan bot để lấy group/topic hiện có.
        </div>
      ) : null}

      <div className="mt-3 max-h-72 space-y-2 overflow-auto">
        {groups.length === 0 ? (
          <div className="rounded-[6px] border border-white/10 bg-white/[0.03] px-3 py-3 text-[12px] text-white/45">
            Chưa có group/topic.
          </div>
        ) : null}

        {groups.map((group) => {
          const groupKey = topicKey(group.group);
          const groupSelected = selectedKey === groupKey;

          return (
            <div key={group.chatId} className="overflow-hidden rounded-[6px] border border-white/10 bg-[#101113]">
              <button
                type="button"
                onClick={() => chooseTopic(group.group)}
                className={[
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition",
                  groupSelected ? "bg-sky-400/10" : "bg-white/[0.035] hover:bg-white/[0.06]",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-white/86">{group.chatTitle}</span>
                  <span className="block text-[10px] text-white/36">All messages</span>
                </span>
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]",
                    groupSelected
                      ? "border-sky-300/60 bg-sky-300 text-slate-950"
                      : "border-white/20 bg-white/5 text-transparent",
                  ].join(" ")}
                >
                  ✓
                </span>
              </button>

              <div>
                {group.topics.map((topic) => {
                  const key = topicKey(topic);
                  const checked = selectedKey === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => chooseTopic(topic)}
                      className={[
                        "grid w-full grid-cols-[20px_1fr] items-center gap-2 border-t border-white/7 px-3 py-2 text-left transition",
                        checked ? "bg-sky-400/8" : "hover:bg-white/[0.035]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                          checked
                            ? "border-sky-300/60 bg-sky-300 text-slate-950"
                            : "border-white/20 bg-white/5 text-transparent",
                        ].join(" ")}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 truncate text-[12px] text-white/76">{formatTopicDisplayName(topic.topicName)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
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
