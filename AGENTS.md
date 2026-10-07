# pi-typst

`pi-typst` is a Pi extension that renders Typst into terminal images.

## Concept

```mermaid
flowchart TD
  User["User prompt"] --> Agent["Assistant"]
  Agent -->|"Calls tool"| Tool["typst tool"]
  Tool -->|"typst compile"| CLI["typst CLI"]
  CLI -->|"PNG image"| Tool
  Tool -->|"Inline render"| Terminal["Terminal (Supported image display)"]
```

## Architecture & Principles

- **Official Extension Contract**: Integrate cleanly through Pi's custom tool mechanism rather than monkey-patching internal TUI rendering.
- **Rely on Local CLI**: Delegate rendering to the local `typst` CLI. Typst provides fast, standalone compilation with clear diagnostics.
- **Natural Agent Experience**: Do not impose proprietary syntax or complex protocols on the model. The agent writes standard Typst, using compiler diagnostics for self-correction.
- **Terminal-Friendly Presentation**: Respect modern terminal environments (predominantly dark backgrounds) by ensuring rendered outputs avoid harsh contrast glare.

## Development

- **Prerequisites**: Ensure the `typst` CLI is installed and available in `$PATH`.
- **Manual Testing**
    - `cd /tmp`
    -　`pi -e [directory of this AGENTS.md]`
- **Code Layout** (`src/`)
    - `index.ts`: Extension entry; registers the tool.
    - `tool.ts`: Tool definition and `execute` flow.
    - `input.ts`: Parameter schema, validation, and the document piped to typst (files are `#include`d so relative paths resolve from their directory).
    - `preamble.ts`: Default styling prepended to user content.
    - `typst-cli.ts`: `typst` process invocation.
    - `diagnostics.ts`: Maps compiler errors back to user lines.
    - `png.ts`, `layout.ts`: Image dimensions and terminal cell sizing.
    - `render.ts`: TUI components for tool call/result.
- **Tests**: `pnpm test`. `tests/typst.integration.test.ts` runs only when `typst` is in `$PATH`.
