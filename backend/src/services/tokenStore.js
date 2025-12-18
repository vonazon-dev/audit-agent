import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
                console.error("Error reading token file, initializing fresh.", e);
            }
        }

        // Add timestamp to help identify freshness
        tokenData.updatedAt = new Date().toISOString();

        tokens[hubId] = tokenData;
        tokens['latest_hub_id'] = hubId; // Pointer to most recently auth'd account

        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
        console.log(`Token saved for Hub ID: ${hubId}`);
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
            console.error("Error reading token file", e);
        }
        return null;
    }
}
