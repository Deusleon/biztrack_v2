#!/usr/bin/env node
/**
 * One-time helper: obtain a Google Drive REFRESH TOKEN for BizTrack backups.
 *
 * Run this on YOUR OWN COMPUTER (it opens a browser login):
 *
 *   node scripts/getGoogleRefreshToken.js
 *
 * It will ask for your OAuth Client ID and Client Secret (from Google Cloud
 * Console), open a Google sign-in link, and print the refresh token to paste
 * into BizTrack -> Settings -> Integrations -> Google Drive Backup.
 */

const http = require("http");
const readline = require("readline");

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

async function main() {
  console.log("=== BizTrack: Google Drive refresh token helper ===\n");

  const clientId = process.env.GOOGLE_CLIENT_ID || (await ask("OAuth Client ID: "));
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || (await ask("OAuth Client Secret: "));
  if (!clientId || !clientSecret) {
    console.error("Client ID and Client Secret are required.");
    process.exit(1);
  }

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent", // force a refresh token even if previously authorized
    }).toString();

  console.log("\n1) Open this link in your browser and sign in with the Google");
  console.log("   account whose Drive should receive the backups:\n");
  console.log(authUrl);
  console.log("\n2) Approve access. You will be redirected back here automatically.\n");

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (authCode) {
        res.end("<h2>BizTrack: authorization received. You can close this tab and return to the terminal.</h2>");
        server.close();
        resolve(authCode);
      } else {
        res.end(`<h2>Authorization failed: ${error || "no code received"}</h2>`);
        if (error) {
          server.close();
          reject(new Error(error));
        }
      }
    });
    server.listen(PORT, () => console.log(`Waiting for Google redirect on ${REDIRECT_URI} ...`));
    server.on("error", reject);
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.refresh_token) {
    console.error("\nToken exchange failed:", JSON.stringify(tokens, null, 2));
    console.error("\nTip: if there is no refresh_token, remove the app's previous access at");
    console.error("https://myaccount.google.com/permissions and run this script again.");
    process.exit(1);
  }

  console.log("\n=== SUCCESS ===\n");
  console.log("Paste these into BizTrack -> Settings -> Integrations -> Google Drive Backup:\n");
  console.log(`  Client ID:      ${clientId}`);
  console.log(`  Client Secret:  ${clientSecret}`);
  console.log(`  Refresh Token:  ${tokens.refresh_token}\n`);
  console.log("Keep the refresh token SECRET — anyone with it can access the backup folder.");
  rl.close();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
