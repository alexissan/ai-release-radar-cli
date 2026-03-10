#!/usr/bin/env node
import { Command } from 'commander';
import { runCompare, runToday } from './core.js';

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

program.parseAsync(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ai-radar error: ${msg}`);
  process.exitCode = 1;
});
