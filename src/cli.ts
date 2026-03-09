#!/usr/bin/env node
import { Command } from 'commander';
import { runToday } from './core.js';

const program = new Command();

program
  .name('ai-radar')
  .description('AI Release Radar CLI (official sources: OpenAI, Anthropic, Google Gemini)')
  .version('0.1.0');

program
  .command('today')
  .description('Show today\'s concise AI release briefing')
  .option('--tweet', 'Include an optional X post draft under 260 chars')
  .action(async (opts: { tweet?: boolean }) => {
    const output = await runToday(Boolean(opts.tweet));
    console.log(output);
  });

program.parseAsync(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`ai-radar error: ${msg}`);
  process.exitCode = 1;
});
