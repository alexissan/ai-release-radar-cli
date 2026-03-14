# ai-release-radar-cli

Daily concise AI release briefing so you don’t have to live on X all day.

`ai-release-radar-cli` pulls from official Tier-1 sources and turns them into a short briefing:
- OpenAI News
- Anthropic News
- Google Gemini (Google official blog)

## Requirements

- Node.js 20+
- npm (or pnpm/yarn)

## Install

```bash
npm install
npm run build
npm link
```

After linking, the command is available globally as:

```bash
ai-radar today
```

## Usage

### Basic briefing

```bash
ai-radar today
```

### Compare short-term trend windows (default: 2 days)

```bash
ai-radar compare
```

### Compare with explicit window size

```bash
ai-radar compare --days 2
```

### Watch mode: continuous polling

Poll sources continuously and get notified of new updates:

```bash
ai-radar watch                    # Default: poll every 30 minutes
ai-radar watch --interval 15      # Poll every 15 minutes
```

Press `Ctrl+C` to exit watch mode gracefully.

### Generate a digest summary

View updates from the last N hours/days:

```bash
ai-radar digest                   # Default: last 24h
ai-radar digest --since 48h       # Last 48 hours
ai-radar digest --since 7d        # Last 7 days
ai-radar digest --output json     # JSON format
```

### Search cached updates

Search for keywords across all cached updates:

```bash
ai-radar search "GPT"
ai-radar search "Claude Sonnet"
```

### Check source health

Verify which sources are currently reachable:

```bash
ai-radar sources
```

This shows the health status of each source and the latest item from each.

## Output format

### `today`

1. Top updates (max 5 bullets)
2. Why it matters (founders/devs)
3. One practical action today

### `compare`

1. Number of updates by source (latest window vs previous window)
2. Top repeated keywords by window (basic frequency over titles)
3. One short "what changed" paragraph

## Fallback behavior

If one or more sources are unreachable or change layout:
- The CLI still returns a useful partial briefing from available sources.
- It prints a `Fallback status` section listing unreachable sources and errors.
- If all sources fail, it emits a graceful no-data briefing with manual next steps.

## Development

```bash
npm test
npm run lint
npm run build
```

## Example

```bash
ai-radar today
ai-radar compare --days 2
```

Example (truncated):

```text
AI Release Radar — Today

1) Top updates
- [OpenAI] ...
- [Anthropic] ...

2) Why it matters (founders/devs)
- ...

3) One practical action today
- ...
```

Compare example (truncated):

```text
AI Release Radar — Compare (2-day windows)

1) Updates by source
- OpenAI: latest 2 vs previous 2
- Anthropic: latest 2 vs previous 2
- Google Gemini: latest 2 vs previous 2

2) Top repeated keywords
- Latest: ...
- Previous: ...

3) What changed
- Across the latest window, total update volume is ...
```

## Cache and State

The CLI maintains a local cache in `~/.ai-radar/`:
- `cache.json`: Stores recent updates from all sources (last 100 polls)
- `state.json`: Tracks watch mode state (last poll time, seen URLs)

This enables:
- Fast searches across historical data
- Digest summaries spanning multiple time ranges
- Watch mode notification of only new updates

## Limitations

- Parsing is HTML-structure dependent; official pages may change markup.
- This MVP prioritizes resilience and concise summaries over deep semantic ranking.
- Cache persists locally only; not synced across machines.

## License

MIT

## Daily public output

- Latest output (repo): `daily/latest.md`
- Public page (GitHub Pages): enable **Settings → Pages → Source: GitHub Actions**
- Workflows:
  - `Daily Radar` updates output hourly
  - `Deploy Pages` publishes `site/index.html`
