import { describe, expect, it } from 'vitest';
import type { ChatMessage, DebugLogEntry, RuntimeEvent } from '../../../src/core';
import {
  formatDebugLogLine,
  formatMessageAuthor,
  formatTechnicalEventLabel,
  formatTechnicalEventText,
  technicalEventClasses,
} from '../../../src/vue/utils/chatFormatting';

const lookup = {
  byId(participantId: string) {
    const names: Record<string, string> = {
      human: 'Human',
      alpha: 'Alpha',
      beta: 'Beta',
    };
    return names[participantId] ?? null;
  },
};

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    senderId: 'human',
    target: 'public',
    content: 'hello',
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('chatFormatting utils', () => {
  it('formats public message author', () => {
    const message = createMessage({ senderId: 'alpha' });
    expect(formatMessageAuthor(message, lookup)).toBe('<Alpha>');
  });

  it('formats private message author with recipient', () => {
    const message = createMessage({
      senderId: 'alpha',
      target: 'private',
      recipientId: 'beta',
    });
    expect(formatMessageAuthor(message, lookup)).toBe('<Alpha -> Beta>');
  });

  it('formats technical event label with agent name', () => {
    const event: RuntimeEvent = {
      id: 'e-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      type: 'runtime-error',
      agentId: 'alpha',
    };
    expect(formatTechnicalEventLabel(event, lookup)).toBe('[error Alpha]');
  });

  it('formats technical event text and classes', () => {
    const event: RuntimeEvent = {
      id: 'e-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      type: 'silent-decision',
      details: 'not relevant',
    };
    expect(formatTechnicalEventText(event)).toBe('stayed silent: not relevant');
    expect(technicalEventClasses(event)).toBe(
      'runtime-line runtime-line-silent',
    );
  });

  it('formats debug logs with key metadata', () => {
    const entry: DebugLogEntry = {
      id: 'd-1',
      createdAt: '2026-01-01T10:00:00.000Z',
      kind: 'turn-result',
      sweep: 2,
      agentId: 'alpha',
      agentName: 'Alpha',
      messageId: 'm-1',
      details: 'ok',
    };

    const line = formatDebugLogLine(entry);
    expect(line).toContain('turn-result');
    expect(line).toContain('sweep=2');
    expect(line).toContain('agent=Alpha');
    expect(line).toContain('messageId=m-1');
    expect(line).toContain('details="ok"');
  });
});
