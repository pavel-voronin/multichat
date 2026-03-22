import type {
  AgentConfig,
  AgentContextMessage,
  AgentExecutionMode,
  AgentTurnResult,
  ChatMessage,
  ChatTabState,
  OpenRouterTransport,
  SendMessageInput,
  WorkspaceState,
} from './types';
import {
  attachProducedMessageToTrace,
  completeRequestTrace,
  createRequestTrace,
  pushDebugLog,
  pushRuntimeError,
  pushRuntimeEvent,
} from './diagnostics';
import {
  applyDownstreamPromptCost,
  applyUsage,
  getPromptCostUsd,
} from './accounting';
import {
  getActiveAgents,
  getNonSelfVisibleMessageIds,
  getTriggeringMessageIds,
  getVisibleContextKey,
  getVisibleMessagesForAgent,
  hasNewVisibleInputForAgent,
  markVisibleContextProcessed,
} from './context-routing';
import { deepClone } from './utils';

export interface ExecutionContext {
  workspace: WorkspaceState;
  transport: OpenRouterTransport;
  abortControllers: Map<string, AbortController>;
  activeSweepPromises: Map<string, Promise<void>>;
  maxAutoSweeps: number;
  now: () => Date;
  createId: () => string;
  lastProcessedKeys: Map<string, Map<string, string>>;
  participantName: (participantId: string, tab: ChatTabState) => string;
  sendMessage: (input: SendMessageInput, tabId: string) => Promise<ChatMessage>;
  updateAgent: (
    agentId: string,
    patch: Partial<Omit<AgentConfig, 'id'>>,
    tabId: string,
  ) => AgentConfig;
  persistAndNotify: () => void;
}

function getTab(tabId: string, ctx: ExecutionContext): ChatTabState | undefined {
  return ctx.workspace.tabs.find((tab) => tab.id === tabId);
}

function lastProcessedKeysForTab(
  tabId: string,
  ctx: ExecutionContext,
): Map<string, string> {
  let keys = ctx.lastProcessedKeys.get(tabId);
  if (!keys) {
    keys = new Map<string, string>();
    ctx.lastProcessedKeys.set(tabId, keys);
  }
  return keys;
}

export async function handleSuccessfulAgentTurnResultFn({
  agent,
  result,
  traceId,
  tab,
  tabId,
  visibleMessages,
  fallback,
  ctx,
}: {
  agent: AgentConfig;
  result: AgentTurnResult;
  traceId: string;
  tab: ChatTabState;
  tabId: string;
  visibleMessages: AgentContextMessage[];
  fallback: boolean;
  ctx: ExecutionContext;
}): Promise<void> {
  markVisibleContextProcessed(
    agent.id,
    tab,
    lastProcessedKeysForTab(tab.id, ctx),
  );
  applyUsage(agent.id, result.usage, tab);
  applyDownstreamPromptCost(agent, visibleMessages, result.usage, tab);
  completeRequestTrace({
    now: ctx.now,
    traceId,
    tab,
    status: 'succeeded',
    usage: result.usage,
    action: result.action,
    promptCostUsd: getPromptCostUsd(agent, result.usage),
  });

  if (result.action.type === 'stay_silent') {
    const requestCostUsd = result.usage?.estimatedCost;
    const ownPromptCostUsd = getPromptCostUsd(agent, result.usage);
    pushRuntimeEvent({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      payload: {
        type: 'silent-decision',
        agentId: agent.id,
        details: result.action.reason,
        sourceTraceId: traceId,
        requestCostUsd,
        ownPromptCostUsd,
        costUsd: requestCostUsd,
      },
    });
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-result',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        mode: result.mode,
        fallback,
        actionType: result.action.type,
        details: result.action.reason,
      },
    });
    ctx.persistAndNotify();
    return;
  }

  const sentMessage = await ctx.sendMessage(
    {
      senderId: agent.id,
      content: result.action.text,
      target: result.action.type === 'speak_public' ? 'public' : 'private',
      recipientId:
        result.action.type === 'send_private' ? result.action.to : undefined,
      requestCostUsd: result.usage?.estimatedCost,
      ownPromptCostUsd: getPromptCostUsd(agent, result.usage),
      createdInSweep: tab.execution.sweepCount,
      sourceTraceId: traceId,
      triggerSweep: false,
    },
    tabId,
  );
  attachProducedMessageToTrace(traceId, sentMessage.id, tab);
  pushDebugLog({
    now: ctx.now,
    workspace: ctx.workspace,
    payload: {
      kind: 'turn-result',
      sweep: tab.execution.sweepCount,
      agentId: agent.id,
      agentName: agent.name,
      mode: result.mode,
      fallback,
      actionType: result.action.type,
      messageId: sentMessage.id,
      target: sentMessage.target,
      recipientId: sentMessage.recipientId,
      content: result.action.text,
    },
  });
  tab.execution.queuedSweep = true;
}

