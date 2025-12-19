import { AgentService } from '../src/services/agentService.js';

async function testAgentService() {
    try {
        console.log("Initializing AgentService...");
        const service = new AgentService();

        const mockAuditResult = {
            overall_health: 85,
            signals: [
                { key: "missing_contact_info", value: 10, criticality: "high", severity: "high", impacts: ["lost_revenue"] },
                { key: "stale_deals", value: 5, criticality: "medium", severity: "medium", impacts: ["forecast_inaccuracy"] }
            ]
        };

        console.log("Running Executive Agent...");
        const result = await service.runExecutiveAgent(mockAuditResult);

        console.log("Agent Output:", JSON.stringify(result, null, 2));
        console.log("Verification Successful!");
    } catch (error) {
        console.error("Verification Failed:", error);
        process.exit(1);
    }
}

testAgentService();
