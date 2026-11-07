// Build the single SQL-editor paste from reviewed migrations and the matching
// release's metadata-only seed. Run: node supabase/build-setup.mjs path/to/seed.sql
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const seedPath = process.argv[2];
if (!seedPath) throw new Error('Pass the matching release quiz-registry seed SQL path.');
const files = [
  resolve(directory,'migrations/202611070001_progress.sql'),
  resolve(directory,'migrations/202611070002_challenges.sql'),
  resolve(seedPath),
];
const sources = await Promise.all(files.map(file => readFile(file,'utf8')));
if (!/public\.labwise_quiz_questions/i.test(sources[2])) throw new Error('The release seed must populate public.labwise_quiz_questions.');
const body = sources.map(source => source.replace(/^\s*(?:begin|commit)\s*;[ \t]*$/gim,'').trim()).join('\n\n');
const output = resolve(directory,'setup.sql');
await writeFile(output,`-- Generated one-paste Labwise setup: both migrations and release metadata.\n-- Run as the project owner in Supabase SQL Editor. No API keys are needed.\n-- Keep labwise_private and pg_catalog out of exposed API schemas.\nbegin;\n\n${body}\n\ncommit;\n`);
process.stdout.write(`Wrote ${output} (${Buffer.byteLength(body)} bytes of SQL).\n`);
