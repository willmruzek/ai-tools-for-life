import * as ynab from 'ynab';
import { AccountType } from 'ynab';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { encode } from 'gpt-tokenizer';

import { generateText, Output } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';

import { env } from '../env.ts';

const { OPENAI_API_KEY, ACCESS_TOKEN, PLAN_ID } = env;

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

const ACCOUNT_TYPES = new Set<ynab.AccountType>([
  AccountType.Checking,
  AccountType.Savings,
  AccountType.Cash,
  AccountType.CreditCard,
]);

const ynabAPI = new ynab.API(ACCESS_TOKEN);

const sinceDate = new Date();
sinceDate.setMonth(sinceDate.getMonth() - 3);
const sinceDateStr = sinceDate.toISOString().slice(0, 10);

console.log(`Fetching transactions since ${sinceDateStr}...`);

const [accountsResponse, categoriesResponse] = await Promise.all([
  ynabAPI.accounts.getAccounts(PLAN_ID),
  ynabAPI.categories.getCategories(PLAN_ID),
]);

const targetAccounts = accountsResponse.data.accounts.filter(
  (a) => !a.deleted && !a.closed && ACCOUNT_TYPES.has(a.type),
);

console.log(`Processing ${targetAccounts.length} account(s):`);
for (const account of targetAccounts) {
  console.log(`  • ${account.name}`);
}

const txResponses = await Promise.all(
  targetAccounts.map((a) =>
    ynabAPI.transactions.getTransactionsByAccount(PLAN_ID, a.id, sinceDateStr),
  ),
);

const transactions = txResponses.flatMap((r) => r.data.transactions);

if (transactions.length === 0) {
  console.log('No transactions found in the last 3 months.');
  process.exit(0);
}

console.log(
  `Found ${transactions.length} transaction(s). Analyzing categories...`,
);

const allCategories = categoriesResponse.data.category_groups
  .filter((g) => !g.hidden && !g.deleted)
  .flatMap((group) =>
    group.categories
      .filter((cat) => !cat.hidden && !cat.deleted)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        group: group.name,
      })),
  );

const prompt = `You are a personal finance assistant and budget consultant. Analyze the following 3 months of bank transactions alongside the user's current YNAB category list and suggest concrete improvements to their category structure.

Consider the following types of changes:
- **Add**: New categories that would better reflect actual spending patterns
- **Remove**: Categories that went unused or are redundant
- **Consolidate**: Multiple categories that could be merged into one
- **Rename**: Categories with unclear or inconsistent names
- **Move**: Categories that belong in a different group

Be specific and practical. Ground every suggestion in the actual transactions provided. Do not suggest changes for categories that are already working well.

Note: YNAB does not support nested categories, but a common convention is to encode hierarchy in the category name itself using the format 'Group: Category' (e.g. 'Car: Gas', 'Car: Insurance', 'Travel: Flights'). When suggesting new categories or moves, feel free to use this convention if it would improve clarity.

## Current Categories
${JSON.stringify(allCategories, null, 2)}

## Transactions (last 3 months)
${JSON.stringify(transactions, null, 2)}`;

console.log(`Prompt tokens: ${encode(prompt).length}`);

const { output } = await generateText({
  model: openai('gpt-5.2'),
  prompt,
  output: Output.object({
    schema: z.object({
      summary: z
        .string()
        .describe('Brief overall assessment of the current category structure'),
      add: z.array(
        z.object({
          category_group: z.string(),
          category_name: z.string(),
          reason: z.string(),
        }),
      ),
      remove: z.array(
        z.object({
          category_id: z.string(),
          category_name: z.string(),
          reason: z.string(),
        }),
      ),
      consolidate: z.array(
        z.object({
          category_ids: z.array(z.string()),
          category_names: z.array(z.string()),
          suggested_name: z.string(),
          suggested_group: z.string(),
          reason: z.string(),
        }),
      ),
      rename: z.array(
        z.object({
          category_id: z.string(),
          current_name: z.string(),
          suggested_name: z.string(),
          reason: z.string(),
        }),
      ),
      move: z.array(
        z.object({
          category_id: z.string(),
          category_name: z.string(),
          current_group: z.string(),
          suggested_group: z.string(),
          reason: z.string(),
        }),
      ),
    }),
  }),
});

console.log('\nCategory recommendations:');
console.log(JSON.stringify(output, null, 2));

const outputDir = path.join(
  import.meta.dirname,
  '..',
  '..',
  'output',
  'ynab',
  'recommend',
);
await fs.mkdir(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(outputDir, `recommendations-${timestamp}.json`);
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
console.log(`\nOutput saved to: ${outputPath}`);
