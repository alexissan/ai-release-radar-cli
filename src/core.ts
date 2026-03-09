export type SourceName = 'OpenAI' | 'Anthropic' | 'Google Gemini';

export interface SourceConfig {
  name: SourceName;
  url: string;
}

export interface UpdateItem {
  source: SourceName;
  title: string;
  url: string;
}

export interface SourceFetchResult {
  source: SourceName;
  ok: boolean;
  items: UpdateItem[];
  error?: string;
}

export const SOURCES: SourceConfig[] = [
  { name: 'OpenAI', url: 'https://openai.com/news/' },
  { name: 'Anthropic', url: 'https://www.anthropic.com/news' },
  { name: 'Google Gemini', url: 'https://blog.google/products/gemini/' }
];

export function extractLinks(html: string, baseUrl: string, source: SourceName, limit = 4): UpdateItem[] {
  const links = Array.from(html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const seen = new Set<string>();
  const out: UpdateItem[] = [];

  for (const match of links) {
    const hrefRaw = match[1]?.trim();
    const inner = match[2] ?? '';
    const text = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;|&#8217;/gi, "'")
      .replace(/&#8211;|&#x2013;/gi, '–')
      .replace(/\s+/g, ' ')
      .trim();

    if (!hrefRaw || !text || text.length < 18) continue;
    if (/read more|learn more|view all|subscribe|cookie|privacy|skip to main content|download press kit/i.test(text)) continue;

    let href: string;
    try {
      href = new URL(hrefRaw, baseUrl).toString();
    } catch {
      continue;
    }

    if (!/^https?:\/\//.test(href)) continue;

    const u = new URL(href);
    const path = u.pathname.toLowerCase();
    const sourceRelevant =
      (source === 'OpenAI' && path.includes('/news')) ||
      (source === 'Anthropic' && path.includes('/news/')) ||
      (source === 'Google Gemini' && (path.includes('/products/gemini') || path.includes('/gemini')));
    if (!sourceRelevant) continue;

    const key = `${text.toLowerCase()}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ source, title: text, url: href });
    if (out.length >= limit) break;
  }

  return out;
}

export async function fetchWithTimeout(url: string, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ai-release-radar-cli/0.1.0 (+https://local-cli)'
      }
    });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchSource(source: SourceConfig): Promise<SourceFetchResult> {
  try {
    const res = await fetchWithTimeout(source.url);
    if (!res.ok) {
      return {
        source: source.name,
        ok: false,
        items: [],
        error: `HTTP ${res.status}`
      };
    }

    const html = await res.text();
    const items = extractLinks(html, source.url, source.name, 4);

    if (items.length === 0) {
      return {
        source: source.name,
        ok: false,
        items: [],
        error: 'No parsable updates found'
      };
    }

    return { source: source.name, ok: true, items };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { source: source.name, ok: false, items: [], error };
  }
}

export function pickTopUpdates(results: SourceFetchResult[], max = 5): UpdateItem[] {
  const merged = results.flatMap((r) => r.items);
  const seenTitle = new Set<string>();
  const out: UpdateItem[] = [];

  for (const item of merged) {
    const k = item.title.toLowerCase();
    if (seenTitle.has(k)) continue;
    seenTitle.add(k);
    out.push(item);
    if (out.length >= max) break;
  }

  return out;
}

export function buildTweet(updates: UpdateItem[]): string {
  const lead = updates.slice(0, 3).map((u) => `${u.source}: ${u.title}`).join(' | ');
  const text = `AI Release Radar: ${lead}`;
  if (text.length <= 259) return text;
  return `${text.slice(0, 256)}...`;
}

export function formatBriefing(results: SourceFetchResult[], includeTweet = false): string {
  const top = pickTopUpdates(results, 5);
  const reachable = results.filter((r) => r.ok).map((r) => r.source);
  const failed = results.filter((r) => !r.ok);

  const lines: string[] = [];
  lines.push('AI Release Radar — Today');
  lines.push('');
  lines.push('1) Top updates');

  if (top.length === 0) {
    lines.push('- No live updates could be parsed right now from Tier 1 sources.');
  } else {
    for (const item of top) {
      lines.push(`- [${item.source}] ${item.title} (${item.url})`);
    }
  }

  lines.push('');
  lines.push('2) Why it matters (founders/devs)');
  lines.push(
    top.length > 0
      ? '- Model/platform updates can change product quality, latency, and cost assumptions quickly. Re-check your roadmap and evaluation suite before shipping this week.'
      : '- Treat today as a signal to rely on resilient monitoring: provider pages can fail or change layout. Keep release tracking automated and human-reviewed.'
  );

  lines.push('');
  lines.push('3) One practical action today');
  lines.push(
    top.length > 0
      ? '- Pick the most relevant update above and run a 30-minute spike: test your core prompt/workflow against it, capture quality and cost deltas, and decide go/no-go.'
      : '- Open each official source URL directly, manually verify latest posts, and log one product-impacting takeaway in your team notes.'
  );

  if (failed.length > 0) {
    lines.push('');
    lines.push('Fallback status');
    for (const f of failed) {
      lines.push(`- ${f.source}: unavailable (${f.error ?? 'unknown error'})`);
    }
    lines.push(
      `- Recovered with ${reachable.length > 0 ? 'partial briefing from reachable sources' : 'graceful no-data briefing'}.`
    );
  }

  if (includeTweet) {
    lines.push('');
    lines.push('4) Optional X post draft');
    const tweet = top.length > 0
      ? buildTweet(top)
      : 'AI Release Radar: Tier-1 AI news pages were partially unreachable today. Worth checking OpenAI, Anthropic, and Google Gemini official pages directly.';
    lines.push(`- ${tweet}`);
  }

  return lines.join('\n');
}

export async function runToday(includeTweet = false): Promise<string> {
  const settled = await Promise.all(SOURCES.map((s) => fetchSource(s)));
  return formatBriefing(settled, includeTweet);
}
