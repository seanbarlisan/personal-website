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
const REDIRECT_URI = "http://127.0.0.1:5500";

const authUrl = `https://accounts.spotify.com/authorize?` +
                `client_id=${CLIENT_ID}&` +
                `response_type=code&` +
                `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
                `scope=${encodeURIComponent("user-read-private user-read-email")}`;

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
                'Authorization': 'Basic ' + (new Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'))
            }
        });
        accessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;
        console.log("Access Token:", accessToken);
        res.send('Authorization successful! You can now access your music data.');
    } catch (error) {
        res.send('Failed to get tokens.');
    }
});

app.get('/api/spotify-recently-listened', async (req, res) => {
    try {
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
        // Handle token expiration by refreshing it
        if (error.response.status === 401 && refreshToken) {
            // (Note: This is a simplified example. You'd need a more robust refresh token implementation.)
            // The logic to use the refresh token to get a new access token would go here.
            res.status(500).send('Access token expired. Please re-authenticate.');
        } else {
            res.status(500).send('Failed to fetch music data.');
        }
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://127.0.0.1:${port}`);
});