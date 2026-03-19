import { get, put } from '@vercel/blob';
import { z } from 'zod';
import { env } from './env.ts';

const JOB_BLOB_PATH = 'btownAnimalShelter/jobs.json';

const jobStatusSchema = z.union([
  z.literal('pending'),
  z.literal('readyToEmail'),
  z.literal('emailSent'),
  z.literal('failed'),
]);

export const jobSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  status: jobStatusSchema,
});

export type Job = z.infer<typeof jobSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;

const jobsFileSchema = z.object({
  jobs: z.array(jobSchema),
});

export async function getJobs(): Promise<Job[]> {
  const result = await get(JOB_BLOB_PATH, {
    access: 'private',
    token: env.BLOB_READ_WRITE_TOKEN,
  });

  if (result === null) return [];

  const text = await new Response(result.stream).text();

  const parsed = jobsFileSchema.parse(JSON.parse(text));

  return parsed.jobs;
}

export async function saveJobs(jobs: Job[]): Promise<void> {
  await put(JOB_BLOB_PATH, JSON.stringify({ jobs }, null, 2), {
    access: 'private',
    allowOverwrite: true,
    contentType: 'application/json',
    token: env.BLOB_READ_WRITE_TOKEN,
  });
}

export const db = {
  getJobs,
  saveJobs,
};
