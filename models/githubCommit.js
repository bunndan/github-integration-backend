import mongoose from 'mongoose';

const githubCommitSchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubCommit', githubCommitSchema, 'github-commit');
