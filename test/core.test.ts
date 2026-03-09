import { describe, it, expect } from 'vitest';
import { buildTweet, extractLinks, formatBriefing, pickTopUpdates, type SourceFetchResult } from '../src/core.js';

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
