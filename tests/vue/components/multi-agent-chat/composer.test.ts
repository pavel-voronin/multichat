import { afterEach, describe, expect, it } from 'vitest';
import type { OpenRouterTransport } from '../../../../src/core';
import { mountChat, createRuntime, timelineMessages } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MultiAgentChat composer', () => {
  it('sends public message on enter', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Hello world');
    await textarea.trigger('keydown', { key: 'Enter' });

    expect(timelineMessages(runtime)[0]?.content).toBe('Hello world');
    expect(timelineMessages(runtime)[0]?.target).toBe('public');
  });

  it('double click participant inserts a mention prefix', async () => {
    const runtime = createRuntime();
    const wrapper = mountChat(runtime);

    await wrapper.findAll('.participant-row')[1].trigger('dblclick');

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'Alpha: ',
    );
  });

  it('double click appends participant names into the mention prefix without duplicates', async () => {
    const runtime = createRuntime();
    runtime.createAgent({
      name: 'Beta',
      modelId: 'model-b:free',
      systemPrompt: 'prompt',
      contextWindowSize: null,
      capabilities: { prefersTools: true, supportsToolUse: 'unknown' },
    });

    const wrapper = mountChat(runtime);

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Alpha: hello');
    await wrapper.findAll('.participant-row')[2].trigger('dblclick');
    await wrapper.findAll('.participant-row')[1].trigger('dblclick');

    expect((textarea.element as HTMLTextAreaElement).value).toBe(
      'Alpha, Beta: hello',
    );
  });

  it('inserts participant mention when double clicking message sender', async () => {
    const runtime = createRuntime();
    await runtime.sendMessage({
      senderId: 'human',
      content: 'Ping Alpha please',
      target: 'public',
      triggerSweep: false,
    });

    const wrapper = mountChat(runtime);

    const sender = wrapper.get('.message-sender');
    expect(sender.text()).toBe('<Human>');

    await sender.trigger('dblclick');

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'Human: ',
    );
  });

  it('renders an agent reply after sending a human message', async () => {
    const transport: OpenRouterTransport = {
      async listModels() {
        return [{ id: 'model-a:free', name: 'Model A Free' }];
      },
      async runAgentTurn() {
        return {
          mode: 'tools',
          action: { type: 'speak_public', text: 'Agent reply' },
        };
      },
    };
    const runtime = createRuntime({ transport });
    const wrapper = mountChat(runtime);

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Hello');
    await textarea.trigger('keydown', { key: 'Enter' });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Hello');
    expect(wrapper.text()).toContain('Agent reply');
  });
});
