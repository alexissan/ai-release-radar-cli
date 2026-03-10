export type SourceName = 'OpenAI' | 'Anthropic' | 'Google Gemini';

export interface SourceConfig {
  name: SourceName;
  url: string;
  engineeringUrls?: string[];
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

export interface CompareStats {
  countsBySource: Record<SourceName, number>;
  topKeywords: Array<{ keyword: string; count: number }>;
}

export const SOURCES: SourceConfig[] = [
  {
    name: 'OpenAI',
    url: 'https://openai.com/sitemap.xml',
    engineeringUrls: [
      'https://github.com/openai/openai-node/releases.atom',
      'https://github.com/openai/openai-python/releases.atom'
    ]
  },
  {
    name: 'Anthropic',
    url: 'https://www.anthropic.com/news',
    engineeringUrls: [
      'https://www.anthropic.com/engineering',
      'https://docs.anthropic.com/en/release-notes/api'
    ]
  },
  { name: 'Google Gemini', url: 'https://blog.google/products/gemini/' }
];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'your', 'this', 'that', 'new', 'more', 'about', 'after', 'over',
  'under', 'have', 'has', 'are', 'will', 'today', 'launch', 'update', 'updates', 'openai', 'anthropic', 'gemini',
  'google', 'model', 'models', 'product', 'products', 'release', 'releases', 'news', 'their', 'they', 'you', 'our'
]);

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
      (source === 'OpenAI' && (path.includes('/news') || path.includes('/index/'))) ||
      (source === 'Anthropic' && (
        path.includes('/news/') ||
        path.includes('/engineering') ||
        (u.hostname.includes('docs.anthropic.com') && path.includes('/release-notes'))
      )) ||
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
        'User-Agent': 'Mozilla/5.0 (compatible; ai-release-radar-cli/0.1.0)'
      }
    });
  } finally {
    clearTimeout(id);
  }
}

function slugToTitle(pathname: string): string {
  const slug = pathname.split('/').filter(Boolean).pop() ?? '';
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function extractOpenAiFromSitemap(xml: string, limit = 4): UpdateItem[] {
  const out: UpdateItem[] = [];
  const seen = new Set<string>();
  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);

  for (const loc of locs) {
    try {
      const u = new URL(loc);
      if (!u.pathname.startsWith('/index/')) continue;
      if (u.pathname === '/index/' || u.pathname === '/index.xml') continue;
      const key = u.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ source: 'OpenAI', title: slugToTitle(u.pathname), url: u.toString() });
      if (out.length >= limit) break;
    } catch {
      continue;
    }
  }

  return out;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function summarizeAtomContent(raw: string): string {
  const decoded = decodeEntities(
    raw
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const clean = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  return sentence.length > 110 ? `${sentence.slice(0, 107)}…` : sentence;
}

function extractFromAtom(xml: string, source: SourceName, limit = 3): UpdateItem[] {
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g));
  const out: UpdateItem[] = [];

  for (const e of entries) {
    const block = e[1];
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const baseTitle = decodeEntities(rawTitle.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/\s+/g, ' ').trim());
    const href = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '';
    const rawContent = block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ?? '';
    const summary = summarizeAtomContent(rawContent);

    if (!baseTitle || !href) continue;

    const releaseStyle = /^v?\d+\.\d+(\.\d+)?/.test(baseTitle);
    const enrichedTitle = releaseStyle
      ? `${baseTitle} — ${summary || 'SDK release notes update'}`
      : (summary && !baseTitle.toLowerCase().includes(summary.toLowerCase())
          ? `${baseTitle} — ${summary}`
          : baseTitle);

    out.push({ source, title: enrichedTitle, url: href });
    if (out.length >= limit) break;
  }

  return out;
}

