import express from "express";
import { HubSpotClient } from "../services/hubspotClient.js";
import { DataQualityEngine } from "../services/dataQualityEngine.js";
import { TokenStore } from "../services/tokenStore.js";
import { AgentService } from "../services/agentService.js";

const router = express.Router();

/**
 * Non-streaming audit endpoint (original behavior)
 */
router.post("/audit", async (req, res) => {
    try {
        let { hub_id } = req.body;
        let access_token = null;

        if (!hub_id) {
            return res.status(400).json({ error: "Missing hub_id" });
        }

        // Try to load from store if missing
        const stored = await TokenStore.getToken(hub_id);
        if (stored) {
            access_token = stored.access_token;
            if (!hub_id) hub_id = stored.hub_id;
        }

        if (!access_token) {
            return res.status(400).json({ error: "Missing access_token and no stored token found." });
        }

        // 1. Fetch Data
        const hubSpotClient = new HubSpotClient(access_token);

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
            hub_id,
            audit_facts: facts,
            ai_interpretation: aiOutput
        });

    } catch (error) {
        console.error("Audit processing failed:", error);
        res.status(500).json({
            error: "Audit failed",
            details: error.message
        });
    }
});

/**
 * Streaming audit endpoint - returns AI analysis in real-time via SSE
 */
router.post("/audit/stream", async (req, res) => {
    try {
        let { hub_id } = req.body;
        let access_token = null;

        if (!hub_id) {
            return res.status(400).json({ error: "Missing hub_id" });
        }

        // Try to load from store if missing
        const stored = await TokenStore.getToken(hub_id);
        if (stored) {
            access_token = stored.access_token;
            if (!hub_id) hub_id = stored.hub_id;
        }

        if (!access_token) {
            return res.status(400).json({ error: "Missing access_token and no stored token found." });
        }

        // Set up SSE headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // 1. Fetch Data
        const hubSpotClient = new HubSpotClient(access_token);
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
            hub_id,
            ai_interpretation: aiOutput
        })}\n\n`);

        res.end();

    } catch (error) {
        console.error("Streaming audit failed:", error);
        res.write(`data: ${JSON.stringify({ status: "error", error: error.message })}\n\n`);
        res.end();
    }
});

export default router;
