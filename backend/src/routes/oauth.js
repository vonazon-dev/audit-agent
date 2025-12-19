import express from "express";
import axios from "axios";
import crypto from "crypto";
import { SCOPES, HUBSPOT_AUTH_URL, HUBSPOT_TOKEN_URL } from "../config/hubspot.js";
import { TokenStore } from "../services/tokenStore.js";

const router = express.Router();

// In-memory state storage for CSRF protection
// In production, use Redis or session store
const pendingStates = new Map();
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

router.get("/install", (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");

    // Store state with expiry for CSRF validation
    pendingStates.set(state, {
        createdAt: Date.now(),
        ip: req.ip
    });

    // Cleanup expired states
    for (const [key, value] of pendingStates.entries()) {
        if (Date.now() - value.createdAt > STATE_EXPIRY_MS) {
            pendingStates.delete(key);
        }
    }

    const authUrl =
        `${HUBSPOT_AUTH_URL}?client_id=${process.env.HUBSPOT_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(`${process.env.BASE_URL}/oauth/callback`)}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&state=${state}`;

    console.log("auth url", authUrl)
    res.redirect(authUrl);
});

router.get("/oauth/callback", async (req, res) => {
    const { code, state } = req.query;

    // CSRF Protection: Validate state parameter
    if (!state || !pendingStates.has(state)) {
        return res.status(403).json({
            error: "Invalid or expired state parameter. Please restart the OAuth flow."
        });
    }

    // Check state expiry
    const stateData = pendingStates.get(state);
    if (Date.now() - stateData.createdAt > STATE_EXPIRY_MS) {
        pendingStates.delete(state);
        return res.status(403).json({
            error: "State expired. Please restart the OAuth flow."
        });
    }

    // Consume the state (one-time use)
    pendingStates.delete(state);

    if (!code) {
        return res.status(400).json({ error: "Missing authorization code" });
    }

    try {
        const tokenRes = await axios.post(
            HUBSPOT_TOKEN_URL,
            new URLSearchParams({
                grant_type: "authorization_code",
                client_id: process.env.HUBSPOT_CLIENT_ID,
                client_secret: process.env.HUBSPOT_CLIENT_SECRET,
                redirect_uri: `${process.env.BASE_URL}/oauth/callback`,
                code
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const hub_id = tokenRes.data.hub_id;

        // Save to Store (includes refresh_token for token refresh)
        await TokenStore.saveToken(hub_id, {
            access_token: tokenRes.data.access_token,
            refresh_token: tokenRes.data.refresh_token,
            expires_in: tokenRes.data.expires_in,
            expires_at: Date.now() + (tokenRes.data.expires_in * 1000)
        });

        // Security: Never expose tokens to frontend
        // Only return non-sensitive confirmation data
        res.json({
            success: true,
            hub_id: hub_id,
            message: "HubSpot account connected successfully."
        });
    } catch (err) {
        console.error("OAuth token exchange failed:", err.response?.status || err.message);
        res.status(500).json({ error: "OAuth failed. Please try again." });
    }
});

export default router;
