#!/usr/bin/env node

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const env = createEnv({
  server: {
    VERCEL_URL: z.string().min(1),
    CRON_SECRET: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

const endpoint = `https://${env.VERCEL_URL}/api/checkJobs`;
console.log(`POST ${endpoint}`);

const res = await fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
});

const text = await res.text();
let body: unknown;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}
console.log(`${res.status} ${res.statusText}`, body);

if (!res.ok) process.exit(1);
