import { SOURCES, fetchSource, type SourceFetchResult, type UpdateItem, type SourceName } from './core.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE_DIR = join(homedir(), '.ai-radar');
const CACHE_FILE = join(CACHE_DIR, 'cache.json');
const STATE_FILE = join(CACHE_DIR, 'state.json');

interface CacheEntry {
  timestamp: number;
  items: UpdateItem[];
}

interface WatchState {
  lastPollTimestamp: number;
  seenUrls: Set<string>;
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // ignore if exists
  }
}

/**
 * Load cached items
 */
async function loadCache(): Promise<CacheEntry[]> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Save cached items
 */
async function saveCache(entries: CacheEntry[]): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(CACHE_FILE, JSON.stringify(entries, null, 2));
}

/**
 * Load watch state
 */
async function loadWatchState(): Promise<WatchState> {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      lastPollTimestamp: parsed.lastPollTimestamp || 0,
      seenUrls: new Set(parsed.seenUrls || [])
    };
  } catch {
    return {
      lastPollTimestamp: 0,
      seenUrls: new Set()
    };
  }
}

/**
 * Save watch state
 */
async function saveWatchState(state: WatchState): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(STATE_FILE, JSON.stringify({
    lastPollTimestamp: state.lastPollTimestamp,
    seenUrls: [...state.seenUrls]
  }, null, 2));
}

/**
 * Fetch all sources and cache results
 */
async function fetchAndCache(): Promise<UpdateItem[]> {
  const settled = await Promise.all(SOURCES.map((s) => fetchSource(s)));
  const allItems = settled.filter(r => r.ok).flatMap(r => r.items);
  
  const cache = await loadCache();
  cache.unshift({
    timestamp: Date.now(),
    items: allItems
  });
  
  // Keep last 100 entries
  if (cache.length > 100) {
    cache.splice(100);
  }
  
  await saveCache(cache);
  return allItems;
}

/**
 * Watch mode: poll sources at intervals
 */
export async function runWatch(intervalMinutes: number): Promise<void> {
  console.log(`🔍 AI Radar Watch Mode (polling every ${intervalMinutes} minutes)`);
  console.log('Press Ctrl+C to exit\n');

  let running = true;
  
  const handleExit = () => {
    console.log('\n👋 Stopping watch mode...');
    running = false;
    process.exit(0);
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  const poll = async () => {
    const state = await loadWatchState();
    const now = Date.now();
    const timestamp = new Date(now).toLocaleString();

    console.log(`[${timestamp}] Polling sources...`);
    
    try {
      const items = await fetchAndCache();
      const newItems = items.filter(item => !state.seenUrls.has(item.url));

      if (newItems.length === 0) {
        console.log('✓ No new releases since last check\n');
      } else {
        console.log(`✨ Found ${newItems.length} new update(s):\n`);
        for (const item of newItems) {
          console.log(`  [${item.source}] ${item.title}`);
          console.log(`  ${item.url}\n`);
          state.seenUrls.add(item.url);
        }
      }

      state.lastPollTimestamp = now;
      await saveWatchState(state);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error polling sources: ${msg}\n`);
    }
  };

  // Initial poll
  await poll();

  // Set up interval
  const intervalMs = intervalMinutes * 60 * 1000;
  while (running) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    if (running) {
      await poll();
    }
  }
}

/**
 * Generate a daily digest
 */
export async function runDigest(opts: { since: string; json: boolean }): Promise<string> {
  const cache = await loadCache();
  
  // Parse since flag
  const sinceMs = parseSinceDuration(opts.since);
  const cutoff = Date.now() - sinceMs;
  
  // Filter entries within time range
  const relevantItems: UpdateItem[] = [];
  for (const entry of cache) {
    if (entry.timestamp >= cutoff) {
      relevantItems.push(...entry.items);
    }
  }

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueItems: UpdateItem[] = [];
  for (const item of relevantItems) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueItems.push(item);
    }
  }

  if (opts.json) {
    return JSON.stringify({
      period: opts.since,
      count: uniqueItems.length,
      items: uniqueItems
    }, null, 2);
  }

  // Text format grouped by source
  const lines: string[] = [];
  lines.push(`AI Release Radar — Digest (last ${opts.since})`);
  lines.push('');

  if (uniqueItems.length === 0) {
    lines.push('No updates found in this time period.');
    return lines.join('\n');
  }

  const bySource: Record<SourceName, UpdateItem[]> = {
    'OpenAI': [],
    'Anthropic': [],
    'Google Gemini': []
  };

  for (const item of uniqueItems) {
    bySource[item.source].push(item);
  }

  for (const source of ['OpenAI', 'Anthropic', 'Google Gemini'] as SourceName[]) {
    const items = bySource[source];
    if (items.length === 0) continue;

    lines.push(`## ${source} (${items.length})`);
    for (const item of items) {
      lines.push(`  • ${item.title}`);
    }
    lines.push('');
  }

  lines.push(`Total: ${uniqueItems.length} update(s)`);

  return lines.join('\n');
}

/**
 * Parse since duration string
 */
function parseSinceDuration(since: string): number {
  const match = since.match(/^(\d+)(h|d)$/);
  if (!match) {
    // Default to 24h
    return 24 * 60 * 60 * 1000;
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'h') {
    return value * 60 * 60 * 1000;
  } else {
    return value * 24 * 60 * 60 * 1000;
  }
}

/**
 * Search cached items
 */
export async function runSearch(query: string): Promise<string> {
  const cache = await loadCache();
  
  // Get all cached items
  const allItems: UpdateItem[] = [];
  const seenUrls = new Set<string>();
  
  for (const entry of cache) {
    for (const item of entry.items) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allItems.push(item);
      }
    }
  }

  // Search case-insensitive in title and URL
  const queryLower = query.toLowerCase();
  const matches = allItems.filter(item => 
    item.title.toLowerCase().includes(queryLower) ||
    item.url.toLowerCase().includes(queryLower)
  );

  if (matches.length === 0) {
    return `No results found for "${query}"`;
  }

  const lines: string[] = [];
  lines.push(`AI Release Radar — Search results for "${query}"`);
  lines.push('');
  lines.push(`Found ${matches.length} match(es):`);
  lines.push('');

  for (const item of matches) {
    lines.push(`[${item.source}] ${item.title}`);
    lines.push(`${item.url}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check source health
 */
export async function runSources(): Promise<string> {
  const lines: string[] = [];
  lines.push('AI Release Radar — Source Health Check');
  lines.push('');

  for (const source of SOURCES) {
    const result = await fetchSource(source, 1);
    
    if (result.ok && result.items.length > 0) {
      lines.push(`✓ ${source.name}: reachable`);
      const lastItem = result.items[0];
      lines.push(`  Latest: ${lastItem.title.slice(0, 60)}...`);
    } else {
      lines.push(`✗ ${source.name}: unreachable`);
      if (result.error) {
        lines.push(`  Error: ${result.error}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
