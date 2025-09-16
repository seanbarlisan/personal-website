import {
    SecretsManagerClient,
    GetSecretValueCommand,
    UpdateSecretCommand
} from "@aws-sdk/client-secrets-manager";

import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const port = 3000;

const secret_name = "spotify_recently_listened_web_api_secrets";
const client = new SecretsManagerClient({
region: "us-east-1",
});

let response;
let secrets;
let accessToken;
let refreshToken;

try {
response = await client.send(
    new GetSecretValueCommand({
    SecretId: secret_name,
    VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
    })
);

// Parse the secret string as JSON
secrets = JSON.parse(response.SecretString);
} catch (error) {
// For a list of exceptions thrown, see
// https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
console.error("Error retrieving secrets:", error);
throw error;
}

// Extract the secrets from the parsed JSON
const CLIENT_ID = secrets.client_id;
const CLIENT_SECRET = secrets.client_secret;
const REFRESH_TOKEN = secrets.refresh_token; // This isn't needed for the initial token request but is for refreshing
const ACCESS_TOKEN = secrets.access_token; // Not strictly necessary, but can be used if you want to start with a valid token
const REDIRECT_URI = "http://127.0.0.1:3000/callback";

let storedRefreshToken = REFRESH_TOKEN; // Start with the one from AWS Secrets
let tokenExpiryTime = 0; // Track when token expires

const authUrl = `https://accounts.spotify.com/authorize?` +
                `client_id=${CLIENT_ID}&` +
                `response_type=code&` +
                `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
                `scope=${encodeURIComponent("user-read-private user-read-email")}`;

                // Modified refresh function that uses the current refresh token
                
async function getSecrets() {
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secret_name,
                VersionStage: "AWSCURRENT",
            })
        );
        return JSON.parse(response.SecretString);
    } catch (error) {
        console.error("Error retrieving secrets:", error);
        throw error;
    }
}

async function initializeSecretsAndTokens() {
    try {
        secrets = await getSecrets();
        const CLIENT_ID = secrets.client_id;
        const CLIENT_SECRET = secrets.client_secret;
        storedRefreshToken = secrets.refresh_token;

        // Try to refresh the token on startup using the stored refresh token
        if (storedRefreshToken) {
            console.log("Found refresh token on startup, attempting to get a new access token.");
            await refreshAccessToken();
        } else {
            console.log("No refresh token found. User must log in.");
        }
    } catch (error) {
        console.error("Failed to initialize secrets or refresh token on startup:", error);
    }
}

async function refreshAccessToken() {
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: storedRefreshToken
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(secrets.client_id + ':' + secrets.client_secret).toString('base64'))
            }
        });

        accessToken = response.data.access_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);

        if (response.data.refresh_token) {
            storedRefreshToken = response.data.refresh_token;
            storedAccessToken = response.data.access_token;
            const newSecrets = {
                ...secrets, // Keep other secrets
                refresh_token: storedRefreshToken,
                access_token: storedAccessToken
            };
            const command = new UpdateSecretCommand({
                SecretId: secret_name,
                SecretString: JSON.stringify(newSecrets)
            });
            await client.send(command);
            console.log("Updated refresh token in AWS Secrets Manager.");
        }

        console.log("Access token refreshed, expires at:", new Date(tokenExpiryTime));
        return accessToken;
    } catch (error) {
        console.error("Failed to refresh token:", error.response?.data || error.message);
        storedRefreshToken = null; // Clear token if refresh fails
        throw error;
    }
}


// Helper function to check if token is expired or about to expire
function isTokenExpired() {
    return !accessToken || Date.now() >= (tokenExpiryTime - 60000); // Refresh 1 minute early
}

app.use(cors());

app.get('/login', (req, res) => {
    const scopes = 'user-read-recently-played';
    res.redirect('https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + CLIENT_ID +
        '&scope=' + encodeURIComponent(scopes) +
        '&redirect_uri=' + encodeURIComponent(REDIRECT_URI));

    console.log("Redirecting to Spotify for authorization...");
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });
        
        accessToken = response.data.access_token;
        storedRefreshToken = response.data.refresh_token; // Store the new refresh token
        
        // Corrected updateSecret logic
        const newSecrets = {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: storedRefreshToken // Update the refresh token
        };

        const command = new UpdateSecretCommand({
            SecretId: secret_name,
            SecretString: JSON.stringify(newSecrets)
        });

        await client.send(command);
        console.log("Updated refresh token in AWS Secrets Manager after callback.");
        
        tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);
        
        console.log("Access Token:", accessToken);
        res.send('Authorization successful! Tokens have been stored.');
    } catch (error) {
        console.error("Token exchange error:", error);
        res.status(500).send('Failed to get tokens.');
    }
});

// Simplified API endpoint that automatically handles tokens
app.get('/api/spotify-recently-listened', async (req, res) => {
    try {
        // Check if token needs refreshing
        if (!accessToken || isTokenExpired()) {
            console.log("Token expired or missing, refreshing...");
            await refreshAccessToken();
        }
        
        const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        
        const track = response.data.items[0].track;
        const processedData = {
            title: track.name,
            artist: track.artists[0].name,
            albumArt: track.album.images[0].url
        };
        res.json(processedData);
        
    } catch (error) {
        console.error("API Error:", error.response?.data || error.message);
        
        if (error.response?.status === 401) {
            res.status(401).json({ 
                error: 'Authentication required. Please visit /login to re-authenticate.' 
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to fetch music data.' 
            });
        }
    }
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

async function initializeTokens() {
    if (!accessToken && storedRefreshToken) {
        try {
            console.log("Initializing tokens on startup...");
            await refreshAccessToken();
        } catch (error) {
            console.log("Could not refresh token on startup, login may be required");
        }
    }
}

// Call this when server starts
initializeTokens();

app.listen(port, async () => {
    console.log(`Server listening at http://127.0.0.1:${port}`);
    await initializeSecretsAndTokens();
});

