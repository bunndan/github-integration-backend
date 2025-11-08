import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import githubIntegration from '../models/githubIntegration.js';
import mongoose from 'mongoose';

dotenv.config();
const router = express.Router();
const clientId = process.env.GITHUB_CLIENT_ID;
const clientSecret = process.env.GITHUB_CLIENT_SECRET;
const redirectUri = process.env.GITHUB_CALLBACK_URL;


// AUTHENTICATE - Redirect user to GitHub OAuth
router.get('/auth', (req, res) => {
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user,repo,admin:org`;
    res.redirect(url);
});


// CALLBACK - Handles the GitHub callback. This gets run once OAuth is validated on Git's side, and then /callback is hit. It redirects to the front-end when complete.
router.get('/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        return res.status(400).json({ error: 'No code returned from GitHub' });
    }

    try {
        const tokenResponse = await axios.post(
            `https://github.com/login/oauth/access_token`,
            {
                client_id: clientId,
                client_secret: clientSecret,
                code,
                redirect_uri: redirectUri,
            },
            { headers: { Accept: 'application/json' } }
        );

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            return res.status(400).json({ error: 'OAuth failed: No access token' });
        }

        // Fetch the user info
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Store in MongoDB
        const integration = {
            connected: true,
            connectedAt: new Date(),
            user: userResponse.data,
            accessToken,
        };

        // Replace with the actual DB insert logic
        console.log('Saving integration:', integration);
        await githubIntegration.findOneAndUpdate(
            {},
            integration,
            { upsert: true, new: true }
        );
        console.log('Integration saved to DB');

        // Redirect back to Angular app
        res.redirect('http://localhost:4200/integration-status?success=true');
    } catch (error) {
        console.error('OAuth error:', error.response?.data || error.message);
        res.redirect('http://localhost:4200/integration-status?success=false'); // Currently doesn't change the front-end?
    }
});


