# AI Tools for Life

Repository for personal-life automation scripts, organized by domain.

## Structure

```text
src/
  env.ts
  ynab/
    categorize.ts
    recommend.ts
    README.md
  email/
    .gitkeep
input/
output/
  <group>/
    <script>/
      <script-output>-<timestamp>.json
```

## Available tools

### YNAB tools

Located in `src/ynab`.

- `categorize.ts`
  - Categorizes unapproved YNAB transactions with AI.
  - Writes output to `output/ynab/categorize/categorizations-<timestamp>.json`.
  - Updates transaction categories in YNAB.
- `recommend.ts`
  - Reviews recent YNAB transactions and recommends category-structure improvements.
  - Writes output to `output/ynab/recommend/recommendations-<timestamp>.json`.
  - Read-only with respect to YNAB data.

See the full YNAB documentation in `src/ynab/README.md`.

### Email tools

Located in `src/email`.

- No scripts yet (placeholder folder only).

## Scripts

Run from the repository root:

```sh
pnpm categorize
pnpm recommend
```

Defined in `package.json`:

- `categorize`: `node src/ynab/categorize.ts`
- `recommend`: `node src/ynab/recommend.ts`

### Script outputs

- `categorize`: `output/ynab/categorize/categorizations-<timestamp>.json`
- `recommend`: `output/ynab/recommend/recommendations-<timestamp>.json`

## Setup

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Configure environment variables (for YNAB scripts):
   - `OPENAI_API_KEY`
   - `ACCESS_TOKEN`
   - `PLAN_ID`

### Environment loading

- Use `direnv` if you want automatic per-directory env loading:
  - put exports in `.envrc`
  - run `direnv allow`
- Use `dotenvx` if you prefer `.env` files and explicit command wrapping:
  - store values in `.env`
  - run commands like `dotenvx run -- pnpm categorize`
- Use `dotenv` if you want lightweight `.env` loading in Node:
  - store values in `.env`
  - install it: `pnpm add dotenv`
  - run commands like `node -r dotenv/config src/ynab/categorize.ts`
  - or import once at startup in script code: `import 'dotenv/config'`
- Use Node's built-in env-file support if you don't want extra dependencies:
  - store values in `.env`
  - run commands like `node --env-file=.env src/ynab/categorize.ts`

### Shared config

Domain scripts should import environment configuration from `src/env.ts`.

## Output convention

Each script writes to a canonical output file path:

```text
output/<group>/<script>/<script-output>-<timestamp>.json
```

This keeps outputs consistent as more domains and scripts are added.
