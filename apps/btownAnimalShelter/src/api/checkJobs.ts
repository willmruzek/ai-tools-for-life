import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db, type Job } from '../db.ts';
import { requireBearerAuth } from '../auth.ts';

type ProcessResult =
  | { ok: true; updatedJobs: Job[]; updated: number; failed: number }
  | { ok: false; error: string };

async function processPendingJobs(
  jobs: Job[],
  baseUrl: string,
): Promise<ProcessResult> {
  let updated = 0;
  let failed = 0;
  try {
    const updatedJobs = await Promise.all(
      jobs.map(async (job) => {
        if (job.status !== 'pending') return job;

        console.log(`[checkJobs] polling agent status for job ${job.id}`);
        const t0 = Date.now();
        const status = await firecrawl.getAgentStatus(job.id);
        console.log(
          `[checkJobs] job ${job.id} status=${status.status} (${Date.now() - t0}ms)`,
        );

        if (status.status === 'completed') {
          updated++;
          console.log(`[checkJobs] job ${job.id} completed, calling sendEmail`);
          const t1 = Date.now();
          const emailRes = await fetch(`${baseUrl}/api/sendEmail`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.CRON_SECRET}`,
            },
            body: JSON.stringify({ jobId: job.id }),
          });
          console.log(
            `[checkJobs] sendEmail responded ${emailRes.status} in ${Date.now() - t1}ms`,
          );
          if (!emailRes.ok) {
            const body = await emailRes.text();
            console.error(`[checkJobs] sendEmail error body: ${body}`);
          }
          return { ...job, status: 'readyToEmail' as const };
        } else if (status.status === 'failed') {
          failed++;
          console.error(
            `[checkJobs] agent job ${job.id} failed: ${status.error}`,
          );
          return { ...job, status: 'failed' as const };
        }

        return job;
      }),
    );
    return { ok: true, updatedJobs, updated, failed };
  } catch (err) {
    console.error('[checkJobs] processPendingJobs threw:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const auth = requireBearerAuth(req);
  if (!auth.ok) {
    res.status(auth.statusCode).send(auth.message);
    return;
  }

  const proto = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : (req.headers['x-forwarded-proto'] ?? 'https');
  const host = req.headers['host'] ?? 'localhost';
  const baseUrl = `${proto}://${host}`;

  console.log('[checkJobs] fetching jobs from db');
  const t0 = Date.now();
  const jobs = await db.getJobs();
  const pendingJobs = jobs.filter((j) => j.status === 'pending');
  console.log(
    `[checkJobs] found ${jobs.length} total jobs, ${pendingJobs.length} pending (${Date.now() - t0}ms)`,
  );

  if (pendingJobs.length === 0) {
    res.status(200).json({ processed: 0 });
    return;
  }

  const result = await processPendingJobs(jobs, baseUrl);
  if (!result.ok) {
    console.error('[checkJobs] processing failed:', result.error);
    res.status(500).json({ error: result.error });
    return;
  }
  console.log(
    `[checkJobs] saving jobs, updated=${result.updated} failed=${result.failed}`,
  );
  await db.saveJobs(result.updatedJobs);

  res.status(200).json({
    processed: pendingJobs.length,
    updated: result.updated,
    failed: result.failed,
  });
}
