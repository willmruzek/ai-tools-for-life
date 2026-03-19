import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    FIRECRAWL_API_KEY: z.string().min(1),
    BLOB_READ_WRITE_TOKEN: z.string().min(1),
    POSTMARK_API_TOKEN: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    EMAIL_RECIPIENT: z.string().email(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
