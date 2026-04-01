import type {
  AgentTurnContext,
  AgentTurnResult,
  OpenRouterModel,
  OpenRouterTransport,
} from './types';
import { buildMessages, buildTools, parseToolActions } from './agentProtocol';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const OPENROUTER_API_KEY_PATTERN =
  /^sk-or-v1-(?:[a-z0-9]+-)*[a-f0-9]{64}$/;

export function isOpenRouterApiKeyFormatValid(apiKey: string): boolean {
  return OPENROUTER_API_KEY_PATTERN.test(apiKey.trim());
}

async function callChatCompletion(
  apiKey: string,
  context: AgentTurnContext,
  signal?: AbortSignal,
): Promise<AgentTurnResult> {
  const requestPayload = {
    model: context.agent.modelId,
    messages: buildMessages(context),
    tools: buildTools(context.agent),
    tool_choice: 'required',
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

  const toolCalls = message.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    throw new Error('OpenRouter returned no tool calls');
  }

  const actions = parseToolActions(toolCalls);

  return {
    mode: 'tools',
    actions,
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
        executionMode: 'tools',
      },
    },
  };
}

export class OpenRouterHttpTransport implements OpenRouterTransport {
  async validateApiKey(apiKey: string): Promise<void> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenRouter key validation failed: ${response.status} ${body}`,
      );
    }
  }

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
        pricing?: { prompt?: string; completion?: string };
        context_length?: number;
        supported_parameters?: string[];
        architecture?: { modality?: string };
      }>;
    };

    return (payload.data ?? [])
      .filter((model) => {
        // Must support tools
        if (!(model.supported_parameters ?? []).includes('tools')) return false;
        // Output must include text
        const modality = model.architecture?.modality ?? '';
        const outputPart = modality.includes('->')
          ? modality.split('->')[1]
          : modality;
        if (outputPart && !outputPart.includes('text')) return false;
        return true;
      })
      .map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        pricing: model.pricing,
        context_length: model.context_length ?? 0,
        supported_parameters: model.supported_parameters ?? [],
      }));
  }

  async runAgentTurn(input: {
    apiKey: string;
    context: AgentTurnContext;
    signal?: AbortSignal;
  }): Promise<AgentTurnResult> {
    return callChatCompletion(input.apiKey, input.context, input.signal);
  }
}
