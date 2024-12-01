# Language Analysis for GitHub Orgs

Simple Node scripts to help identify language expertise across an org's developers by analyzing PR contributions and code changes.

Looks at the previous [x] days of PRs to analyze across all repos in the org. Defaults to 60 days.

Will also pick up contributors outside of the org that are working on org repos, so could be useful for community engagement reporting.

> **Note:** These metrics (lines of code, PR counts) do not necessarily correlate with code quality, impact, or overall contribution value. Some of the most significant contributions might involve removing code, refactoring, or making small but critical changes. **Please don't use anything like this to solely evaluate developer performance!**

## Prerequisites

- Node.js 18+
- A GitHub personal access token

## Setup

```bash
npm install
```

Create a `.env` file:
```
GITHUB_TOKEN=your_token
GITHUB_ORG=default_org_name
NUMBER_OF_DAYS_TO_ANALYZE=60
```

To get a token, go to https://github.com/settings/tokens and create a new classic token with the following scopes: `repo`, `read:org`, `read:user`, `read:email`

## Usage

### Step 1: Analyze language usage:
```bash
node analyze-languages.js org_name
```

This will create a csv file in the `./output` directory with the year and month you ran the command in the filename.

Depending on the number of repos in your org, this could run for a while and might hit GitHub API rate limits. If it does, just run it again. 

The processed repos are cached in a separate json file so they can be skipped over automatically the next time the command runs.

> Leaving out the org name will use the default org listed in the `.env` file.

### Step 2: Load data into SQLite:
```bash
node load-sqlite.js your_csv_file.csv
```

> Leaving out the csv file arg will list all the available csv files in the output directory.

### Step 3: Sync org members into SQLite:
```bash
node save-members.js org_name
```

> Leaving out the org name will use the default org listed in the `.env` file.

### Step 4: Query the database

The `github_stats.db` file is a SQLite database that contains the following tables: 
- `github_language_stats`
- `organization_members`

A helpful query to analyze only those contributions that are from within your org is:
```sql
SELECT
    user,
    name,
    language,
    location,
    sum(lines_added),
    sum(lines_removed),
    sum(pr_count) 
FROM 
    github_language_stats
JOIN
    organization_members on github_language_stats.user = organization_members.login
GROUP BY
    user, language;
```

> If using VS Code (or compatible IDE), I suggest using the [sqlite3-editor](https://marketplace.visualstudio.com/items?itemName=yy0931.vscode-sqlite3-editor) extension so you can click directly on the DB file to view and query.