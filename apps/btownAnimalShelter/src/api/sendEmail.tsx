import type { VercelRequest, VercelResponse } from '@vercel/node';
import { render } from '@react-email/components';
import { ServerClient as PostmarkServerClient } from 'postmark';
import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db } from '../db.ts';
import { catSchema } from '../agentConfig.ts';
import { CatListingEmail } from '../email/CatListingEmail.tsx';
import { requireBearerAuth } from '../auth.ts';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  console.log(`[sendEmail] ${req.method} received`);
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const auth = requireBearerAuth(req);
  if (!auth.ok) {
    console.warn(`[sendEmail] auth failed: ${auth.message}`);
    res.status(auth.statusCode).send(auth.message);
    return;
  }

  const body = req.body as unknown;

  if (
    typeof body !== 'object' ||
    body === null ||
    !('jobId' in body) ||
    typeof body.jobId !== 'string'
  ) {
    res.status(400).json({ error: 'Missing jobId in request body' });
    return;
  }

  const { jobId } = body;

  console.log(`[sendEmail] fetching jobs for jobId=${jobId}`);
  const t0 = Date.now();
  const jobs = await db.getJobs();
  console.log(`[sendEmail] got ${jobs.length} jobs (${Date.now() - t0}ms)`);
  if (!jobs.some((j) => j.id === jobId && j.status === 'readyToEmail')) {
    console.error(`[sendEmail] no readyToEmail job found for jobId=${jobId}`);
    res
      .status(404)
      .json({ error: `No readyToEmail job found with ID ${jobId}` });
    return;
  }

  console.log(`[sendEmail] fetching agent status for jobId=${jobId}`);
  const t1 = Date.now();
  const agentStatus = await firecrawl.getAgentStatus(jobId);
  console.log(
    `[sendEmail] agent status=${agentStatus.status} (${Date.now() - t1}ms)`,
  );
  if (agentStatus.status !== 'completed' || agentStatus.data === undefined) {
    console.error(
      `[sendEmail] agent data not available, status=${agentStatus.status}`,
    );
    res.status(422).json({ error: 'Agent data not available' });
    return;
  }

  const parseResult = catSchema.safeParse(agentStatus.data);
  if (!parseResult.success) {
    console.error(
      '[sendEmail] failed to parse agent data:',
      parseResult.error.issues,
    );
    res.status(422).json({ error: 'Invalid agent data structure' });
    return;
  }

  const catData = parseResult.data;
  console.log(
    `[sendEmail] parsed ${catData.cats.length} cats, rendering email`,
  );

  const t2 = Date.now();
  const html = await render(<CatListingEmail data={catData} />);
  console.log(`[sendEmail] email rendered in ${Date.now() - t2}ms`);

  const postmark = new PostmarkServerClient(env.POSTMARK_API_TOKEN);
  console.log('[sendEmail] sending via postmark');
  const t3 = Date.now();
  await postmark.sendEmail({
    From: env.EMAIL_RECIPIENT,
    To: env.EMAIL_RECIPIENT,
    Subject: `🐱 ${catData.final_extraction_count} cats available at Bloomington Animal Shelter`,
    HtmlBody: html,
  });
  console.log(`[sendEmail] postmark send completed in ${Date.now() - t3}ms`);

  await db.saveJobs(
    jobs.map((j) =>
      j.id === jobId ? { ...j, status: 'emailSent' as const } : j,
    ),
  );

  console.log(`[sendEmail] done, jobId=${jobId}`);
  res.status(200).json({ sent: true });
}
