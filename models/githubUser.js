import mongoose from 'mongoose';

const githubUserSchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubUser', githubUserSchema, 'github-user');
