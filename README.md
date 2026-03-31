# multichat

Framework-agnostic multi-agent chat runtime with a Vue 3 UI shell.

This repository is organized as two explicit layers:

- `core`: a pure TypeScript runtime that owns the domain model, message routing, agent execution, OpenRouter integration, persistence, and runtime lifecycle
- `ui`: a Vue 3 renderer and thin adapter that subscribes to runtime state, sends user commands, and provides the chat interface

The project is intended to ship as a library with two entrypoints:

- a framework-agnostic core API
- embeddable Vue components and a demo/playground built on the same core

Version 1 keeps agent execution deterministic and sequential. Agents may produce any number of tool calls per turn — speaking publicly, sending private messages, or staying silent. When both speaking and silent actions are returned in one turn, silent calls are ignored. Tool calling is the primary response protocol, with JSON fallback reserved for models that do not support tools.
