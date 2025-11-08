import mongoose from 'mongoose';

const githubIssueSchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubIssue', githubIssueSchema, 'github-issue');
