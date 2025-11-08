import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Base URL for GitHub OAuth
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth';

export const getAuthUrl = () => {
    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
        scope: 'repo user admin:org read:org',
    });

    // Return the full authorization URL for GitHub OAuth
    return `${GITHUB_OAUTH_URL}/authorize?${params.toString()}`;
};

export const getAccessToken = async (code) => {
    const params = {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
    };

    try {
        // Send a POST request to get the access token
        const response = await axios.post(`${GITHUB_OAUTH_URL}/access_token`, params, {
            headers: { Accept: 'application/json' },
        });

        // Return the response data. It should include the access token and other info.
        return response.data;
    } catch (error) {
        // Handle any errors during the request
        console.error('Error getting access token:', error.response?.data || error.message);
        throw error;  // Re-throw to be handled by the caller
    }
};
