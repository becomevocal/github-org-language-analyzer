import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { parse } from 'csv-parse/sync';
import { readFileSync, readdirSync } from 'fs';

async function loadCSVToSQLite(csvFile) {
    const db = await open({
        filename: './output/github_stats.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS github_language_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user TEXT,
            repository TEXT,
            language TEXT,
            lines_added INTEGER,
            lines_removed INTEGER,
            pr_count INTEGER,
            date_range_start DATE,
            date_range_end DATE,
            UNIQUE(user, repository, language, date_range_start, date_range_end)
        )
    `);

    const fileContent = readFileSync(csvFile, 'utf8');
    const records = parse(fileContent, { 
        columns: true,
        skip_empty_lines: true
    });

    const stmt = await db.prepare(`
        INSERT OR REPLACE INTO github_language_stats 
        (user, repository, language, lines_added, lines_removed, pr_count, date_range_start, date_range_end)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const record of records) {
        await stmt.run(
            record.User,
            record.Repository,
            record.Language,
            parseInt(record.LinesAdded),
            parseInt(record.LinesRemoved),
            parseInt(record.PRCount),
            record.DateRangeStart,
            record.DateRangeEnd
        );
    }

    await stmt.finalize();
    await db.close();
}

async function main() {
    const csvFile = process.argv[2];
    if (!csvFile) {
        console.error('Please provide CSV filename as argument\n');
        console.log('Available CSV files:');
        const files = readdirSync('./output')
            .filter(file => file.endsWith('.csv'))
            .map(file => `  ${file}`)
            .join('\n');
        console.log(files || '  No CSV files found');
        process.exit(1);
    }

    await loadCSVToSQLite(`./output/${csvFile}`);
    console.log('Data loaded successfully');
}

main().catch(console.error);
