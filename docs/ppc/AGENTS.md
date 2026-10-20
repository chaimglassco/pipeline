# Agent Guide

## Project objective

Maintain and extend the Glassco Back Office Library: an Amazon PPC knowledge base, local administration prototype, and structured document builder.

## Current product boundary

- The application is an unauthenticated local MVP.
- Browser storage is the only mutable persistence layer.
- There is no database, authentication, role system, API integration, or server-side authorization.
- Do not describe local administration as secure or synchronized.
- Preserve stable document IDs, slugs, topic IDs, and storage schemas.

## Required Next.js rule

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Important paths

- `src/app` — routing, metadata, layouts, boundaries, and global styles.
- `src/components` — application shell.
- `src/features/library/domain` — contracts and pure business rules.
- `src/features/library/data` — Markdown repository boundary.
- `src/features/library/state` — reading, document-admin, and category storage.
- `src/features/library/ui` — catalog, reader, builder, and admin components.
- `content/library` — repository-controlled starter documents.

## Development rules

- Keep server content loading separate from client interaction state.
- Validate all browser-storage input before using it.
- Preserve backward compatibility for optional content-element fields.
- Keep view-only controls separate from admin edit controls.
- Use semantic HTML and accessible names for icon-only controls.
- Tooltips must only appear when the associated topic title is truncated.
- Do not enable arbitrary raw HTML in Markdown.
- Do not introduce environment variables or hosted dependencies without documenting them.
- Update the product, architecture, progress, QA, deployment, and data-contract documents when behavior or persistence changes.

## Required checks

Run these before handing off a code change:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For UI changes, also verify the affected flow in the local browser at `/library` and check for hydration or console errors.

