/**
 * Gmail Client - Version independiente (sin Replit)
 *
 * Usa credenciales OAuth2 de Google directamente mediante variables de entorno:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *
 * Para obtener estas credenciales:
 * 1. Ve a https://console.cloud.google.com/
 * 2. Crea un proyecto (o usa uno existente)
 * 3. Habilita la Gmail API
 * 4. Crea credenciales OAuth2 (tipo "Aplicacion de escritorio")
 * 5. Usa el script scripts/get-gmail-token.mjs para obtener el refresh_token
 */

import { google } from "googleapis";

export async function getAccessToken(): Promise<string> {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
                "Gmail OAuth2 credentials not configured. " +
                  "Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables. " +
                  "Run: node scripts/get-gmail-token.mjs to obtain them.",
              );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { token } = await oauth2Client.getAccessToken();
    if (!token) {
          throw new Error("Failed to get Gmail access token from refresh token");
    }

  return token;
}

export async function getUncachableGmailClient() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
                "Gmail OAuth2 credentials not configured. " +
                  "Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables.",
              );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
