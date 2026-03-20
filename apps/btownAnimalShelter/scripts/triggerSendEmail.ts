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

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: pnpm trigger:sendEmail <jobId>');
  process.exit(1);
}

const endpoint = `https://${env.VERCEL_URL}/api/sendEmail`;
console.log(`POST ${endpoint} (jobId: ${jobId})`);

const res = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.CRON_SECRET}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ jobId }),
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
