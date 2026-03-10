import { describe, it, expect } from 'vitest';
import {
  buildCompareStats,
  buildWhatChanged,
  buildTweet,
  computeCompareWindows,
  extractLinks,
  formatBriefing,
  formatCompare,
  pickTopUpdates,
  type SourceFetchResult
} from '../src/core.js';

describe('extractLinks', () => {
  it('extracts absolute and relative links with clean title text', () => {
    const html = `
      <a href="/news/a">New model launch &amp; benchmarks</a>
      <a href="https://openai.com/news/b">Another major update from platform team</a>
    `;
    const items = extractLinks(html, 'https://openai.com/news/', 'OpenAI', 5);

    expect(items.length).toBe(2);
    expect(items[0].url).toBe('https://openai.com/news/a');
    expect(items[0].title).toContain('New model launch & benchmarks');
  });

  it('filters short/generic link texts', () => {
    const html = `
      <a href="/x">Read more</a>
      <a href="/y">Tiny</a>
      <a href="/news/z">Real production guidance for developers today</a>
    `;
    const items = extractLinks(html, 'https://www.anthropic.com/news', 'Anthropic', 5);
    expect(items.length).toBe(1);
    expect(items[0].title).toContain('Real production guidance');
  });
});

describe('pickTopUpdates', () => {
  it('deduplicates by title and enforces max count', () => {
    const results: SourceFetchResult[] = [
      {
        source: 'OpenAI', ok: true, items: [
          { source: 'OpenAI', title: 'Same title', url: 'https://a.com' },
          { source: 'OpenAI', title: 'Unique A', url: 'https://a2.com' }
        ]
      },
      {
        source: 'Anthropic', ok: true, items: [
          { source: 'Anthropic', title: 'Same title', url: 'https://b.com' },
          { source: 'Anthropic', title: 'Unique B', url: 'https://b2.com' }
        ]
      }
    ];

    const top = pickTopUpdates(results, 2);
    expect(top.length).toBe(2);
    expect(top.map((t) => t.title)).toEqual(['Same title', 'Unique A']);
  });
});

describe('buildTweet', () => {
  it('keeps tweet under 260 chars', () => {
    const long = 'x'.repeat(200);
    const tweet = buildTweet([
      { source: 'OpenAI', title: long, url: 'https://a.com' },
      { source: 'Anthropic', title: long, url: 'https://b.com' },
      { source: 'Google Gemini', title: long, url: 'https://c.com' }
    ]);

    expect(tweet.length).toBeLessThanOrEqual(259);
  });
});

describe('formatBriefing', () => {
  it('renders fallback status when one source fails', () => {
    const results: SourceFetchResult[] = [
      { source: 'OpenAI', ok: true, items: [{ source: 'OpenAI', title: 'Launch details for new API generation', url: 'https://openai.com/a' }] },
      { source: 'Anthropic', ok: false, items: [], error: 'HTTP 500' },
      { source: 'Google Gemini', ok: true, items: [{ source: 'Google Gemini', title: 'Gemini roadmap update for app builders', url: 'https://blog.google/b' }] }
    ];

    const output = formatBriefing(results, true);
    expect(output).toContain('Fallback status');
    expect(output).toContain('Anthropic: unavailable (HTTP 500)');
    expect(output).toContain('4) Optional X post draft');
  });

  it('renders graceful no-data briefing when all sources fail', () => {
    const results: SourceFetchResult[] = [
      { source: 'OpenAI', ok: false, items: [], error: 'timeout' },
      { source: 'Anthropic', ok: false, items: [], error: 'timeout' },
      { source: 'Google Gemini', ok: false, items: [], error: 'timeout' }
    ];

    const output = formatBriefing(results, false);
    expect(output).toContain('No live updates could be parsed right now');
    expect(output).toContain('graceful no-data briefing');
  });
});

describe('compare mode', () => {
  const seeded: SourceFetchResult[] = [
    {
      source: 'OpenAI',
      ok: true,
      items: [
        { source: 'OpenAI', title: 'Reasoning API improvements for enterprise apps', url: 'https://openai.com/news/1' },
        { source: 'OpenAI', title: 'Realtime voice stack now faster for agents', url: 'https://openai.com/news/2' },
        { source: 'OpenAI', title: 'Fine tuning guide for coding workflows', url: 'https://openai.com/news/3' },
        { source: 'OpenAI', title: 'Safety evaluations expanded for frontier models', url: 'https://openai.com/news/4' }
      ]
    },
    {
      source: 'Anthropic',
      ok: true,
      items: [
        { source: 'Anthropic', title: 'Claude enterprise controls and admin policy', url: 'https://anthropic.com/news/1' },
        { source: 'Anthropic', title: 'Long context reliability updates for production', url: 'https://anthropic.com/news/2' },
        { source: 'Anthropic', title: 'Tool use benchmark results and eval methods', url: 'https://anthropic.com/news/3' },
        { source: 'Anthropic', title: 'Responsible scaling policy progress update', url: 'https://anthropic.com/news/4' }
      ]
    },
    {
      source: 'Google Gemini',
      ok: true,
      items: [
        { source: 'Google Gemini', title: 'Gemini app adds memory and deeper search', url: 'https://google.com/gemini/1' },
        { source: 'Google Gemini', title: 'Gemini models on-device improvements for Android', url: 'https://google.com/gemini/2' },
        { source: 'Google Gemini', title: 'Gemini developer API pricing update', url: 'https://google.com/gemini/3' },
        { source: 'Google Gemini', title: 'Gemini code assist expands in workspace', url: 'https://google.com/gemini/4' }
      ]
    }
  ];

  it('splits latest and previous windows by days', () => {
    const { latest, previous } = computeCompareWindows(seeded, 2);
    expect(latest.length).toBe(6);
    expect(previous.length).toBe(6);
    expect(latest[0].title).toContain('Reasoning API improvements');
    expect(previous[0].title).toContain('Fine tuning guide');
  });

  it('builds stats with source counts and keyword frequencies', () => {
    const { latest } = computeCompareWindows(seeded, 2);
    const stats = buildCompareStats(latest);
    expect(stats.countsBySource.OpenAI).toBe(2);
    expect(stats.countsBySource.Anthropic).toBe(2);
    expect(stats.topKeywords.length).toBeGreaterThan(0);
  });

  it('builds a one-paragraph what-changed summary', () => {
    const latest = buildCompareStats([
      { source: 'OpenAI', title: 'Realtime agents toolkit upgrade', url: 'https://a' },
      { source: 'OpenAI', title: 'Realtime speech tuning for assistants', url: 'https://b' }
    ]);
    const previous = buildCompareStats([
      { source: 'OpenAI', title: 'Fine tuning guide for batch jobs', url: 'https://c' }
    ]);

    const paragraph = buildWhatChanged(latest, previous);
    expect(paragraph).toContain('latest window');
    expect(paragraph).toContain('Headline focus');
  });

  it('formats compare output with sections and keyword lines', () => {
    const output = formatCompare(seeded, 2);
    expect(output).toContain('AI Release Radar — Compare (2-day windows)');
    expect(output).toContain('1) Updates by source');
    expect(output).toContain('2) Top repeated keywords');
    expect(output).toContain('3) What changed');
    expect(output).toContain('Latest:');
    expect(output).toContain('Previous:');
  });
});
