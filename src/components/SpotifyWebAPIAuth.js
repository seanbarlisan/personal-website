// Need to implement the access token call from the backend
// Need to move the AWS Secrets Manager code to a separate file or function on the backend because it will not work on the client browser
// Need to finish the JSON separation and display logic for the Spotify data
// Need to adjust information for other code etc..
// Good example https://github.com/phillip-che/phillipche-site/blob/main/src/hooks/useSpotifyAuth.ts

import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

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

// This variable is not a final access token; it's the URL for the user to authorize your app.
// The actual access token is obtained in the function below.

const authUrl = `https://accounts.spotify.com/authorize?` +
                `client_id=${CLIENT_ID}&` +
                `response_type=code&` +
                `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
                `scope=${encodeURIComponent("user-read-private user-read-email")}`;

// This function would be called after the user is redirected back to your application with a 'code' in the URL.
// For example, if the URL is http://127.0.0.1:8080/?code=AQC_..., you would extract the code.

async function fetchAccessToken(code) {
    const tokenUrl = "https://accounts.spotify.com/api/token";
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
    });

    try {
        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // The API returns the access token and other details here.
        const ACCESS_TOKEN = data.access_token;
        const REFRESH_TOKEN = data.refresh_token;

        console.log("Successfully obtained access token:", ACCESS_TOKEN);
        console.log("Refresh token:", REFRESH_TOKEN);
        
        return ACCESS_TOKEN;

    } catch (error) {
        console.error("Error fetching access token:", error);
        throw error;
    }
}