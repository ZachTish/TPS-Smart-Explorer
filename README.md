# TPS Smart Explorer

Adds a second sidebar tab that mirrors Obsidian’s native File Explorer, with extra “smart” behaviors (rules for hiding/sorting/icons, plus convenience actions).

## Features

- Secondary “Explorer” view in the sidebar (a parallel file explorer).
- Rule-driven customization:
  - Icon rules (see `src/default-icon-rules.ts`)
  - Condition/operator helpers for building rules (see `src/rule-helpers.ts`)
  - Style profiles/categories (currently `sort` and `hide`)
- Convenience UX:
  - Delete confirmation modal that moves items to the system trash.
  - Extended filtering patterns to interpret common Bases-like filters (e.g., `file.path.startsWith("...")`).

## How It Works (Technical)

- `src/main.ts` registers a custom `ItemView` (a second explorer-like panel) and maintains plugin state/config.
- Rules and profiles are normalized at load time to keep settings resilient to schema drift.
- UI building uses Obsidian’s DOM helpers and modals (e.g., delete confirmation).

## Key Files

- `src/main.ts`: main implementation (currently large; intended to be broken into smaller modules over time).
- `src/rule-helpers.ts`: rule operator/placeholder helpers.
- `src/default-icon-rules.ts`: default icon mapping rules.
- `src/visual-builder.ts`: builder UI helpers (rule/profile editing).

## Development

- Install deps: `npm install`
- Dev build (watch): `npm run dev`
- Prod build: `npm run build`

## Development Guidelines

When making changes to this plugin, follow these priorities:

### 1. Code Cleanup
- Remove duplicate logic (confirm it's not needed first)
- Remove unused/dead code
- **Propose significant removals before executing** to avoid breaking functionality

### 2. Configuration
- Move hardcoded values to configurable options in settings
- Use constants files for magic numbers and strings

### 3. Modularity
- Keep files under 500 lines when possible
- Extract logic into services (e.g., `*-service.ts`)
- Place modals in a `modals/` directory
- Group related utilities in `utils/` or dedicated files
- Update build process (`esbuild.config.mjs`) as needed

### 4. Documentation
- Keep this README up-to-date with changes
- Document non-obvious design decisions
- Include examples for complex configurations

> **Note:** The `main.ts` file is currently ~9,400 lines. Modularization should be done incrementally to avoid breaking functionality.
