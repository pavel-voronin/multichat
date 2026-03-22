import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterHttpTransport } from '../../src/core/openrouter';
import type { AgentTurnContext } from '../../src/core/types';

describe('OpenRouterHttpTransport.listModels', () => {
  function makeModel(overrides: {
    id?: string;
    supportedParameters?: string[];
    modality?: string;
    contextLength?: number;
  }) {
    return {
      id: overrides.id ?? 'provider/model',
      name: 'Model Name',
      pricing: { prompt: '0.000001', completion: '0.000002' },
      context_length: overrides.contextLength ?? 128000,
      supported_parameters: overrides.supportedParameters ?? ['tools'],
      architecture: { modality: overrides.modality ?? 'text->text' },
    };
  }

  function stubListModels(models: ReturnType<typeof makeModel>[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: models }),
      })),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns context_length and supported_parameters', async () => {
    stubListModels([makeModel({ contextLength: 200000 })]);
    const transport = new OpenRouterHttpTransport();
    const result = await transport.listModels('key');
    expect(result[0]?.context_length).toBe(200000);
    expect(result[0]?.supported_parameters).toEqual(['tools']);
  });

  it('filters out models without tools in supported_parameters', async () => {
    stubListModels([
      makeModel({ id: 'a/with-tools', supportedParameters: ['tools'] }),
      makeModel({ id: 'a/no-tools', supportedParameters: [] }),
      makeModel({ id: 'a/tools-and-more', supportedParameters: ['tools', 'response_format'] }),
    ]);
    const transport = new OpenRouterHttpTransport();
    const result = await transport.listModels('key');
    expect(result.map((m) => m.id)).toEqual(['a/with-tools', 'a/tools-and-more']);
  });

  it('filters out models with non-text output modality', async () => {
    stubListModels([
      makeModel({ id: 'a/text-model', modality: 'text->text' }),
      makeModel({ id: 'a/image-model', modality: 'text->image' }),
      makeModel({ id: 'a/multimodal', modality: 'text+image->text' }),
    ]);
    const transport = new OpenRouterHttpTransport();
    const result = await transport.listModels('key');
    expect(result.map((m) => m.id)).toEqual(['a/text-model', 'a/multimodal']);
  });
});

describe('OpenRouterHttpTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('instructs agents to answer private coordination privately', async () => {
    const fetchMock = vi.fn(
      async (_input: string, _init?: RequestInit) =>
        ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      function: {
                        name: 'stay_silent',
                        arguments: JSON.stringify({
                          reason: 'prompt inspected',
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const transport = new OpenRouterHttpTransport();
    const context: AgentTurnContext = {
      agent: {
        id: 'masha',
        name: 'Masha',
        modelId: 'test-model',
        systemPrompt: 'You are concise.',
      },
      participants: [
        { id: 'human', name: 'Pavel', role: 'human' },
        { id: 'kiryuha', name: 'Kiryuha', role: 'agent' },
        { id: 'masha', name: 'Masha', role: 'agent' },
      ],
      visibleMessages: [
        {
          id: 'm-1',
          authorType: 'participant',
          senderId: 'human',
          senderName: 'Pavel',
          target: 'public',
          content:
            'Coordinate with each other and pick a color without me seeing it.',
          createdAt: '2026-03-17T00:13:29.000Z',
        },
        {
          id: 'm-2',
          authorType: 'participant',
          senderId: 'kiryuha',
          senderName: 'Kiryuha',
          target: 'private',
          recipientId: 'masha',
          recipientName: 'Masha',
          content: 'I choose red. Should we tell Pavel red?',
          createdAt: '2026-03-17T00:13:33.000Z',
        },
      ],
    };

    await transport.runAgentTurn({
      apiKey: 'test-key',
      context,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.body).toBeDefined();
    const body = JSON.parse(String(init!.body)) as {
      messages: Array<{ role: string; content: string }>;
    };

    const prompt = body.messages.map((message) => message.content).join('\n');

    expect(prompt).toContain(
      'If another participant privately asks you to coordinate, choose, confirm, or align on an answer, prefer send_private back to that same participant instead of speaking publicly.',
    );
    expect(prompt).toContain(
      'If the human tells participants to coordinate with each other before answering, do not skip that coordination step. Use private messages to coordinate first, then answer publicly only when useful.',
    );
    expect(prompt).toContain(
      '[2026-03-17T00:13:33.000Z] <Kiryuha -> Masha> I choose red. Should we tell Pavel red?',
    );
  });
});
