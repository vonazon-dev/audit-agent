import express from "express";
import axios from "axios";
import crypto from "crypto";
import { SCOPES, HUBSPOT_AUTH_URL, HUBSPOT_TOKEN_URL } from "../config/hubspot.js";

const router = express.Router();

router.get("/install", (req, res) => {
    const state = crypto.randomBytes(16).toString("hex");

    const authUrl =
        `${HUBSPOT_AUTH_URL}?client_id=${process.env.HUBSPOT_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(`${process.env.BASE_URL}/oauth/callback`)}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&state=${state}`;

    res.redirect(authUrl);
});

router.get("/oauth/callback", async (req, res) => {
    const { code } = req.query;

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

        res.json({
            success: true,
            hub_id: tokenRes.data.hub_id
        });
    } catch (err) {
        res.status(500).json({ error: "OAuth failed" });
    }
});

export default router;
