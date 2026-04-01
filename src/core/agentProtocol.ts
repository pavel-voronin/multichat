import type { AgentConfig, AgentToolCall, AgentTurnContext } from './types';
import { formatMemoryForPrompt } from './agentMemory';

export function buildMessages(context: AgentTurnContext) {
  const selfParticipant = context.participants.find(
    (participant) => participant.id === context.agent.id,
  );
  const participantDirectory = context.participants
    .map(
      (participant) =>
        `- ${participant.id}: ${participant.name} (${participant.role})`,
    )
    .join('\n');

  const visibleHistory = context.visibleMessages.length
    ? context.visibleMessages
        .map((message) => {
          const sender = message.senderName;
          const recipient = message.recipientName ?? message.recipientId;
          const prefix =
            message.target === 'private'
              ? `[${message.createdAt}] <${sender} -> ${recipient}>`
              : `[${message.createdAt}] <${sender}>`;

          return `${prefix} ${message.content}`;
        })
        .join('\n')
    : 'No visible messages yet.';

  const memorySection =
    context.agent.memoryEnabled === true
      ? `\n\n${formatMemoryForPrompt(context.agent.memory ?? {})}`
      : '';

  const sharedInstructions = `${context.agent.systemPrompt}

You are inside a multi-agent chat experiment. Decide whether to speak.
Available participants:
${participantDirectory}

Identity:
- Your participant id is ${context.agent.id}.
- Your participant name is ${selfParticipant?.name ?? context.agent.name}.
- You are this participant and no one else.
- Never claim to be another participant.
- If asked who you are, answer using your own participant name and id.

Internal orchestration policy:
- First decide whether responding is necessary at all.
- Speak only if you add clear value, new information, coordination, correction, or a needed question.
- If another participant already covered the point, prefer silence.
- Prefer silence over weak, repetitive, or low-confidence replies.
- Stay on the current task. Do not introduce unrelated social chatter, invitations, or topic changes.
- Use public responses when the whole room benefits.
- Use private responses only for targeted coordination with one participant.
- Never send a private message to yourself.
- If the human asks you to reply "to me" or "in private", the private recipient should be the human participant, not yourself and not another agent unless explicitly named.
- If the latest visible message is a private message addressed to you from another participant, treat it as a direct private conversation with that sender.
- If another participant privately asks you to coordinate, choose, confirm, or align on an answer, prefer send_private back to that same participant instead of speaking publicly.
- If the human tells participants to coordinate with each other before answering, do not skip that coordination step. Use private messages to coordinate first, then answer publicly only when useful.
- Do not ignore a private coordination message and jump to an unrelated public reply.
- Treat an opening prefix like "Name: ..." or "Name1, Name2: ..." as explicit addressing.
- If the latest message explicitly addresses one or more participants and your own name is not included, you must stay_silent.
- If the latest message explicitly addresses one or more participants and your own name is included, you may respond if useful.
- If a message explicitly addresses another participant by name and that is not your name, stay_silent.
- If a message asks "who is X" or "who among you is X", only respond if X is your own participant name.
- If another participant already gave the direct answer that the user needed, prefer stay_silent instead of piling on.

Response contract:
- You may call any number of tools per turn.
- Call every tool needed to complete your turn.
- Public action: speak_public(text)
- Private action: send_private(to, text), where "to" is the participant id
- Silent action: stay_silent(reason) — if you also call any speaking tool, stay_silent is ignored by the runtime.
${context.agent.memoryEnabled === true ? `
- Memory tools: memory_add(content), memory_update(id, content), memory_delete(id)
- Use memory tools to store, update, or remove personal notes between turns.
- Memory operations may accompany any conversational action in the same turn.` : ''}
Visibility rules:
- Public messages are visible to everyone.
- Private messages are visible only to the sender, recipient, and the human observer.
- You only receive the subset of conversation that is visible to you.${memorySection}

Prefer concise responses.`;

  return [
    {
      role: 'system',
      content: sharedInstructions,
    },
    {
      role: 'user',
      content: `Visible conversation history:
${visibleHistory}`,
    },
  ];
}

export function buildTools(agent: AgentConfig) {
  const baseTools = [
    {
      type: 'function',
      function: {
        name: 'speak_public',
        description: 'Send a public message to the full chat.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_private',
        description: 'Send a private message to a single participant.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['to', 'text'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'stay_silent',
        description: 'Choose not to respond in this round.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
          required: ['reason'],
          additionalProperties: false,
        },
      },
    },
  ];
  if (agent.memoryEnabled !== true) return baseTools;
  return [
    ...baseTools,
    {
      type: 'function',
      function: {
        name: 'memory_add',
        description: 'Add a new entry to your personal memory. Pass empty content to skip.',
        parameters: {
          type: 'object',
          properties: { content: { type: 'string' } },
          required: ['content'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_update',
        description: 'Update an existing memory entry by id. Pass empty content to delete it.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            content: { type: 'string' },
          },
          required: ['id', 'content'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'memory_delete',
        description: 'Delete a memory entry by id.',
        parameters: {
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function parseToolAction(toolCall: {
  function?: {
    name?: string;
    arguments?: string;
  };
}): AgentToolCall {
  const name = toolCall.function?.name;
  const rawArguments = toolCall.function?.arguments ?? '{}';
  const args = JSON.parse(rawArguments) as Record<string, unknown>;

  if (name === 'speak_public' && typeof args.text === 'string') {
    return { type: 'speak_public', text: args.text };
  }

  if (
    name === 'send_private' &&
    typeof args.to === 'string' &&
    typeof args.text === 'string'
  ) {
    return { type: 'send_private', to: args.to, text: args.text };
  }

  if (name === 'stay_silent' && typeof args.reason === 'string') {
    return { type: 'stay_silent', reason: args.reason };
  }

  if (name === 'memory_add' && typeof args.content === 'string') {
    return { type: 'memory_add', content: args.content };
  }
  if (name === 'memory_update' && typeof args.id === 'number' && typeof args.content === 'string') {
    return { type: 'memory_update', id: args.id, content: args.content };
  }
  if (name === 'memory_delete' && typeof args.id === 'number') {
    return { type: 'memory_delete', id: args.id };
  }

  throw new Error('Invalid tool call payload');
}

export function parseToolActions(
  toolCalls: Array<{
    function?: {
      name?: string;
      arguments?: string;
    };
  }>,
): AgentToolCall[] {
  if (toolCalls.length === 0) {
    throw new Error('Empty tool_calls array');
  }

  const parsed = toolCalls.map((tc) => parseToolAction(tc));

  return parsed.filter((a) => a.type !== 'stay_silent');
}
