import type {
  AgentExecutionMode,
  AgentTurnContext,
  AgentTurnResult,
  OpenRouterModel,
  OpenRouterTransport,
} from './types';
import {
  buildMessages,
  buildTools,
  parseJsonAction,
  parseToolAction,
} from './agentProtocol';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

async function callChatCompletion(
  apiKey: string,
  context: AgentTurnContext,
  mode: AgentExecutionMode,
  signal?: AbortSignal,
): Promise<AgentTurnResult> {
  const requestPayload = {
    model: context.agent.modelId,
    messages: buildMessages(context, mode),
    tools: mode === 'tools' ? buildTools() : undefined,
    tool_choice: mode === 'tools' ? 'required' : undefined,
    parallel_tool_calls: mode === 'tools' ? false : undefined,
    response_format: undefined,
  };
  let response: Response;

  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestPayload),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown transport error';
    throw new Error(errorMessage);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          function?: {
            name?: string;
            arguments?: string;
          };
        }>;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cost?: number;
    };
  };

  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenRouter returned no choices');
  }

  const action =
    mode === 'tools'
      ? parseToolAction(message.tool_calls?.[0] ?? {})
      : parseJsonAction(message.content ?? '{}');

  return {
    mode,
    action,
    usage: {
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      totalTokens: payload.usage?.total_tokens,
      estimatedCost: payload.usage?.cost,
      requestPayloadJson: requestPayload,
      responsePayloadJson: payload,
      transportMeta: {
        provider: 'openrouter',
        modelId: context.agent.modelId,
        executionMode: mode,
      },
    },
  };
}

export class OpenRouterHttpTransport implements OpenRouterTransport {
  async listModels(apiKey: string): Promise<OpenRouterModel[]> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenRouter models request failed: ${response.status} ${body}`,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        pricing?: {
          prompt?: string;
          completion?: string;
        };
      }>;
    };

    return (payload.data ?? []).map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      pricing: model.pricing,
    }));
  }

  async runAgentTurn(input: {
    apiKey: string;
    context: AgentTurnContext;
    mode: AgentExecutionMode;
    signal?: AbortSignal;
  }): Promise<AgentTurnResult> {
    return callChatCompletion(
      input.apiKey,
      input.context,
      input.mode,
      input.signal,
    );
  }
}
