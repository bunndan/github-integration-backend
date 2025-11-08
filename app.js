import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import githubRoutes from './routes/githubRoutes.js';
import mongoose from 'mongoose';

dotenv.config();

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('MongoDB Connected'))
    .catch((err) => console.error('MongoDB Connection Error:', err));

const app = express();

// Enable CORS as the front-end is at a different port
app.use(cors({ origin: 'http://localhost:4200', credentials: true }));
app.use(express.json());

// Register routes
app.use('/api/github', githubRoutes);

// Have the default set to 3000 if the PORT isn't set in .env
const PORT = process.env.PORT || 3000;
app.listen(process.env.PORT || 3000, () =>
    console.log(`Server running on http://localhost:${PORT}`)
);
