import mongoose from 'mongoose';

const githubPullSchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubPull', githubPullSchema, 'github-pull');