export async function runAgentTurnFn(
  agent: AgentConfig,
  tabId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const tab = getTab(tabId, ctx);
  if (!tab) return;

  if (tab.execution.stopRequested) {
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-skipped',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'stop_requested',
      },
    });
    return;
  }

  const processedKeys = lastProcessedKeysForTab(tab.id, ctx);
  const visibleMessages = getVisibleMessagesForAgent(
    agent.id,
    tab,
  );

  if (!hasNewVisibleInputForAgent(agent.id, tab, processedKeys)) {
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-skipped',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'no_new_input',
        visibleMessageIds: visibleMessages.map((m) => m.id),
        nonSelfVisibleMessageIds: getNonSelfVisibleMessageIds(agent.id, tab),
        contextKeyPrev: processedKeys.get(agent.id) ?? '',
        contextKeyNext: getVisibleContextKey(agent.id, tab),
      },
    });
    return;
  }

  const apiKey = ctx.workspace.settings.openRouterApiKey;
  if (!apiKey) {
    pushDebugLog({
      now: ctx.now,
      workspace: ctx.workspace,
      payload: {
        kind: 'turn-skipped',
        sweep: tab.execution.sweepCount,
        agentId: agent.id,
        agentName: agent.name,
        skipReason: 'no_api_key',
        visibleMessageIds: visibleMessages.map((m) => m.id),
        nonSelfVisibleMessageIds: getNonSelfVisibleMessageIds(agent.id, tab),
        contextKeyPrev: processedKeys.get(agent.id) ?? '',
        contextKeyNext: getVisibleContextKey(agent.id, tab),
      },
    });
    pushRuntimeError({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      workspace: ctx.workspace,
      participantName: ctx.participantName,
      payload: {
        agentId: agent.id,
        message: 'OpenRouter API key is missing',
      },
    });
    return;
  }

  const mode: AgentExecutionMode = 'tools';
  const abortController = new AbortController();
  ctx.abortControllers.set(tab.id, abortController);
  const previousContextKey = processedKeys.get(agent.id) ?? '';
  const nextContextKey = getVisibleContextKey(agent.id, tab);
  const nonSelfVisibleMessageIds = getNonSelfVisibleMessageIds(agent.id, tab);
  const triggeringMessageIds = getTriggeringMessageIds(
    previousContextKey,
    nonSelfVisibleMessageIds,
  );
  const trace = createRequestTrace({
    createId: ctx.createId,
    now: ctx.now,
    tab,
    agent,
    mode,
    fallback: false,
    parentTraceId: null,
    triggeringMessageIds,
    visibleMessageIds: visibleMessages.map((m) => m.id),
    nonSelfVisibleMessageIds,
  });
  pushDebugLog({
    now: ctx.now,
    workspace: ctx.workspace,
    payload: {
      kind: 'turn-requested',
      sweep: tab.execution.sweepCount,
      agentId: agent.id,
      agentName: agent.name,
      mode,
      fallback: false,
      visibleMessageIds: visibleMessages.map((m) => m.id),
      nonSelfVisibleMessageIds,
      triggeringMessageIds,
      contextKeyPrev: previousContextKey,
      contextKeyNext: nextContextKey,
    },
  });

  try {
    const result = await ctx.transport.runAgentTurn({
      apiKey,
      context: {
        agent,
        participants: deepClone(tab.participants),
        visibleMessages,
      },
      signal: abortController.signal,
    });

    await handleSuccessfulAgentTurnResultFn({
      agent,
      result,
      traceId: trace.id,
      tab,
      tabId,
      visibleMessages,
      fallback: false,
      ctx,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      completeRequestTrace({
        now: ctx.now,
        traceId: trace.id,
        tab,
        status: 'aborted',
        error: 'Agent request aborted',
        promptCostUsd: 0,
      });
      pushRuntimeEvent({
        createId: ctx.createId,
        now: ctx.now,
        tab,
        payload: {
          type: 'sweep-stopped',
          agentId: agent.id,
          details: 'Agent request aborted',
        },
      });
      pushDebugLog({
        now: ctx.now,
        workspace: ctx.workspace,
        payload: {
          kind: 'sweep-stopped',
          sweep: tab.execution.sweepCount,
          agentId: agent.id,
          agentName: agent.name,
          details: 'Agent request aborted',
        },
      });
      ctx.persistAndNotify();
      return;
    }

    const message =
      error instanceof Error ? error.message : 'Unknown agent runtime error';
    completeRequestTrace({
      now: ctx.now,
      traceId: trace.id,
      tab,
      status: 'failed',
      error: message,
      promptCostUsd: 0,
    });
    pushRuntimeError({
      createId: ctx.createId,
      now: ctx.now,
      tab,
      workspace: ctx.workspace,
      participantName: ctx.participantName,
      payload: {
        agentId: agent.id,
        message: 'Agent turn failed',
        details: message,
        sourceTraceId: trace.id,
      },
    });

    ctx.persistAndNotify();
  } finally {
    if (ctx.abortControllers.get(tab.id) === abortController) {
      ctx.abortControllers.delete(tab.id);
    }
  }
}

