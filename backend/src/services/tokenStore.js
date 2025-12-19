import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { HUBSPOT_TOKEN_URL } from '../config/hubspot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const TOKEN_FILE = path.join(DATA_DIR, 'tokens.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class TokenStore {
    static getFilePath() {
        return TOKEN_FILE;
    }

    static async saveToken(hubId, tokenData) {
        let tokens = {};
        if (fs.existsSync(TOKEN_FILE)) {
            try {
                tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            } catch (e) {
                console.error("Error reading token file, initializing fresh.");
            }
        }

        // Add timestamp to help identify freshness
        tokenData.updatedAt = new Date().toISOString();

        tokens[hubId] = tokenData;
        tokens['latest_hub_id'] = hubId; // Pointer to most recently auth'd account

        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    }

    static async getToken(hubId) {
        if (!fs.existsSync(TOKEN_FILE)) return null;
        try {
            const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));

            // If no hubId specified, try to use the latest one
            if (!hubId) {
                hubId = tokens['latest_hub_id'];
            }

            if (hubId && tokens[hubId]) {
                return {
                    hub_id: hubId,
                    ...tokens[hubId]
                };
            }
        } catch (e) {
            console.error("Error reading token file");
        }
        return null;
    }

    /**
     * Refresh an expired access token using the refresh token
     * @param {string} hubId - The HubSpot portal ID
     * @returns {Promise<Object>} - Updated token data
     */
    static async refreshToken(hubId) {
        const stored = await this.getToken(hubId);
        if (!stored || !stored.refresh_token) {
            throw new Error("No refresh token available");
        }

        const response = await axios.post(
            HUBSPOT_TOKEN_URL,
            new URLSearchParams({
                grant_type: "refresh_token",
                client_id: process.env.HUBSPOT_CLIENT_ID,
                client_secret: process.env.HUBSPOT_CLIENT_SECRET,
                refresh_token: stored.refresh_token
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const newTokenData = {
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_in: response.data.expires_in,
            expires_at: Date.now() + (response.data.expires_in * 1000)
        };

        await this.saveToken(hubId, newTokenData);
        return newTokenData;
    }
}
