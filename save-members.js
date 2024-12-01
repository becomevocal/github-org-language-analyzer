import { Octokit } from '@octokit/rest';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import dotenv from 'dotenv';

dotenv.config();

async function saveMembersToSQLite(orgName, token) {
    const octokit = new Octokit({ auth: token });
    const db = await open({
        filename: './output/github_stats.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS organization_members (
            id INTEGER PRIMARY KEY,
            login TEXT UNIQUE,
            name TEXT,
            email TEXT,
            company TEXT,
            location TEXT,
            bio TEXT,
            avatar_url TEXT,
            html_url TEXT,
            type TEXT,
            site_admin BOOLEAN,
            created_at DATETIME,
            updated_at DATETIME,
            last_synced DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const members = await octokit.paginate(octokit.rest.orgs.listMembers, {
        org: orgName,
        per_page: 100
    });

    for (const member of members) {
        const { data: user } = await octokit.rest.users.getByUsername({
            username: member.login
        });

        await db.run(`
            INSERT OR REPLACE INTO organization_members 
            (id, login, name, email, company, location, bio, avatar_url, html_url, type, site_admin, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            user.id,
            user.login,
            user.name,
            user.email,
            user.company,
            user.location,
            user.bio,
            user.avatar_url,
            user.html_url,
            user.type,
            user.site_admin ? 1 : 0,
            user.created_at,
            user.updated_at
        ]);
        
        console.log(`Processed member: ${user.login}`);
    }

    await db.close();
    console.log(`Saved ${members.length} members to database`);
}

async function main() {
    const orgName = process.argv[2] || process.env.GITHUB_ORG;
    const token = process.env.GITHUB_TOKEN;

    if (!orgName || !token) {
        console.error('Please provide organization name and set GITHUB_TOKEN');
        process.exit(1);
    }

    await saveMembersToSQLite(orgName, token);
}

main().catch(console.error);
