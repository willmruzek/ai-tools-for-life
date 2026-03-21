import { z } from 'zod';
import dedent from 'dedent';

const myDedent = dedent.withOptions({
  trimWhitespace: true,
  alignValues: true,
});

export const catSchema = z.object({
  initial_index_count: z.number(),
  initial_index_count_citation: z
    .string()
    .describe('Source URL for initial_index_count')
    .optional(),
  final_extraction_count: z.number(),
  final_extraction_count_citation: z
    .string()
    .describe('Source URL for final_extraction_count')
    .optional(),
  cats: z.array(
    z.object({
      name: z.string(),
      name_citation: z.string().describe('Source URL for name').optional(),
      breed: z.string(),
      breed_citation: z.string().describe('Source URL for breed').optional(),
      profile_url: z.string(),
      profile_url_citation: z
        .string()
        .describe('Source URL for profile_url')
        .optional(),
      in_foster_home: z.boolean(),
      in_foster_home_citation: z
        .string()
        .describe('Source URL for in_foster_home')
        .optional(),
      age: z.string(),
      age_citation: z.string().describe('Source URL for age').optional(),
      img_srcs: z.array(
        z.object({
          value: z.string(),
          value_citation: z
            .string()
            .describe('Source URL for value')
            .optional(),
        }),
      ),
    }),
  ),
});

export type CatData = z.infer<typeof catSchema>;
export type Cat = CatData['cats'][number];

export const agentPrompt = myDedent`
  Extract all cat profiles from https://bloomington.in.gov/animal-shelter.

  IMPORTANT: Exclude any cats categorized as 'Working Cats'.

  Validation Step:
  1. Before extracting individual profiles, identify and record the total number of non-working cats listed on the index page (expecting 50+ results).
  2. After extraction, compare the number of results collected to that initial count.
  3. If there is a discrepancy (accounting for bonded pairs as single entries), re-scan the page to ensure no entries were missed or truncated.

  Extraction Details:
  - Process the entire list on the single page without truncation.
  - For each entry, including bonded pairs (which should remain as a single entry), navigate to their specific profile page to extract all full-size image URLs into 'img_srcs'.
  - Capture the direct URL of each cat's profile page into 'profile_url'.

  Fields to extract:
  - initial_index_count: The total number of eligible cats/entries found on the main index page before starting.
  - final_extraction_count: The total number of profile objects successfully created.
  - Name
  - Breed
  - profile_url: The direct URL to the cat's individual profile page.
  - Foster status: set 'in_foster_home' to true if the profile indicates they are in a foster home.
  - Age normalization: use weeks for ≤16 weeks; months and weeks for >16 weeks but <12 months; years and months for ≥12 months.

  Sort the final list by age ascending.
`;
