import { describe, expect, it } from 'vitest';
import type { DebugLogEntry } from '../../../src/core';
import { formatDebugLogLine } from '../../../src/vue/utils/chatFormatting';

describe('chatFormatting utils', () => {
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
