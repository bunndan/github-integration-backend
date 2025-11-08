import mongoose from 'mongoose';

const githubRepositorySchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubRepository', githubRepositorySchema, 'github-repository');
