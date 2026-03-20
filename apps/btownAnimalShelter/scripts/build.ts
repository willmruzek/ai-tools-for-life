// Vercel Build Output API v3
// https://vercel.com/docs/build-output-api/v3/primitives#serverless-functions

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

import fs from 'fs-extra';

import { rollup } from 'rollup';
import swc from 'rollup-plugin-swc3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const API_DIR = path.join(root, 'src', 'api');
const OUTPUT_DIR = path.join(root, '.vercel', 'output');

const maxDurations: Record<string, number> = {
  createJob: 30,
  checkJobs: 60,
  sendEmail: 60,
};

async function buildFunction(file: string): Promise<void> {
  const ext = path.extname(file);
  const name = path.basename(file, ext);
  const funcDir = path.join(OUTPUT_DIR, 'functions', 'api', `${name}.func`);

  await fs.ensureDir(funcDir);

  const bundle = await rollup({
    input: path.join(API_DIR, file),
    onwarn(warning, warn) {
      // Suppress circular dependency warnings from third-party packages
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      warn(warning);
    },
    plugins: [
      nodeResolve({
        extensions: ['.ts', '.tsx', '.js', '.mjs'],
        exportConditions: ['node', 'import', 'default'],
        preferBuiltins: true,
      }),
      commonjs(),
      json(),
      swc({
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: file.endsWith('.tsx'),
          },
          transform: {
            react: { runtime: 'automatic' },
          },
          target: 'es2022',
        },
        module: { type: 'es6' },
      }),
    ],
  });

  await bundle.write({
    file: path.join(funcDir, 'index.mjs'),
    format: 'esm',
    inlineDynamicImports: true,
  });

  await bundle.close();

  await fs.writeJson(path.join(funcDir, '.vc-config.json'), {
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    shouldAddHelpers: true,
    maxDuration: maxDurations[name] ?? 30,
  });

  console.log(`  ✓ ${name}`);
}

async function main(): Promise<void> {
  console.log('Building with Vercel Build Output API...');

  await fs.remove(OUTPUT_DIR);
  await fs.ensureDir(path.join(OUTPUT_DIR, 'static'));

  // Copy public/ → .vercel/output/static/
  const publicDir = path.join(root, 'public');
  if (await fs.pathExists(publicDir)) {
    await fs.copy(publicDir, path.join(OUTPUT_DIR, 'static'));
  }

  // Required root config
  await fs.writeJson(path.join(OUTPUT_DIR, 'config.json'), { version: 3 });

  // Bundle every .ts/.tsx file in src/api/
  const files = await fs.readdir(API_DIR);
  const handlerFiles = files.filter((f) => /\.(ts|tsx)$/.test(f));

  await Promise.all(handlerFiles.map(buildFunction));

  console.log('Done!');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
