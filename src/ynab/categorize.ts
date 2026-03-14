import * as ynab from 'ynab';
import { AccountType, GetTransactionsByAccountTypeEnum } from 'ynab';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parse } from 'csv-parse/sync';
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
    ynabAPI.transactions.getTransactionsByAccount(
      PLAN_ID,
      a.id,
      undefined,
      GetTransactionsByAccountTypeEnum.Unapproved,
    ),
  ),
);

const unapproved = txResponses.flatMap((r) => r.data.transactions);

if (unapproved.length === 0) {
  console.log('No unapproved transactions found.');
  process.exit(0);
}

console.log(
  `Found ${unapproved.length} unapproved transaction(s). Categorizing...`,
);

const allCategories = categoriesResponse.data.category_groups.flatMap((group) =>
  group.categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    group: group.name,
  })),
);

const amazonHistoryPath = path.join(
  import.meta.dirname,
  '..',
  '..',
  'input',
  'AmazonOrderHistory.csv',
);
let recentOrders: {
  order_id: string;
  date: string;
  product: string;
  total: string;
}[] = [];

try {
  const csvRaw = await fs.readFile(amazonHistoryPath, 'utf-8');
  const allOrders: Record<string, string>[] = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  recentOrders = allOrders
    .filter((row) => {
      const year = new Date(row['Order Date'] ?? '').getFullYear();
      return year >= 2025;
    })
    .map((row) => ({
      order_id: row['Order ID'] ?? '',
      date: row['Order Date'] ?? '',
      product: row['Product Name'] ?? '',
      total: row['Total Amount'] ?? '',
    }));
  console.log(`Loaded ${recentOrders.length} Amazon order(s) from 2025+.`);
} catch {
  console.warn(
    'No Amazon order history found — skipping (add input/AmazonOrderHistory.csv to improve Amazon categorization).',
  );
}

const amazonSection =
  recentOrders.length > 0
    ? `## Amazon Order History (2025–present)\n${JSON.stringify(recentOrders, null, 2)}\n\n`
    : '';

const prompt = `You are a personal finance assistant. Categorize each of the following bank transactions into one of the provided YNAB categories.

For transactions where the payee is Amazon, use the Amazon Order History below to determine what was purchased and choose the most specific matching category.

Additionally, based on the transactions, suggest any new categories or category groups that would improve the budget organization. Only suggest categories that don't already exist. These suggestions are for future use only — do not use suggested categories when categorizing the current transactions; only use categories from the provided list above.

${amazonSection}## Categories
${JSON.stringify(allCategories, null, 2)}

## Transactions
${JSON.stringify(unapproved, null, 2)}`;

console.log(`Prompt tokens: ${encode(prompt).length}`);

const { output } = await generateText({
  model: openai('gpt-5.2'),
  prompt,
  output: Output.object({
    schema: z.object({
      categorizations: z.array(
        z.object({
          transaction_id: z.string(),
          payee_name: z.string(),
          category_id: z.string(),
          category_name: z.string(),
        }),
      ),
      recommendations: z.array(
        z.object({
          category_group: z.string(),
          category_name: z.string(),
          reason: z.string(),
        }),
      ),
    }),
  }),
});

const txById = new Map(unapproved.map((tx) => [tx.id, tx]));

const succeeded = output.categorizations
  .filter((cat) => txById.has(cat.transaction_id))
  .map((cat) => ({
    account_id: txById.get(cat.transaction_id)?.account_id,
    account_name: txById.get(cat.transaction_id)?.account_name,
    ...cat,
  }));

const failed = {
  unknownTxId: output.categorizations.filter(
    (cat) => !txById.has(cat.transaction_id),
  ),
};

const result = { succeeded, failed, recommendations: output.recommendations };

console.log('AI categorizations:');
console.log(JSON.stringify(result, null, 2));

const outputDir = path.join(
  import.meta.dirname,
  '..',
  '..',
  'output',
  'ynab',
  'categorize',
);
await fs.mkdir(outputDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(outputDir, `categorizations-${timestamp}.json`);
await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
console.log(`\nOutput saved to: ${outputPath}`);

if (failed.unknownTxId.length > 0) {
  console.warn(
    `Warning: ${failed.unknownTxId.length} unknown transaction ID(s) skipped.`,
  );
}

console.log('\nUpdating transactions in YNAB...');
await ynabAPI.transactions.updateTransactions(PLAN_ID, {
  transactions: succeeded.map((cat) => ({
    id: cat.transaction_id,
    category_id: cat.category_id,
  })),
});

console.log(`Updated ${succeeded.length} transaction(s).`);
