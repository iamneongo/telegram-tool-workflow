"use client";

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
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TelegramWorkflowSnapshot } from "@/lib/telegram";

type NodeAccent = "cyan" | "emerald" | "amber" | "rose";
type NodeKind = "trigger" | "condition" | "action";
type JsonRecord = Record<string, unknown>;

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
  executionSeq: number;
  currentExecution: RuntimeExecution | null;
  lastExecution: RuntimeExecution | null;
  offset?: number;
  hasToken: boolean;
};

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
      subtitle: "allowedTopics",
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
              leftValue:
                '={{ (() => {\n  const chatId = Number($json.message?.chat?.id ?? $json.callback_query?.message?.chat?.id);\n  const threadId = Number($json.message?.message_thread_id ?? $json.callback_query?.message?.message_thread_id);\n\n  const allowedTopics = [\n    { chatId: -1004312722594, threadId: 4 },\n    { chatId: -1004312722594, threadId: 6 },\n    { chatId: -1004312722594, threadId: 23 }\n  ];\n\n  return allowedTopics.some(item => item.chatId === chatId && (item.threadId === null ? true : item.threadId === threadId));\n})() }}',
              rightValue: true,
              operator: {
                type: "boolean",
                operation: "equals",
              },
              id: "e6c0a1aa-6fb5-4f43-b8c8-8d5e3a98d5d1",
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
      subtitle: "editMessageText",
      detail: "telegram",
      parameters: {
        operation: "editMessageText",
        chatId: '={{ $node["Telegram Trigger"].json.callback_query.message.chat.id }}',
        messageId: '={{ $node["Telegram Trigger"].json.callback_query.message.message_id }}',
        text: "Đã đồng ý",
        additionalFields: {},
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
      subtitle: "editMessageText",
      detail: "telegram",
      parameters: {
        operation: "editMessageText",
        chatId: '={{ $node["Telegram Trigger"].json.callback_query.message.chat.id }}',
        messageId: '={{ $node["Telegram Trigger"].json.callback_query.message.message_id }}',
        text: "Không đồng ý",
        additionalFields: {},
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
    label: "Telegram Message",
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
    label: "Edit Message",
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
    label: "IF Condition",
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
    label: "Forward Message",
    kind: "action",
    accent: "amber",
    n8nType: "n8n-nodes-forward-bot-telegram.forwardBotTelegram",
    typeVersion: 1,
    detail: "custom node",
    subtitle: "forwardMessage",
    parameters: {
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

function TelegramPlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-white">
      <path d="M21.5 3.2c.5-.2 1 .2.9.8l-3.2 15.1c-.1.5-.7.8-1.2.6l-4.8-2-2.3 2.7c-.4.5-1.2.4-1.4-.2l-1.2-4.8L3 13.7c-.6-.2-.6-1.1.1-1.4L21.5 3.2Zm-5.1 15.2 2.4-11.3-12 7 3.2 1.1 1.1 4.3 1.7-2 3.6 1.4Z" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[2]">
      <path d="M7 5v9.5A3.5 3.5 0 0 0 10.5 18H14" />
      <path d="M14 6l4 4-4 4" />
      <path d="M14 14h5" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
      <path d="M13 2 4 14h6l-1 8 11-14h-6l-1-6Z" />
    </svg>
  );
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
  const executionLabel =
    data.executionState === "running"
      ? "running"
      : data.executionState === "success"
        ? "done"
        : data.executionState === "skipped"
          ? "skip"
          : data.executionState === "error"
            ? "error"
            : null;

  return (
    <div
      className={[
        "relative flex h-[96px] w-[150px] flex-col rounded-[8px] border bg-[#242426] px-3 py-2 text-center",
        "backdrop-blur-sm transition-transform duration-200",
        data.executionState === "running" ? "scale-[1.03] animate-pulse" : "",
        selected && !data.executionState ? accent.glow : "shadow-[0_14px_40px_rgba(0,0,0,0.22)]",
        accent.ring,
        executionClass,
      ].join(" ")}
    >
      {executionLabel ? (
        <div className="pointer-events-none absolute -right-2 -top-2 rounded-full border border-white/10 bg-[#0f1012] px-2 py-0.5 text-[8px] uppercase tracking-[0.18em] text-white/70">
          {executionLabel}
        </div>
      ) : null}

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
          {data.kind === "condition" ? (
            <BranchIcon />
          ) : data.kind === "trigger" ? (
            <BoltIcon />
          ) : (
            <TelegramPlaneIcon />
          )}
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        <div className="truncate text-[12px] font-semibold leading-4 text-white">{data.title}</div>
        <div className="truncate text-[10px] leading-4 text-white/48">{data.subtitle}</div>
        {data.detail ? <div className="truncate text-[9px] leading-4 text-white/32">{data.detail}</div> : null}
      </div>

      {data.kind === "condition" ? (
        <>
          <Handle
            type="source"
            id="true"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !border-0 !bg-white/55"
            style={{ top: 34 }}
          />
          <Handle
            type="source"
            id="false"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !border-0 !bg-white/55"
            style={{ top: 58 }}
          />
          <span className="pointer-events-none absolute right-2 top-[29px] text-[8px] uppercase tracking-[0.18em] text-white/36">
            true
          </span>
          <span className="pointer-events-none absolute right-2 top-[53px] text-[8px] uppercase tracking-[0.18em] text-white/36">
            false
          </span>
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

function toCanvasPosition(position: [number, number]) {
  return {
    x: Math.round((position[0] + 3824) * 0.72 + 84),
    y: Math.round((position[1] + 2064) * 0.72 + 78),
  };
}

function createNodes(configs: N8nNodeConfig[]): WorkflowNode[] {
  return configs.map((config) => ({
    id: config.id,
    type: "workflowNode",
    position: toCanvasPosition(config.position),
    data: {
      title: config.name,
      subtitle: config.subtitle,
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
  if (!snapshot) {
    return getParameterSubtitle(config.parameters, config.subtitle);
  }

  switch (config.name) {
    case "Telegram Trigger":
      return snapshot.webhook.url ? "Webhook on" : "getUpdates";
    case "Allowed Group Topic":
      return `${formatNumber(snapshot.groups.length)} groups`;
    case "Has Callback":
      return `${formatNumber(snapshot.topics.length)} topics`;
    case "Lấy tin nhắn - 1":
    case "Lấy tin nhắn - 2":
      return `${formatNumber(snapshot.meta.updateCount)} updates`;
    case "Callback Answer":
      return snapshot.webhook.pending_update_count > 0 ? "pending replies" : "answerCallbackQuery";
    case "Quyết định phê duyệt":
      return snapshot.warnings.length > 0 ? "pending review" : "if approved";
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

function buildExportWorkflow(configs: N8nNodeConfig[], connections: N8nConnections, active: boolean) {
  return {
    id: WORKFLOW_TEMPLATE.id,
    name: WORKFLOW_TEMPLATE.name,
    active,
    settings: WORKFLOW_TEMPLATE.settings,
    nodes: configs.map((config) => ({
      id: config.id,
      name: config.name,
      type: config.n8nType,
      typeVersion: config.typeVersion,
      position: config.position,
      parameters: config.parameters,
      credentials: config.credentials,
      webhookId: config.webhookId,
    })),
    connections,
  };
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
  const [deepScan, setDeepScan] = useState(false);
  const [autoPoll, setAutoPoll] = useState(false);
  const [workflowActive, setWorkflowActive] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<TelegramWorkflowSnapshot | null>(null);
  const [status, setStatus] = useState<StatusState>({ kind: "idle", text: "Ready" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [nodeConfigs, setNodeConfigs] = useState<N8nNodeConfig[]>(cloneTemplateNodes);
  const [parameterDrafts, setParameterDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(WORKFLOW_TEMPLATE.nodes.map((node) => [node.id, stringifyJson(node.parameters)])),
  );
  const [parameterError, setParameterError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("9bfb1a1e-2ae7-41f8-aa01-c8bb9a90a1de");
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(createNodes(WORKFLOW_TEMPLATE.nodes));
  const [edges] = useEdgesState(createEdges(WORKFLOW_TEMPLATE.nodes));
  const [toast, setToast] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<WorkflowNode, Edge> | null>(null);

  const inFlightRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const selectedConfig = useMemo(
    () => nodeConfigs.find((node) => node.id === selectedNodeId) ?? nodeConfigs[0],
    [nodeConfigs, selectedNodeId],
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? nodes[0],
    [nodes, selectedNodeId],
  );
  const exportJson = useMemo(
    () => stringifyJson(buildExportWorkflow(nodeConfigs, WORKFLOW_TEMPLATE.connections, workflowActive)),
    [nodeConfigs, workflowActive],
  );
  const selectedOutgoing = useMemo(() => {
    if (!selectedConfig) return [];
    return WORKFLOW_TEMPLATE.connections[selectedConfig.name]?.main ?? [];
  }, [selectedConfig]);
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
        if (!highlighted) return edge;

        const targetStatus = executionVisuals.statusByNodeId.get(edge.target);
        const stroke =
          targetStatus === "error"
            ? "rgba(251,113,133,0.95)"
            : targetStatus === "skipped"
              ? "rgba(251,191,36,0.86)"
              : "rgba(56,189,248,0.98)";

        return {
          ...edge,
          animated: targetStatus !== "skipped",
          style: { ...edge.style, stroke, strokeWidth: 2.6 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        };
      }),
    [edges, executionVisuals],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const copyText = useCallback(
    async (value: string, message: string) => {
      try {
        await navigator.clipboard.writeText(value);
        showToast(message);
      } catch {
        showToast("Không copy được");
      }
    },
    [showToast],
  );

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
              title: config.name,
              subtitle: normalizeSubtitle(nextSnapshot, config),
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

  const updateSelectedConfig = useCallback(
    (patch: Partial<N8nNodeConfig>) => {
      setNodeConfigs((current) => {
        const next = current.map((node) => (node.id === selectedNodeId ? { ...node, ...patch } : node));
        syncNodes(next, snapshot);
        return next;
      });
    },
    [selectedNodeId, snapshot, syncNodes],
  );

  const applyParameters = useCallback(() => {
    if (!selectedConfig) return;

    try {
      const parsed = JSON.parse(parameterDrafts[selectedConfig.id] ?? "{}") as JsonRecord;
      setParameterError(null);
      setNodeConfigs((current) => {
        const next = current.map((node) =>
          node.id === selectedConfig.id
            ? {
                ...node,
                parameters: parsed,
                subtitle: getParameterSubtitle(parsed, node.subtitle),
              }
            : node,
        );
        syncNodes(next, snapshot);
        return next;
      });
      showToast("Đã cập nhật node");
    } catch (error) {
      const message = error instanceof Error ? error.message : "JSON không hợp lệ";
      setParameterError(message);
    }
  }, [parameterDrafts, selectedConfig, showToast, snapshot, syncNodes]);

  const resetParameters = useCallback(() => {
    if (!selectedConfig) return;
    setParameterDrafts((current) => ({
      ...current,
      [selectedConfig.id]: stringifyJson(selectedConfig.parameters),
    }));
    setParameterError(null);
  }, [selectedConfig]);

  const addNodeFromPalette = useCallback(
    (templateId: string, point: { x: number; y: number }) => {
      const nextIndex = nodeConfigs.length + 1;
      const nextConfig = createDroppedNodeConfig(templateId, nextIndex);
      if (!nextConfig) return;

      nextConfig.position = [Math.round((point.x - 84) / 0.72 - 3824), Math.round((point.y - 78) / 0.72 - 2064)];
      const nextNode: WorkflowNode = {
        id: nextConfig.id,
        type: "workflowNode",
        position: point,
        data: {
          title: nextConfig.name,
          subtitle: nextConfig.subtitle,
          detail: nextConfig.detail,
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

    try {
      const response = await fetch("/api/local-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          token: token.trim() || undefined,
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
      const message = error instanceof Error ? error.message : "Không start được local workflow.";
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setRuntimeBusy(false);
    }
  }, [applyRuntimeStatus, showToast, token]);

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
      const message = error instanceof Error ? error.message : "Không stop được local workflow.";
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setRuntimeBusy(false);
    }
  }, [applyRuntimeStatus, showToast]);

  const fetchWorkflow = useCallback(async () => {
    if (!workflowActive) {
      setStatus({ kind: "idle", text: "Workflow stopped" });
      showToast("Workflow is stopped");
      return;
    }

    if (inFlightRef.current) {
      return;
    }

    const trimmedToken = token.trim();
    inFlightRef.current = true;
    setIsFetching(true);
    setStatus({ kind: "loading", text: "Loading workflow" });

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
      setSnapshot(nextSnapshot);
      setStatus({ kind: "success", text: `Quét xong ${formatNumber(nextSnapshot.meta.updateCount)} update` });
      syncNodes(nodeConfigs, nextSnapshot);
      showToast(nextSnapshot.warnings[0] ?? "Workflow updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không quét được Telegram";
      if (message !== "The operation was aborted.") {
        setStatus({ kind: "error", text: message });
        showToast(message);
      }
    } finally {
      inFlightRef.current = false;
      setIsFetching(false);
      abortRef.current = null;
    }
  }, [deepScan, nodeConfigs, showToast, syncNodes, token, workflowActive]);

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
      const message = error instanceof Error ? error.message : "Không tắt được webhook";
      setStatus({ kind: "error", text: message });
      showToast(message);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, fetchWorkflow, showToast, token]);

  useEffect(() => {
    if (!autoPoll || !workflowActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const kickoff = window.setTimeout(() => {
      void fetchWorkflow();
    }, 0);

    intervalRef.current = window.setInterval(() => {
      void fetchWorkflow();
    }, 5000);

    return () => {
      window.clearTimeout(kickoff);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoPoll, fetchWorkflow, workflowActive]);

  useEffect(
    () => () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
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

  const botName = snapshot?.bot.first_name ?? "Telegram Bot";
  const botUser = snapshot?.bot.username ? `@${snapshot.bot.username}` : "token pending";
  const pendingCount = snapshot?.webhook.pending_update_count ?? 0;
  const workflowStateLabel = workflowActive ? "Active" : "Stopped";
  const workflowStateClass = workflowActive ? "text-emerald-300" : "text-rose-300";
  const runtimeHandled = runtimeStatus?.handledCount ?? 0;
  const runtimeIgnored = runtimeStatus?.ignoredCount ?? 0;
  const runtimeLastUpdate = runtimeStatus?.lastUpdateAt
    ? new Date(runtimeStatus.lastUpdateAt).toLocaleTimeString()
    : "None";
  const executionStatusClass =
    visibleExecution?.status === "error"
      ? "text-rose-300"
      : visibleExecution?.status === "skipped"
        ? "text-amber-300"
        : visibleExecution?.status === "running"
          ? "text-sky-300"
          : "text-emerald-300";
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
          onInit={setFlowInstance}
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setConfigOpen(true);
          }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.32, maxZoom: 0.82 }}
          minZoom={0.45}
          maxZoom={1.35}
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

        <div className="pointer-events-auto rounded-[8px] border border-white/10 bg-[#151516]/92 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="grid grid-cols-9 gap-3 text-left">
            <MiniStat label="State" value={workflowStateLabel} valueClassName={workflowStateClass} />
            <MiniStat label="Bot" value={botName} />
            <MiniStat label="Username" value={botUser} />
            <MiniStat label="Groups" value={formatNumber(snapshot?.groups.length ?? 0)} />
            <MiniStat label="Topics" value={formatNumber(snapshot?.topics.length ?? 0)} />
            <MiniStat label="Nodes" value={formatNumber(nodeConfigs.length)} />
            <MiniStat label="Pending" value={formatNumber(pendingCount)} />
            <MiniStat label="Handled" value={formatNumber(runtimeHandled)} />
            <MiniStat label="Ignored" value={formatNumber(runtimeIgnored)} />
          </div>
        </div>
      </div>

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
              className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[11px] text-white/75 transition hover:bg-white/10"
            >
              Close
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
                disabled={isFetching || !workflowActive}
                className="h-10 rounded-[6px] bg-sky-400 px-3 text-[12px] font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {!workflowActive ? "Stopped" : isFetching ? "Scanning" : "Scan now"}
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
              <ToggleButton
                active={autoPoll}
                disabled={!workflowActive}
                label="Auto scan"
                onClick={() => setAutoPoll((value) => !value)}
              />
              <ToggleButton active={deepScan} label="Deep scan" onClick={() => setDeepScan((value) => !value)} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MetaBox label="State" value={workflowStateLabel} valueClassName={workflowStateClass} />
              <MetaBox label="Webhook" value={snapshot?.webhook.url ? "On" : "Off"} />
              <MetaBox label="Mode" value={snapshot?.meta.deepScan ? "Deep" : "Preview"} />
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
              className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[11px] text-white/75 transition hover:bg-white/10"
            >
              Close
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
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/35">Node config</div>
              <div className="mt-2 truncate text-sm font-medium text-white">{selectedConfig?.name}</div>
              <div className="mt-1 truncate text-[12px] leading-5 text-white/50">{selectedConfig?.n8nType}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => void copyText(exportJson, "Đã copy workflow JSON")}
                className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[11px] text-white/75 transition hover:bg-white/10"
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="h-8 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[11px] text-white/75 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>

          {selectedConfig ? (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">Name</span>
                <input
                  value={selectedConfig.name}
                  onChange={(event) => updateSelectedConfig({ name: event.target.value })}
                  className="mt-1 h-9 w-full rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] text-white outline-none focus:border-sky-400/40"
                />
              </label>

              <div className="grid grid-cols-[1fr_96px] gap-2">
                <label className="block min-w-0">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">Type</span>
                  <input
                    value={selectedConfig.n8nType}
                    onChange={(event) => updateSelectedConfig({ n8nType: event.target.value })}
                    className="mt-1 h-9 w-full rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] text-white outline-none focus:border-sky-400/40"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">Version</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selectedConfig.typeVersion}
                    onChange={(event) => updateSelectedConfig({ typeVersion: Number(event.target.value) })}
                    className="mt-1 h-9 w-full rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] text-white outline-none focus:border-sky-400/40"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <MetaBox label="Credential" value={Object.values(selectedConfig.credentials ?? {})[0]?.name ?? "None"} />
                <MetaBox label="Webhook" value={selectedConfig.webhookId ?? "None"} />
              </div>

              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">Parameters</span>
                <textarea
                  value={parameterDrafts[selectedConfig.id] ?? "{}"}
                  onChange={(event) =>
                    setParameterDrafts((current) => ({
                      ...current,
                      [selectedConfig.id]: event.target.value,
                    }))
                  }
                  className="mt-1 h-48 w-full resize-none rounded-[6px] border border-white/10 bg-[#0d0d0e] p-3 font-mono text-[11px] leading-5 text-white/78 outline-none focus:border-sky-400/40"
                  spellCheck={false}
                />
              </label>

              {parameterError ? <div className="text-[11px] leading-5 text-rose-300">{parameterError}</div> : null}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={applyParameters}
                  className="h-9 rounded-[6px] bg-white px-3 text-[12px] font-medium text-black transition hover:bg-sky-100"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={resetParameters}
                  className="h-9 rounded-[6px] border border-white/10 bg-white/5 px-3 text-[12px] font-medium text-white/75 transition hover:bg-white/10"
                >
                  Reset
                </button>
              </div>

              <div className="rounded-[6px] border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Output</div>
                <div className="mt-2 space-y-1">
                  {selectedOutgoing.length === 0 ? (
                    <div className="text-[12px] text-white/40">None</div>
                  ) : (
                    selectedOutgoing.map((connections, index) => (
                      <div key={`${selectedConfig.id}-${index}`} className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-white/42">{index === 0 ? "true/main" : "false"}</span>
                        <span className="truncate text-[12px] text-white/75">
                          {connections.map((connection) => connection.node).join(", ") || "None"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
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

        {visibleExecution ? (
          <div className="pointer-events-auto max-w-[520px] rounded-[8px] border border-white/10 bg-[#151516]/92 px-4 py-3 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">Live run</div>
                <div className="mt-1 truncate text-sm font-medium text-white/85">
                  #{visibleExecution.id} · {visibleExecution.title}
                </div>
              </div>
              <div className={["shrink-0 text-[11px] font-medium uppercase tracking-[0.18em]", executionStatusClass].join(" ")}>
                {visibleExecution.status}
              </div>
            </div>
            <div className="mt-2 truncate text-[11px] text-white/45">{visibleExecution.summary}</div>
            <div className="mt-2 flex max-w-full gap-1.5 overflow-hidden">
              {visibleExecution.steps.slice(-6).map((step) => (
                <span
                  key={`${visibleExecution.id}-${step.nodeName}`}
                  className={[
                    "max-w-[110px] truncate rounded-full border px-2 py-1 text-[10px]",
                    executionChipClass(step.status),
                  ].join(" ")}
                  title={step.note}
                >
                  {step.nodeName}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-[8px] border border-white/10 bg-[#151516]/94 px-4 py-2 text-[12px] text-white shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function MiniStat({ label, value, valueClassName = "text-white/80" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</div>
      <div className={["mt-1 max-w-[120px] truncate text-[12px]", valueClassName].join(" ")}>{value}</div>
    </div>
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

function executionChipClass(status: ExecutionState) {
  if (status === "running") {
    return "border-sky-300/35 bg-sky-400/12 text-sky-100";
  }

  if (status === "success") {
    return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  }

  if (status === "skipped") {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }

  return "border-rose-300/35 bg-rose-400/12 text-rose-100";
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
