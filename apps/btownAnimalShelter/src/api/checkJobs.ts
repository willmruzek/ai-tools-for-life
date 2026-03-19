import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db, type Job } from '../db.ts';
import { requireBearerAuth } from '../auth.ts';

export const config = { maxDuration: 60 };

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

        const status = await firecrawl.getAgentStatus(job.id);

        if (status.status === 'completed') {
          updated++;
          await fetch(`${baseUrl}/api/sendEmail`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.CRON_SECRET}`,
            },
            body: JSON.stringify({ jobId: job.id }),
          });
          return { ...job, status: 'readyToEmail' as const };
        } else if (status.status === 'failed') {
          failed++;
          console.error(`Agent job ${job.id} failed: ${status.error}`);
          return { ...job, status: 'failed' as const };
        }

        return job;
      }),
    );
    return { ok: true, updatedJobs, updated, failed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default async function handler(req: Request): Promise<Response> {
  const auth = requireBearerAuth(req);
  if (!auth.ok) return auth.response;

  const jobs = await db.getJobs();
  const pendingJobs = jobs.filter((j) => j.status === 'pending');

  if (pendingJobs.length === 0) {
    return Response.json({ processed: 0 });
  }

  const result = await processPendingJobs(jobs, new URL(req.url).origin);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  await db.saveJobs(result.updatedJobs);

  return Response.json({
    processed: pendingJobs.length,
    updated: result.updated,
    failed: result.failed,
  });
}
