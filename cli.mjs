#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const [command, ...args] = process.argv.slice(2);
const help = `AI Performance Tool

Usage:
  ai-performance serve [project] [--codex-history]
  ai-performance init --codex [--kiro]
  ai-performance init --kiro
  ai-performance disable
  ai-performance record <arguments>
  ai-performance import-history [project]
  ai-performance --version

Run init and disable from the target Git repository root.`;

try {
  if (command === 'init' || command === 'disable') {
    const { init, disable } = await import('./init.mjs');
    if (command === 'init') await init(process.cwd(), args);
    else {
      if (args.length) throw new Error('disable does not accept arguments.');
      await disable(process.cwd());
    }
  } else if (command === 'serve' || command === 'record') {
    process.argv.splice(2, 1);
    // npm may retain INIT_CWD from a calling script. The CLI targets its working directory.
    process.env.INIT_CWD = process.cwd();
    if (command === 'serve') await import('./serve.mjs');
    else await import('./record.mjs');
  } else if (command === 'import-history') {
    if (args.length > 1) throw new Error('import-history accepts one project path.');
    const { importHistory } = await import('./import-history.mjs');
    const { saved, found, total } = await importHistory(resolve(args[0] ?? process.cwd()));
    console.log(`Saved ${saved} session snapshot(s). Found ${found} of ${total} ticket sessions in Codex history.`);
  } else if (command === '--version' || command === '-v') {
    console.log(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version);
  } else if (!command || command === '--help' || command === '-h') {
    console.log(help);
  } else {
    throw new Error(`Unknown command: ${command}. Run ai-performance --help.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
