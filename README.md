# multichat

Framework-agnostic multi-agent chat runtime with a Vue 3 UI shell.

This repository is organized as two explicit layers:

- `core`: a pure TypeScript runtime that owns the domain model, message routing, agent execution, OpenRouter integration, persistence, and runtime lifecycle
- `ui`: a Vue 3 renderer and thin adapter that subscribes to runtime state, sends user commands, and provides the chat interface

The project is intended to ship as a library with two entrypoints:

- a framework-agnostic core API
- embeddable Vue components and a demo/playground built on the same core

Version 1 keeps agent execution deterministic and sequential. Agents decide whether to speak, send a private message, or stay silent. Tool calling is the primary response protocol, with JSON fallback reserved for models that do not support tools.
