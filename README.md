# Daylog

Know where your 24 hours go. A personal nightly time-audit tool with nested activities.

This repo implements **Phase 1 complete (M1–M5)** of the design doc:
server API with full validation (rules V1–V6), the command-bar time parser,
analytics (leaf attribution, context switches, longest focus block), and the
laptop-first client — two-pane log screen with live parse preview, autocomplete,
SVG day-spine timeline, localStorage draft resilience, plus the review layer:
day review (category donut, switch count, longest focus block) and week view
(7-day skyline, stacked category bars, switch sparkline, recurring activities).

## Structure

```
daylog/
├── shared/            # types + the command-bar time parser (pure TS)
├── server/            # Fastify + PostgreSQL API
│   ├── migrations/    # SQL schema
│   ├── src/
│   │   ├── routes/    # auth, days, activities, categories, analytics, export
│   │   ├── services/  # validation (V1–V6), day tree assembly, analytics
│   │   └── plugins/   # JWT auth
│   └── test/          # 37 unit tests (vitest)
└── client/            # React + Vite SPA — command bar, day-spine timeline (M3)
```

## Getting started

```bash
# 1. Start Postgres
docker compose up -d

# 2. Configure & migrate
cd server
cp .env.example .env        # edit JWT_SECRET
npm install
npm run migrate

# 3. Run
npm run dev                  # API on http://localhost:3001

# 4. Test
npm test
```

## Quick API tour

```bash
# Register (seeds your 9 starter categories — all renamable, recolorable, deletable)
curl -s -X POST localhost:3001/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"longpassword"}'
# → { "token": "...", "user": {...} }   — export TOKEN=...

# Create today's draft day
curl -s -X POST localhost:3001/api/v1/days \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"log_date":"2026-06-11"}'

# Batch-commit a logging session (client_parent_index nests item under an earlier item)
curl -s -X POST localhost:3001/api/v1/days/<dayId>/activities/batch \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"items":[
        {"name":"Office","category_id":2,"start_min":540,"end_min":1080},
        {"name":"Sprint planning","category_id":2,"start_min":660,"end_min":780,"client_parent_index":0},
        {"name":"Scrolling","category_id":5,"start_min":900,"end_min":960,"client_parent_index":0}
      ]}'

# Day analytics — leaf-attributed breakdown, context switches, longest focus block
curl -s localhost:3001/api/v1/analytics/day/2026-06-11 -H "authorization: Bearer $TOKEN"
```

## The time parser (shared/timeParser.ts)

Pure function, no I/O — the client will call it on every keystroke for the live preview:

```ts
import { parseLine, splitOvernight } from './shared/timeParser.js';

parseLine('office 9-6');
// { nest:false, name:'office', startMin:540, endMin:1080, categoryTag:null, overnight:false }

parseLine('> scrolling 3-3:30 #dis', { parentRange: { startMin:540, endMin:1080 } });
// snapped into parent → { startMin:900, endMin:930, categoryTag:'dis' }

parseLine('sleep 11pm-7am');           // overnight:true
// splitOvernight(p) → [ {1380,1440}, {0,420} ]  — caller writes two activities on two days
```

## Design guarantees (enforced server-side, every write)

- V1 child within parent · V2/V3 no sibling overlap · V4 max depth 2
- V5 parent resize returns `409 CHILDREN_CONFLICT` with the conflicting child ids
- V6 categories scoped to the owning user
- Gaps are computed, never stored; every minute is attributed exactly once in analytics

## Running the client (M3)

```bash
cd client
npm install
npm run dev          # http://localhost:5173 — proxies /api to the server on :3001
```

The nightly ritual, keyboard-only:
`office 9-6` ⏎ · `> deep work 9-11 #deep` ⏎ · `> scrolling 3-3:30 #dis` ⏎ ·
`gym 6:30-7:30 #per` ⏎ · write one honest reflection line · `Ctrl+Enter` to finalize.
`Tab` accepts autocomplete · `↑↓` select an entry · `E` edit · `⌫` delete ·
`Ctrl+D` copies yesterday's top-level structure · overnight ranges
(`sleep 11pm-7am`) split at midnight and carry to tomorrow's draft automatically.

## Views

- **Tonight** — the nightly ritual: command bar, entry list, day spine. Finalize with Ctrl+Enter.
- **Review** — any past day, read-only: timeline, category donut, context switches,
  longest focus block, unaccounted time, your reflection note.
- **Week** — the skyline (click a day to open its review), where the hours went,
  context switches per day, and what keeps coming back.

## M5: Settings & the dogfood

The **Settings** tab has category management (rename/recolor/add/delete — deleting
a category that past days still use archives it, so those days keep its name and
color in reviews and analytics; archived categories can be restored), one-click
JSON export of everything,
and the dogfood scoreboard: each logging session is timed automatically from
your first committed entry to finalize, and Settings shows nights logged,
median session length against the 7-minute target, and a per-night strip.

Phase 1 exits on evidence, not features — see **DOGFOOD.md** for the 14-night
protocol and friction log.

## After Phase 1

Phase 2 (intent-vs-actual planning) gets built only if the dogfood validates
that nested nightly logging produces honest data at sustainable friction.
