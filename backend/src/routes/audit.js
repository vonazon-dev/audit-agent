import express from "express";
import { HubSpotClient } from "../services/hubspotClient.js";
import { DataQualityEngine } from "../services/dataQualityEngine.js";
import { TokenStore } from "../services/tokenStore.js";
import { AgentService } from "../services/agentService.js";

const router = express.Router();

/**
 * Helper to get valid access token, refreshing if necessary
 */
async function getValidToken(hub_id) {
    if (!hub_id) {
        return { error: "Missing hub_id", status: 400 };
    }

    const stored = await TokenStore.getToken(hub_id);
    if (!stored) {
        return { error: "No stored token found. Please reconnect HubSpot.", status: 401 };
    }

    // Check if token needs refresh (with 5 minute buffer)
    const needsRefresh = stored.expires_at && (Date.now() > stored.expires_at - 5 * 60 * 1000);

    if (needsRefresh && stored.refresh_token) {
        try {
            const refreshed = await TokenStore.refreshToken(hub_id);
            return { access_token: refreshed.access_token, hub_id };
        } catch (err) {
            console.error("Token refresh failed:", err.message);
            return { error: "Session expired. Please reconnect HubSpot.", status: 401 };
        }
    }

    return { access_token: stored.access_token, hub_id };
}

/**
 * Non-streaming audit endpoint (original behavior)
 */
router.post("/audit", async (req, res) => {
    try {
        const { hub_id } = req.body;

        const tokenResult = await getValidToken(hub_id);
        if (tokenResult.error) {
            return res.status(tokenResult.status).json({ error: tokenResult.error });
        }

        // 1. Fetch Data
        const hubSpotClient = new HubSpotClient(tokenResult.access_token);

        // Parallel fetching for performance
        const [contacts, companies, deals] = await Promise.all([
            hubSpotClient.fetchAllContacts(),
            hubSpotClient.fetchAllCompanies(),
            hubSpotClient.fetchAllDeals()
        ]);

        // 2. Deterministic Audit (Phase 3 Core)
        const engine = new DataQualityEngine(contacts, companies, deals);
        const facts = engine.runAudit();

        // 3. Agent Orchestration (LangChain-powered)
        const agentService = new AgentService(process.env.OPENAI_API_KEY);
        const aiOutput = await agentService.runExecutiveAgent(facts);

        // 4. Return Final Combined Response
        res.json({
            hub_id: tokenResult.hub_id,
            audit_facts: facts,
            ai_interpretation: aiOutput
        });

    } catch (error) {
        console.error("Audit processing failed:", error.message);
        res.status(500).json({
            error: "Audit failed",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
});

/**
 * Streaming audit endpoint - returns AI analysis in real-time via SSE
 */
router.post("/audit/stream", async (req, res) => {
    try {
        const { hub_id } = req.body;

        const tokenResult = await getValidToken(hub_id);
        if (tokenResult.error) {
            return res.status(tokenResult.status).json({ error: tokenResult.error });
        }

        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // 1. Fetch Data
        const hubSpotClient = new HubSpotClient(tokenResult.access_token);
        res.write(`data: ${JSON.stringify({ status: "fetching", message: "Fetching HubSpot data..." })}\n\n`);

        const [contacts, companies, deals] = await Promise.all([
            hubSpotClient.fetchAllContacts(),
            hubSpotClient.fetchAllCompanies(),
            hubSpotClient.fetchAllDeals()
        ]);

        // 2. Deterministic Audit
        res.write(`data: ${JSON.stringify({ status: "analyzing", message: "Running data quality analysis..." })}\n\n`);
        const engine = new DataQualityEngine(contacts, companies, deals);
        const facts = engine.runAudit();

        // Send facts immediately
        res.write(`data: ${JSON.stringify({ status: "facts", audit_facts: facts })}\n\n`);

        // 3. Agent Orchestration with Streaming
        res.write(`data: ${JSON.stringify({ status: "generating", message: "AI generating executive summary..." })}\n\n`);
        const agentService = new AgentService(process.env.OPENAI_API_KEY);

        const aiOutput = await agentService.runExecutiveAgent(facts, (chunk) => {
            // Stream each chunk of AI output
            res.write(`data: ${JSON.stringify({ status: "streaming", chunk })}\n\n`);
        });

        // 4. Send final complete response
        res.write(`data: ${JSON.stringify({
            status: "complete",
            hub_id: tokenResult.hub_id,
            ai_interpretation: aiOutput
        })}\n\n`);

        res.end();

    } catch (error) {
        console.error("Streaming audit failed:", error.message);
        res.write(`data: ${JSON.stringify({ status: "error", error: "Audit failed" })}\n\n`);
        res.end();
    }
});

export default router;
