# Daylog client

React + Vite. Two panes: command bar + entry list | SVG day-spine timeline.

- `src/components/CommandBar.tsx` — §5 grammar, live parse preview, autocomplete
- `src/components/Timeline.tsx` — the day spine: parents full-width, children inset, unaccounted hatched
- `src/hooks/useDraft.ts` — localStorage draft mirror + overnight carry
- Theme tokens in `src/styles.css` — warm ink, lamp amber, mono time

`npm run dev` (expects the API on :3001) · `npm run build`
