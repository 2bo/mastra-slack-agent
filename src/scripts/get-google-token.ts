import { exec } from 'child_process';
import 'dotenv/config';
import { google } from 'googleapis';
import http from 'http';
import url from 'url';

/**
 * Usage:
 * 1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env or pass them as env vars.
 * 2. Run: npx tsx src/scripts/get-google-token.ts
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith('/oauth2callback')) {
      const q = url.parse(req.url, true).query;
      const code = q.code as string;

      if (code) {
        console.log('Code received. Exchanging for tokens...');
        const { tokens } = await oauth2Client.getToken(code);

        console.log('\nSUCCESS! Here is your Refresh Token:\n');
        console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('\n(Copy this to your .env file)\n');

        res.end('Authentication successful! You can close this window and check your terminal.');

        server.close(() => {
          process.exit(0);
        });
      } else {
        res.end('Error: No code received.');
      }
    } else {
      res.end('Not found');
    }
  } catch (e) {
    console.error(e);
    res.end('Authentication failed');
  }
});

server.listen(3000, () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Crucial for receiving refresh token
    scope: SCOPES,
    prompt: 'consent', // Force consent to ensure refresh token is returned
  });

  console.log('Listening on http://localhost:3000');
  console.log('Opening browser to:', authUrl);

  // Try to open browser automatically
  exec(`open "${authUrl}"`, (err) => {
    if (err) {
      console.log('Failed to open browser automatically. Please click the link above.');
    }
  });
});