function dedupeItems(items: UpdateItem[], limit: number): UpdateItem[] {
  const seen = new Set<string>();
  const out: UpdateItem[] = [];
  for (const it of items) {
    const key = `${it.title.toLowerCase()}|${it.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

export async function fetchSource(source: SourceConfig, limit = 4): Promise<SourceFetchResult> {
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

    const body = await res.text();
    let items = source.name === 'OpenAI'
      ? extractOpenAiFromSitemap(body, Math.max(limit, 3))
      : extractLinks(body, source.url, source.name, Math.max(limit, 3));

    if (source.engineeringUrls && source.engineeringUrls.length > 0) {
      for (const extraUrl of source.engineeringUrls) {
        try {
          const extraRes = await fetchWithTimeout(extraUrl);
          if (!extraRes.ok) continue;
          const extraBody = await extraRes.text();
          if (extraUrl.endsWith('.atom')) {
            items = items.concat(extractFromAtom(extraBody, source.name, 2));
          } else {
            items = items.concat(extractLinks(extraBody, extraUrl, source.name, 2));
          }
        } catch {
          // ignore extra-source failures; primary source remains authoritative.
        }
      }
    }

    items = dedupeItems(items, limit);

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
  const perSourceCap = 2;
  const bySource = new Map<SourceName, UpdateItem[]>();
  for (const r of results) bySource.set(r.source, [...r.items]);

  const sourceOrder: SourceName[] = ['OpenAI', 'Anthropic', 'Google Gemini'];
  const usedPerSource: Record<SourceName, number> = { OpenAI: 0, Anthropic: 0, 'Google Gemini': 0 };
  const seen = new Set<string>();
  const out: UpdateItem[] = [];

  let added = true;
  while (out.length < max && added) {
    added = false;
    for (const src of sourceOrder) {
      if (usedPerSource[src] >= perSourceCap) continue;
      const queue = bySource.get(src) ?? [];
      while (queue.length > 0) {
        const candidate = queue.shift()!;
        const key = candidate.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(candidate);
        usedPerSource[src] += 1;
        added = true;
        break;
      }
      bySource.set(src, queue);
      if (out.length >= max) break;
    }
  }

  return out;
}

export function buildTweet(updates: UpdateItem[]): string {
  const lead = updates.slice(0, 3).map((u) => `${u.source}: ${u.title}`).join(' | ');
  const text = `AI Release Radar: ${lead}`;
  if (text.length <= 259) return text;
  return `${text.slice(0, 256)}...`;
}

function countBySource(items: UpdateItem[]): Record<SourceName, number> {
  return {
    OpenAI: items.filter((i) => i.source === 'OpenAI').length,
    Anthropic: items.filter((i) => i.source === 'Anthropic').length,
    'Google Gemini': items.filter((i) => i.source === 'Google Gemini').length
  };
}

function tokenizeTitles(items: UpdateItem[]): string[] {
  return items
    .flatMap((i) => i.title.toLowerCase().split(/[^a-z0-9]+/g))
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

function getTopKeywords(items: UpdateItem[], max = 5): Array<{ keyword: string; count: number }> {
  const freq = new Map<string, number>();
  for (const token of tokenizeTitles(items)) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([keyword, count]) => ({ keyword, count }));
}

export function computeCompareWindows(results: SourceFetchResult[], days: number): { latest: UpdateItem[]; previous: UpdateItem[] } {
  const windowSize = Math.max(1, days);
  const latest: UpdateItem[] = [];
  const previous: UpdateItem[] = [];

  for (const result of results) {
    latest.push(...result.items.slice(0, windowSize));
    previous.push(...result.items.slice(windowSize, windowSize * 2));
  }

  return { latest, previous };
}

export function buildCompareStats(items: UpdateItem[]): CompareStats {
  return {
    countsBySource: countBySource(items),
    topKeywords: getTopKeywords(items)
  };
}

export function buildWhatChanged(latest: CompareStats, previous: CompareStats): string {
  const totalLatest = Object.values(latest.countsBySource).reduce((a, b) => a + b, 0);
  const totalPrevious = Object.values(previous.countsBySource).reduce((a, b) => a + b, 0);
  const delta = totalLatest - totalPrevious;
  const deltaWord = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : 'flat';

  const sourceDeltas = (Object.keys(latest.countsBySource) as SourceName[])
    .map((s) => ({ source: s, delta: latest.countsBySource[s] - previous.countsBySource[s] }))
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const sourcePart = sourceDeltas.length > 0
    ? `${sourceDeltas[0].source} moved most (${sourceDeltas[0].delta > 0 ? '+' : ''}${sourceDeltas[0].delta}).`
    : 'Source mix stayed balanced.';

  const latestTop = latest.topKeywords[0]?.keyword;
  const prevTop = previous.topKeywords[0]?.keyword;
  const keywordPart = latestTop && latestTop !== prevTop
    ? `Headline focus shifted toward “${latestTop}” (previously “${prevTop ?? 'none'}”).`
    : latestTop
      ? `Headline focus stayed around “${latestTop}.”`
      : 'Not enough signal in titles yet.';

  return `Across the latest window, total update volume is ${deltaWord} versus the previous window. ${sourcePart} ${keywordPart}`;
}

export function formatCompare(results: SourceFetchResult[], days = 2): string {
  const { latest, previous } = computeCompareWindows(results, days);
  const latestStats = buildCompareStats(latest);
  const previousStats = buildCompareStats(previous);

  const lines: string[] = [];
  lines.push(`AI Release Radar — Compare (${days}-day windows)`);
  lines.push('');
  lines.push('1) Updates by source');
  for (const source of ['OpenAI', 'Anthropic', 'Google Gemini'] as SourceName[]) {
    lines.push(`- ${source}: latest ${latestStats.countsBySource[source]} vs previous ${previousStats.countsBySource[source]}`);
  }

  lines.push('');
  lines.push('2) Top repeated keywords');
  const latestKw = latestStats.topKeywords.length > 0
    ? latestStats.topKeywords.map((k) => `${k.keyword} (${k.count})`).join(', ')
    : 'none';
  const prevKw = previousStats.topKeywords.length > 0
    ? previousStats.topKeywords.map((k) => `${k.keyword} (${k.count})`).join(', ')
    : 'none';
  lines.push(`- Latest: ${latestKw}`);
  lines.push(`- Previous: ${prevKw}`);

  lines.push('');
  lines.push('3) What changed');
  lines.push(`- ${buildWhatChanged(latestStats, previousStats)}`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    lines.push('');
    lines.push('Fallback status');
    for (const f of failed) {
      lines.push(`- ${f.source}: unavailable (${f.error ?? 'unknown error'})`);
    }
  }

  return lines.join('\n');
}

export function formatBriefing(results: SourceFetchResult[]): string {
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

  return lines.join('\n');
}

export async function runToday(): Promise<string> {
  const settled = await Promise.all(SOURCES.map((s) => fetchSource(s)));
  return formatBriefing(settled);
}

export async function runCompare(days = 2): Promise<string> {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 2;
  const perSourceLimit = Math.max(4, safeDays * 2);
  const settled = await Promise.all(SOURCES.map((s) => fetchSource(s, perSourceLimit)));
  return formatCompare(settled, safeDays);
}
