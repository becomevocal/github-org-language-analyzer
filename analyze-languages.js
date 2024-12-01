import { Octokit } from '@octokit/rest';
import { createWriteStream, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function getLanguageFromExtension(filename) {
    const ext = path.extname(filename).toLowerCase();
    const languageMap = {
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.jsx': 'React (JS)',
        '.tsx': 'React (TS)',
        '.py': 'Python',
        '.rb': 'Ruby',
        '.java': 'Java',
        '.go': 'Go',
        '.cpp': 'C++',
        '.cc': 'C++',
        '.c': 'C',
        '.h': 'C',
        '.hpp': 'C++',
        '.cs': 'C#',
        '.php': 'PHP',
        '.swift': 'Swift',
        '.kt': 'Kotlin',
        '.rs': 'Rust',
        '.scala': 'Scala',
        '.html': 'HTML',
        '.css': 'CSS',
        '.scss': 'SCSS',
        '.sql': 'SQL',
        '.sh': 'Shell',
        '.bash': 'Shell',
        '.yml': 'YAML',
        '.yaml': 'YAML',
        '.json': 'JSON',
        '.md': 'Markdown',
        '.xml': 'XML',
        '.dockerfile': 'Dockerfile',
        '.vue': 'Vue',
        '.dart': 'Dart',
        '.ex': 'Elixir',
        '.exs': 'Elixir',
        '.erl': 'Erlang',
        '.fs': 'F#',
        '.fsx': 'F#',
        '.hs': 'Haskell',
        '.lua': 'Lua',
        '.m': 'Objective-C',
        '.mm': 'Objective-C',
        '.pl': 'Perl',
        '.r': 'R',
        '.rake': 'Ruby'
    };
    return languageMap[ext] || 'Other';
}

async function getPRFiles(octokit, owner, repo, pull_number) {
    const files = [];
    try {
        for await (const response of octokit.paginate.iterator(
            octokit.rest.pulls.listFiles,
            {
                owner,
                repo,
                pull_number,
                per_page: 100
            }
        )) {
            files.push(...response.data);
        }
    } catch (error) {
        console.error(`Error getting PR files for ${repo}#${pull_number}:`, error.message);
    }
    return files;
}

async function analyzeUserLanguages(orgName, token) {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const outputDir = `./output`;
    
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = `${outputDir}/${orgName}_user_languages_${year}_${month}.csv`;
    const cacheFile = `${outputDir}/${orgName}_processed_repos.json`;
    const octokit = new Octokit({ auth: token });
    
    const endDate = new Date();
    const startDate = new Date();
    const daysToAnalyze = parseInt(process.env.NUMBER_OF_DAYS_TO_ANALYZE || '60');
    startDate.setDate(startDate.getDate() - daysToAnalyze);

    let existingData = new Map();
    let headers = 'User,Repository,Language,LinesAdded,LinesRemoved,PRCount,DateRangeStart,DateRangeEnd\n';
    if (existsSync(outputFile)) {
        const fileContent = readFileSync(outputFile, 'utf8');
        const records = parse(fileContent, { 
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true
        });
        records.forEach(record => {
            const key = `${record.User}|||${record.Repository}|||${record.Language}`;
            existingData.set(key, record);
        });
    }
    
    let processedRepos = new Set();
    if (existsSync(cacheFile)) {
        processedRepos = new Set(JSON.parse(readFileSync(cacheFile, 'utf8')));
        console.log(`Loaded ${processedRepos.size} processed repos from cache`);
    }

    const outputStream = createWriteStream(outputFile);
    outputStream.write(headers);
    
    existingData.forEach(record => {
        outputStream.write(
            `"${record.User}","${record.Repository}","${record.Language}",` +
            `${record.LinesAdded},${record.LinesRemoved},${record.PRCount},` +
            `"${record.DateRangeStart}","${record.DateRangeEnd}"\n`
        );
    });

    try {
        const repos = await octokit.paginate(octokit.rest.repos.listForOrg, {
            org: orgName,
            per_page: 100
        });

        for (const repo of repos) {
            if (processedRepos.has(repo.name)) {
                console.log(`Skipping ${repo.name} (already processed)`);
                continue;
            }

            console.log(`Analyzing ${repo.name}...`);
            const userLanguageStats = new Map();

            try {
                for await (const response of octokit.paginate.iterator(
                    octokit.rest.pulls.list,
                    {
                        owner: orgName,
                        repo: repo.name,
                        state: 'all',
                        sort: 'updated',
                        direction: 'desc',
                        per_page: 100
                    }
                )) {
                    for (const pr of response.data) {
                        const prDate = new Date(pr.updated_at);
                        if (prDate < startDate) {
                            break;
                        }

                        const files = await getPRFiles(octokit, orgName, repo.name, pr.number);
                        const author = pr.user.login;

                        for (const file of files) {
                            const language = getLanguageFromExtension(file.filename);
                            const key = `${author}|||${repo.name}|||${language}`;
                            
                            const existing = existingData.get(key) || {
                                additions: 0,
                                deletions: 0,
                                prCount: 0
                            };

                            if (!userLanguageStats.has(key)) {
                                userLanguageStats.set(key, { 
                                    additions: parseInt(existing.LinesAdded || 0),
                                    deletions: parseInt(existing.LinesRemoved || 0),
                                    prCount: parseInt(existing.PRCount || 0)
                                });
                            }

                            const stats = userLanguageStats.get(key);
                            stats.additions += file.additions;
                            stats.deletions += file.deletions;
                            stats.prCount += 1;
                        }
                    }
                }

                userLanguageStats.forEach((stats, key) => {
                    const [user, repo, language] = key.split('|||');
                    outputStream.write(
                        `"${user}","${repo}","${language}",${stats.additions},${stats.deletions},` +
                        `${stats.prCount},"${startDate.toISOString().split('T')[0]}",` +
                        `"${endDate.toISOString().split('T')[0]}"\n`
                    );
                });

            } catch (error) {
                console.error(`Error processing repo ${repo.name}:`, error.message);
                continue;
            }

            processedRepos.add(repo.name);
            writeFileSync(cacheFile, JSON.stringify([...processedRepos]));
        }

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    } finally {
        outputStream.end();
    }
}

async function main() {
    const orgName = process.argv[2] || process.env.GITHUB_ORG;
    const token = process.env.GITHUB_TOKEN;

    if (!orgName || !token) {
        console.error('Please provide organization name and set GITHUB_TOKEN');
        process.exit(1);
    }

    await analyzeUserLanguages(orgName, token);
}

main();
