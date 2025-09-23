import {
    SecretsManagerClient,
    GetSecretValueCommand,
    UpdateSecretCommand
} from "@aws-sdk/client-secrets-manager";
import axios from 'axios';

const secret_name = "spotify_recently_listened_web_api_secrets";
const client = new SecretsManagerClient({ region: "us-east-1" });

let secrets;
let accessToken;
let refreshToken;
let tokenExpiryTime = 0;

async function getSecrets() {
    console.log("Fetching secrets from AWS Secrets Manager");
    try {
        const response = await client.send(
            new GetSecretValueCommand({
                SecretId: secret_name,
                VersionStage: "AWSCURRENT",
            })
        );
        console.log("Secrets fetched successfully");
        return JSON.parse(response.SecretString);
    } catch (error) {
        console.error("Error fetching secrets:", error);
        throw error;
    }
}

async function refreshAccessToken() {
    console.log("Refreshing access token");
    try {
        const response = await axios({
            method: 'post',
            url: 'https://accounts.spotify.com/api/token',
            data: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: secrets.refresh_token
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + (Buffer.from(secrets.client_id + ':' + secrets.client_secret).toString('base64'))
            }
        });

        console.log("Token refresh response status:", response.status);
        accessToken = response.data.access_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);

        if (response.data.refresh_token) {
            secrets.refresh_token = response.data.refresh_token;
            secrets.access_token = response.data.access_token;
            await client.send(new UpdateSecretCommand({
                SecretId: secret_name,
                SecretString: JSON.stringify(secrets)
            }));
            console.log("Secrets updated successfully");
        }
        console.log("Access token refreshed successfully");
    } catch (error) {
        console.error("Error refreshing token:", error.response?.data || error.message);
        throw error;
    }
}

function isTokenExpired() {
    if (!accessToken) {
        return true;
    }
    
    if (!tokenExpiryTime || tokenExpiryTime === 0) {
        return true;
    }
    
    const expired = Date.now() >= (tokenExpiryTime - 60000);
    return expired;
}

export const handler = async (event) => {
    console.log("Lambda function started");
    console.log("Event:", JSON.stringify(event, null, 2));
    
    // Handle OPTIONS request for CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        console.log("Handling OPTIONS request");
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "https://seanbarlisan.github.io",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            },
            body: ''
        };
    }

    try {
        secrets = await getSecrets();

        if (!secrets.refresh_token || !secrets.client_id || !secrets.client_secret) {
            throw new Error("Missing required secrets");
        }
        
        accessToken = secrets.access_token;
        refreshToken = secrets.refresh_token;

        if (isTokenExpired()) {
            await refreshAccessToken();
        } else {
            console.log("Access token is still valid");
        }

        let spotifyResponse;
        try {
            spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
                headers: {
                    'Authorization': 'Bearer ' + accessToken
                },
                params: {
                    limit: 1 // Need to update in the future to include more than 1 track
                }
            });
        } catch (error) {
            if (error.response?.status === 401) {
                console.log("Got 401, refreshing token and retrying...");
                await refreshAccessToken();
                spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
                    headers: {
                        'Authorization': 'Bearer ' + accessToken
                    },
                    params: {
                        limit: 1 // Need to update in the future to include more than 1 track
                    }
                });
            } else {
                throw error; // Re-throw if it's not a 401
            }
        }

        if (!spotifyResponse.data.items || spotifyResponse.data.items.length === 0) {
            throw new Error("No recently played tracks found");
        }

        const track = spotifyResponse.data.items[0].track;

        if (!track || !track.name || !track.artists || !track.artists[0] || !track.album || !track.album.images || !track.album.images[0]) {
            console.error("Invalid track data structure:", JSON.stringify(track, null, 2));
            throw new Error("Invalid track data structure");
        }

        const processedData = {
            title: track.name,
            artist: track.artists[0].name,
            albumArt: track.album.images[0].url
        };

        console.log("Processed data:", processedData);

        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "https://seanbarlisan.github.io",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            },
            body: JSON.stringify(processedData)
        };

    } catch (error) {
        console.error("=== DETAILED ERROR INFO ===");
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        
        if (error.response) {
            console.error("HTTP Response Status:", error.response.status);
            console.error("HTTP Response Data:", error.response.data);
            console.error("HTTP Response Headers:", error.response.headers);
        }
        
        let errorMessage = 'Failed to fetch music data.';
        if (error.message.includes('secrets')) {
            errorMessage = 'Configuration error - check secrets.';
        } else if (error.response?.status === 401) {
            errorMessage = 'Spotify authentication failed.';
        } else if (error.response?.status === 429) {
            errorMessage = 'Spotify rate limit exceeded.';
        } else if (error.message.includes('No recently played')) {
            errorMessage = 'No recently played tracks found.';
        }

        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "https://seanbarlisan.github.io",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "GET, OPTIONS"
            },
            body: JSON.stringify({ 
                error: errorMessage,
                details: error.message // Include for debugging
            })
        };
    }
};