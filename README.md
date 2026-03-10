# ai-release-radar-cli

Daily concise AI release briefing from official Tier-1 sources:
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

## Limitations

- Parsing is HTML-structure dependent; official pages may change markup.
- This MVP prioritizes resilience and concise summaries over deep semantic ranking.
- No persistent cache yet (live fetch each run).

## License

MIT

## Daily public output

- Latest output (repo): `daily/latest.md`
- Public page (GitHub Pages): enable **Settings → Pages → Source: GitHub Actions**
- Workflows:
  - `Daily Radar` updates output hourly
  - `Deploy Pages` publishes `site/index.html`
