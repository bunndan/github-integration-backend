import mongoose from 'mongoose';

const githubIssueChangelogSchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubIssueChangelog', githubIssueChangelogSchema, 'github-issue-changelog');