export async function runAgentSweepFn(
  trigger: string,
  tabId: string,
  ctx: ExecutionContext,
): Promise<void> {
  const tab = getTab(tabId, ctx);
  if (!tab) return;

  const activeSweepPromise = ctx.activeSweepPromises.get(tabId);
  if (activeSweepPromise) {
    if (!tab.execution.stopRequested) {
      tab.execution.queuedSweep = true;
    }
    ctx.persistAndNotify();
    await activeSweepPromise;
    return;
  }

  const sweepPromise = (async () => {
    if (trigger === 'manual') {
      ctx.lastProcessedKeys.get(tabId)?.clear();
    }

    let loops = 0;
    tab.execution.stopRequested = false;

    do {
      const currentTab = getTab(tabId, ctx);
      if (!currentTab || currentTab.execution.stopRequested) break;

      currentTab.execution.isSweepRunning = true;
      currentTab.execution.queuedSweep = false;
      currentTab.execution.sweepCount += 1;
      pushRuntimeEvent({
        createId: ctx.createId,
        now: ctx.now,
        tab: currentTab,
        payload: { type: 'sweep-started', details: trigger },
      });
      pushDebugLog({
        now: ctx.now,
        workspace: ctx.workspace,
        payload: {
          kind: 'sweep-started',
          sweep: currentTab.execution.sweepCount,
          trigger,
        },
      });
      ctx.persistAndNotify();

      for (const agent of getActiveAgents(currentTab)) {
        const latestTab = getTab(tabId, ctx);
        if (!latestTab || latestTab.execution.stopRequested) break;
        await runAgentTurnFn(agent, tabId, ctx);
      }

      const latestTab = getTab(tabId, ctx);
      if (!latestTab) break;

      latestTab.execution.isSweepRunning = false;
      pushRuntimeEvent({
        createId: ctx.createId,
        now: ctx.now,
        tab: latestTab,
        payload: { type: 'sweep-finished', details: trigger },
      });
      pushDebugLog({
        now: ctx.now,
        workspace: ctx.workspace,
        payload: {
          kind: 'sweep-finished',
          sweep: latestTab.execution.sweepCount,
          trigger,
        },
      });
      ctx.persistAndNotify();
      loops += 1;
    } while (
      getTab(tabId, ctx)?.execution.queuedSweep &&
      loops < ctx.maxAutoSweeps &&
      !getTab(tabId, ctx)?.execution.stopRequested
    );

    const finalTab = getTab(tabId, ctx);
    if (finalTab) {
      finalTab.execution.isSweepRunning = false;
      finalTab.execution.queuedSweep = false;
    }
    ctx.abortControllers.delete(tabId);
    ctx.persistAndNotify();
  })();

  ctx.activeSweepPromises.set(tabId, sweepPromise);
  try {
    await sweepPromise;
  } finally {
    if (ctx.activeSweepPromises.get(tabId) === sweepPromise) {
      ctx.activeSweepPromises.delete(tabId);
    }
  }
}
