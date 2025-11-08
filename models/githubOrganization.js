import mongoose from 'mongoose';

const githubOrganizationSchema = new mongoose.Schema({

}, { strict: false });
export default mongoose.model('GithubOrganization', githubOrganizationSchema, 'github-organizations');
