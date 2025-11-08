import mongoose from 'mongoose';

const githubIntegrationSchema = new mongoose.Schema({
  accessToken: String,
  tokenType: String,
  scope: String,
  user: Object,
  connectedAt: { type: Date, default: Date.now }
});

export default mongoose.model('githubIntegration', githubIntegrationSchema, 'github-integration');