// CHECK - this checks whether or not the current user is connected to GitHub and lets the front-end know (/api/github/status)
router.get('/status', async (req, res) => {
    try {
        const integration = await githubIntegration.findOne();

        if (!integration) {
            return res.json({
                connected: false,
                connectedAt: null,
                user: null,
            });
        }

        res.json({
            connected: integration.connected ?? !!integration.user,
            connectedAt: integration.connectedAt,
            user: integration.user,
        });
    } catch (err) {
        console.error('Error fetching integration status:', err);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});


// DELETE - Removes integration of the current user (/api/github/remove)
router.delete('/remove', async (req, res) => {
    try {
        const deleted = await githubIntegration.deleteOne({});
        console.log('Integration removed:', deleted);

        res.json({ success: true, message: 'Integration removed successfully' });
    } catch (err) {
        console.error('Error removing integration:', err);
        res.status(500).json({ success: false, message: 'Failed to remove integration' });
    }
});


// RESYNC - Grabs all of the user's GitHub information and then saves it to the MongoDB (/api/github/resync)
router.post('/resync', async (req, res) => {
    try {
        const integration = await githubIntegration.findOne();
        if (!integration || !integration.accessToken) {
            return res.status(400).json({ error: 'No active GitHub integration found.' });
        }

        const headers = { Authorization: `Bearer ${integration.accessToken}` };
        console.log('Starting GitHub re-sync...');

        // 1) Fetch user's organizations
        const orgs = await fetchAllPages('https://api.github.com/user/orgs', headers);
        const orgCount = await batchInsert('github-organizations', orgs);

        // 2) Fetch repos for each organization
        let repos = [];
        for (const org of orgs) {
            const orgRepos = await fetchAllPages(`https://api.github.com/orgs/${org.login}/repos`, headers);
            repos.push(...orgRepos);
        }
        const repoCount = await batchInsert('github-repositories', repos);

        // 3) Fetch commits, pulls, issues, changelogs, and users for each repo
        let commits = [];
        let pulls = [];
        let issues = [];
        let changelogs = [];
        let users = [];

        for (const repo of repos) {
            try {
                const baseUrl = `https://api.github.com/repos/${repo.owner.login}/${repo.name}`;

                // Fetch commits, pulls, issues. Current limit is set to 2000 commits and 500 for pulls and issues.
                const [repoCommits, repoPulls, repoIssues] = await Promise.all([
                    fetchAllPages(`${baseUrl}/commits`, headers, 2000),
                    fetchAllPages(`${baseUrl}/pulls`, headers, 500),
                    fetchAllPages(`${baseUrl}/issues`, headers, 500)
                ]);

                commits.push(...repoCommits);
                pulls.push(...repoPulls);
                issues.push(...repoIssues);

                // Fetch repo issue changelogs
                for (const issue of repoIssues) {
                    try {
                        const timeline = await fetchAllPages(`${baseUrl}/issues/${issue.number}/timeline`, headers, 500);
                        changelogs.push(...timeline);
                    } catch (err) {
                        console.warn(`Failed to fetch timeline for ${repo.name} #${issue.number}: ${err.message}`);
                    }
                }

                // Extract all users mentioned in the commits, pulls, and issues
                const extractUsers = (arr) => {
                    return arr
                        .map(item => {
                            if (item.user) return item.user;
                            if (item.author) return item.author;
                            return null;
                        })
                        .filter(user => user !== null);
                };
                users.push(...extractUsers(repoCommits));
                users.push(...extractUsers(repoPulls));
                users.push(...extractUsers(repoIssues));

            } catch (err) {
                console.warn(`Failed to fetch details for ${repo.full_name}: ${err.message}`);
            }
        }

        // Remove duplicate users based on their login
        const userMap = new Map();
        for (const user of users) {
            userMap.set(user.login, user); // adding to the same map will overwrites duplicates automatically due to unique map keys
        }
        const uniqueUsers = Array.from(userMap.values()); // this turns the map values back into a plain array

        // 4) Insert data into MongoDB. Do ti in separate batches.
        const commitCount = await batchInsert('github-commits', commits);
        const pullCount = await batchInsert('github-pulls', pulls);
        const issueCount = await batchInsert('github-issues', issues);
        const changelogCount = await batchInsert('github-issue-changelogs', changelogs);
        const userCount = await batchInsert('github-users', uniqueUsers);

        console.log('Re-sync complete:', {
            orgs: orgCount,
            repos: repoCount,
            commits: commitCount,
            pulls: pullCount,
            issues: issueCount,
            changelogs: changelogCount,
            users: userCount
        });

        res.json({ success: true, message: 'GitHub data re-synced successfully.' });

    } catch (err) {
        console.error('Error during re-sync:', err.message);
        res.status(500).json({ success: false, message: 'Failed to re-sync GitHub data.' });
    }
});


// GET - Grabs the list of collections (aka table) and sends all of it to the front-end (/api/github/collections)
router.get('/collections', async (req, res) => {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const names = collections
            .map(c => c.name)
            .filter(name => name.startsWith('github-'));
        res.json(names);
    } catch (err) {
        console.error('Error fetching collections:', err);
        res.status(500).json({ error: 'Failed to list collections.' });
    }
});


// GET - Gets the data of a specific, single collection (/api/github/collections/:collection)
router.get('/collections/:collection', async (req, res) => {
    const { collection } = req.params;
    try {
        const data = await mongoose.connection.db.collection(collection).find().toArray();
        res.json(data);
    } catch (err) {
        console.error(`Error fetching data for ${collection}:`, err);
        res.status(500).json({ error: `Failed to fetch data for ${collection}` });
    }
});


// Function to help fetch all pages safely. Set the current temp max item as 2000 so it doesn't take too long.
async function fetchAllPages(url, headers, maxItems = 2000, delayMs = 200) {
    let results = [];
    let page = 1;
    const per_page = 100;

    while (true) {
        const response = await axios.get(`${url}?per_page=${per_page}&page=${page}`, { headers });
        const data = response.data;

        if (!data || data.length === 0) break;

        results.push(...data);

        // Stop early if we hit the maxItems cap
        if (results.length >= maxItems) {
            console.warn(`Reached data cap (${maxItems}) for ${url}`);
            break;
        }

        // If there's no more data (aka current number is less than number to show per page), stop.
        if (data.length < per_page) break;

        await new Promise(resolve => setTimeout(resolve, delayMs));
        page++;
    }

    return results;
}


// Function to help insert data into collection/table in batches. Default size of 500.
async function batchInsert(collection, docs, batchSize = 500) {
    const db = mongoose.connection.db;
    if (!docs || docs.length === 0) {
        console.log(`No data to insert for ${collection}`);
        return 0;
    }

    await db.collection(collection).deleteMany({});
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        if (batch.length > 0) {
            await db.collection(collection).insertMany(batch);
        }
    }

    return docs.length;
}


export default router;
