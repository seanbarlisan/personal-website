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
    const response = await client.send(
        new GetSecretValueCommand({
            SecretId: secret_name,
            VersionStage: "AWSCURRENT",
        })
    );
    return JSON.parse(response.SecretString);
}

async function refreshAccessToken() {
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

    accessToken = response.data.access_token;
    tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);

    if (response.data.refresh_token) {
        secrets.refresh_token = response.data.refresh_token;
        secrets.access_token = response.data.access_token;
        await client.send(new UpdateSecretCommand({
            SecretId: secret_name,
            SecretString: JSON.stringify(secrets)
        }));
    }
}

function isTokenExpired() {
    return !accessToken || Date.now() >= (tokenExpiryTime - 60000);
}

export const handler = async (event) => {
    try {
        secrets = await getSecrets();
        accessToken = secrets.access_token;
        refreshToken = secrets.refresh_token;

        if (isTokenExpired()) {
            await refreshAccessToken();
        }

        const spotifyResponse = await axios.get('https://api.spotify.com/v1/me/player/recently-played', {
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        const track = spotifyResponse.data.items[0].track;
        const processedData = {
            title: track.name,
            artist: track.artists[0].name,
            albumArt: track.album.images[0].url
        };

        return {
            statusCode: 200,
            body: JSON.stringify(processedData)
        };
    } catch (error) {
        console.error("API Error:", error.response?.data || error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch music data.' })
        };
    }
};

