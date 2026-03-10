#!/usr/bin/env node
import { Command } from 'commander';
import { runCompare, runToday } from './core.js';
import { runWatch, runDigest, runSearch, runSources } from './extended.js';

const program = new Command();

program
  .name('ai-radar')
  .description('AI Release Radar CLI (official sources: OpenAI, Anthropic, Google Gemini)')
  .version('0.1.0');

program
  .command('today')
  .description('Show today\'s concise AI release briefing')
  .action(async () => {
    const output = await runToday();
    console.log(output);
  });

program
  .command('compare')
  .description('Compare short-term trend windows from latest available updates')
  .option('--days <n>', 'Window size in days (default: 2)', '2')
  .action(async (opts: { days?: string }) => {
    const days = Number.parseInt(opts.days ?? '2', 10);
    const output = await runCompare(Number.isFinite(days) ? days : 2);
    console.log(output);
  });

program
  .command('watch')
  .description('Watch mode: poll sources continuously')
  .option('--interval <minutes>', 'Poll interval in minutes (default: 30)', '30')
  .action(async (opts: { interval?: string }) => {
    const interval = Number.parseInt(opts.interval ?? '30', 10);
    const intervalMinutes = Number.isFinite(interval) && interval > 0 ? interval : 30;
    await runWatch(intervalMinutes);
  });

program
  .command('digest')
  .description('Generate a daily digest summary')
  .option('--since <duration>', 'Time range: 24h, 48h, 7d (default: 24h)', '24h')
  .option('--output <format>', 'Output format: text or json (default: text)', 'text')
  .action(async (opts: { since?: string; output?: string }) => {
    const output = await runDigest({
      since: opts.since ?? '24h',
      json: opts.output === 'json'
    });
    console.log(output);
  });

program
  .command('search <query>')
  .description('Search cached updates by keyword')
  .action(async (query: string) => {
    const output = await runSearch(query);
    console.log(output);
  });

program
  .command('sources')
  .description('Check source health and reachability')
  .action(async () => {
    const output = await runSources();
    console.log(output);
  });

program.parseAsync(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ai-radar error: ${msg}`);
  process.exitCode = 1;
});
