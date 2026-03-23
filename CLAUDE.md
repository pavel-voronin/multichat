# Project Rules

## Package Manager

Always use `npm`, never `pnpm` or `yarn`.

## Language

All code, variable names, comments, interfaces, types, and UI strings must be written in English. This does not affect the language used when communicating with the user in chat.

## Vue and TailwindCSS

When editing Vue single-file components, always keep blocks in this order: `template`, `script`, `style scoped`.

Use TailwindCSS through semantic classes only:

- Each element must have exactly one class, and that class must be semantic.
- Tailwind utility classes must be attached inside the semantic class with `@apply`.
- Writing plain CSS is forbidden.
- Applying Tailwind utility classes directly in the template is forbidden.
