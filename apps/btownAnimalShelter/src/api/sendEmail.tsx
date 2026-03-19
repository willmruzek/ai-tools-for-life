import { render } from '@react-email/components';
import { ServerClient as PostmarkServerClient } from 'postmark';
import { env } from '../env.ts';
import { firecrawl } from '../firecrawlClient.ts';
import { db } from '../db.ts';
import { catSchema } from '../agentConfig.ts';
import { CatListingEmail } from '../email/CatListingEmail.tsx';
import { requireBearerAuth } from '../auth.ts';

export const config = { maxDuration: 60 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const auth = requireBearerAuth(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json()) as unknown;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('jobId' in body) ||
    typeof body.jobId !== 'string'
  ) {
    return Response.json(
      { error: 'Missing jobId in request body' },
      { status: 400 },
    );
  }

  const { jobId } = body;

  const jobs = await db.getJobs();
  if (!jobs.some((j) => j.id === jobId && j.status === 'readyToEmail')) {
    return Response.json(
      { error: `No readyToEmail job found with ID ${jobId}` },
      { status: 404 },
    );
  }

  const agentStatus = await firecrawl.getAgentStatus(jobId);
  if (agentStatus.status !== 'completed' || agentStatus.data === undefined) {
    return Response.json(
      { error: 'Agent data not available' },
      { status: 422 },
    );
  }

  const catData = catSchema.parse(agentStatus.data);

  const html = await render(<CatListingEmail data={catData} />);

  const postmark = new PostmarkServerClient(env.POSTMARK_API_TOKEN);
  await postmark.sendEmail({
    From: env.EMAIL_RECIPIENT,
    To: env.EMAIL_RECIPIENT,
    Subject: `🐱 ${catData.final_extraction_count} cats available at Bloomington Animal Shelter`,
    HtmlBody: html,
  });

  await db.saveJobs(
    jobs.map((j) =>
      j.id === jobId ? { ...j, status: 'emailSent' as const } : j,
    ),
  );

  return Response.json({ sent: true });
}
