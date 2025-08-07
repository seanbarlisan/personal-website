// Need to implement the frontend script for the JS on the index.html where it calls the custom endpoint and gets the data from the backend from the spotify blah
// Need to move the AWS Secrets Manager code to a separate file or function on the backend because it will not work on the client browser
// Need to finish the JSON separation and display logic for the Spotify data
// Need to adjust information for other code etc..

import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import express from 'express';
import axios from 'axios';

const app = express();
const port = 3000;

// Declare token variables at the top
let accessToken;
let refreshToken;

const secret_name = "spotify_recently_listened_web_api_secrets";
const client = new SecretsManagerClient({
    region: "us-east-1",
});

let response;
let secrets;

try {
    response = await client.send(
        new GetSecretValueCommand({
            SecretId: secret_name,
            VersionStage: "AWSCURRENT", // VersionStage defaults to AWSCURRENT if unspecified
        })
    );

    secrets = JSON.parse(response.SecretString);
} catch (error) {
    console.error("Error retrieving secrets:", error);
    throw error;
}

const CLIENT_ID = secrets.client_id;
const CLIENT_SECRET = secrets.client_secret;
const REFRESH_TOKEN = secrets.refresh_token; 
const REDIRECT_URI = "http://127.0.0.1:3000/callback";

app.get('/login', (req, res) => {
    const scopes = 'user-read-recently-played user-read-private';
    res.redirect('https://accounts.spotify.com/authorize' +
        '?response_type=code' +
        '&client_id=' + CLIENT_ID +
        '&scope=' + encodeURIComponent(scopes) +
        '&redirect_uri=' + encodeURIComponent(REDIRECT_URI));

    console.log("Redirecting to Spotify for authorization...");
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    
    if (!code) {
        return res.send('No authorization code received.');
    }
    
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
                'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            }
        });
        
        accessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;
        console.log("Access Token received successfully");
        res.send('Authorization successful! You can now access your music data.');
    } catch (error) {
        console.error('Token exchange failed:', error.response?.data || error.message);
        res.send(`Failed to get tokens: ${error.response?.data?.error_description || error.message}`);
    }
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/api/spotify-recently-listened', async (req, res) => {
    if (!accessToken) {
        return res.status(401).json({ error: 'No access token available. Please authenticate first.' });
    }

    try {
        const response = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });
        
        if (!response.data.items || response.data.items.length === 0) {
            return res.json({ message: 'No recently played tracks found.' });
        }
        
        const track = response.data.items[0].track;
        const processedData = {
            title: track.name,
            artist: track.artists[0].name,
            albumArt: track.album.images[0]?.url || null
        };
        res.json(processedData);
    } catch (error) {
        console.error('Spotify API error:', error.response?.data || error.message);
        
        // Handle token expiration by refreshing it
        if (error.response?.status === 401 && refreshToken) {
            // Note: This is a simplified example. You'd need a more robust refresh token implementation.
            // The logic to use the refresh token to get a new access token would go here.
            res.status(401).json({ error: 'Access token expired. Please re-authenticate.' });
        } else {
            res.status(500).json({ error: 'Failed to fetch music data.' });
        }
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://127.0.0.1:${port}`);
});