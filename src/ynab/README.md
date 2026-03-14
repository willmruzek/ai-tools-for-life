# YNAB Tools

> **Status:** Quick and dirty for now

Automatically categorizes unapproved YNAB transactions using AI. For Amazon purchases, it cross-references your order history CSV to determine what was bought and pick the most accurate category. It also suggests new categories/groups you might want to add to your budget.

## How it works

1. Fetches all non-closed checking, savings, cash, and credit card accounts from your YNAB budget
2. Retrieves all unapproved transactions across those accounts in parallel
3. Loads your Amazon order history CSV (filtered to 2025+) for richer context on Amazon transactions, if present
4. Sends everything to OpenAI with your full category list and gets back structured categorizations + category recommendations
5. Applies the categorizations to YNAB in a single PATCH request
6. Saves the full result (succeeded, failed, recommendations) to `output/ynab/categorize/categorizations-<timestamp>.json`

## Tech stack

| Package                                                          | Purpose                                               |
| ---------------------------------------------------------------- | ----------------------------------------------------- |
| [`ynab`](https://www.npmjs.com/package/ynab)                     | YNAB API client                                       |
| [`ai`](https://www.npmjs.com/package/ai)                         | Vercel AI SDK — `generateText` with structured output |
| [`@ai-sdk/openai`](https://www.npmjs.com/package/@ai-sdk/openai) | OpenAI provider for the AI SDK                        |
| [`zod`](https://www.npmjs.com/package/zod)                       | Schema definition for structured AI output            |
| [`csv-parse`](https://www.npmjs.com/package/csv-parse)           | Parses the Amazon order history CSV                   |
| [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer)   | Estimates prompt token count before sending           |
| [`typescript`](https://www.npmjs.com/package/typescript)         | Type checking                                         |

Requires Node.js >= 24.

## Setup

1. **Install dependencies**

   ```sh
   pnpm install
   ```

2. **Configure credentials** — set the following environment variables:

   | Variable            | Description                     |
   | ------------------- | ------------------------------- |
   | `OPENAI_API_KEY`    | Your OpenAI API key             |
   | `YNAB_ACCESS_TOKEN` | Your YNAB personal access token |
   | `YNAB_PLAN_ID`      | Your YNAB budget ID             |

   > Get your YNAB access token at: [YNAB Developer Settings](https://app.ynab.com/settings/developer)
   > Get your budget ID from the URL when viewing your budget: `https://app.ynab.com/<PLAN_ID>/budget`

   Use [direnv](https://direnv.net) with a `.envrc` file to load env vars:

   ```sh
   export OPENAI_API_KEY=sk-...
   export YNAB_ACCESS_TOKEN=your-token
   export YNAB_PLAN_ID=your-budget-id
   ```

   Then run `direnv allow` once to activate it. Add `.envrc` to `.gitignore` to keep secrets out of version control.

3. **(Optional) Add your Amazon order history**

   Export your order history from [Amazon Order History Reports](https://www.amazon.com/gp/b2b/reports) and save it to:

   ```text
   input/AmazonOrderHistory.csv
   ```

   If this file is not present, the script will still run but Amazon transactions may be categorized less accurately.

## Usage

### Categorize unapproved transactions

```sh
pnpm categorize
```

Fetches all unapproved transactions, categorizes them with AI, and patches YNAB in one request. Output saved to `output/ynab/categorize/categorizations-<timestamp>.json`.

### Recommend category structure improvements

```sh
pnpm recommend
```

Analyzes the last 3 months of transactions and suggests changes to your category structure. Read-only — does not modify YNAB. Output saved to `output/ynab/recommend/recommendations-<timestamp>.json`.

## Output structure

```text
output/
  ynab/
    categorize/
         categorizations-<timestamp>.json
    recommend/
         recommendations-<timestamp>.json
```
