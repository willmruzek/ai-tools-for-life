import { agentPrompt, catSchema } from '../agentConfig.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db } from '../db.ts';
import { requireBearerAuth } from '../auth.ts';

export const config = { maxDuration: 30 };

async function createJob(): Promise<Response> {
  const agentResult = await firecrawl.startAgent({
    prompt: agentPrompt,
    schema: catSchema,
    model: 'spark-1-mini',
  });

  if (!agentResult.success) {
    return Response.json(
      { error: `Failed to start agent: ${agentResult.error}` },
      { status: 500 },
    );
  }

  const jobs = await db.getJobs();
  await db.saveJobs([
    ...jobs,
    {
      id: agentResult.id,
      startedAt: new Date().toISOString(),
      status: 'pending',
    },
  ]);

  return Response.json({ jobId: agentResult.id });
}

// Triggered by Vercel cron or manually (GET with Authorization: Bearer CRON_SECRET)
export default async function handler(req: Request): Promise<Response> {
  const auth = requireBearerAuth(req);

  if (!auth.ok) return auth.response;

  return createJob();
}
