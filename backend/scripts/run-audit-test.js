import { DataQualityEngine } from '../src/services/dataQualityEngine.js';
import { AgentService } from '../src/services/agentService.js';

// Mock data
const mockContacts = [
    { properties: { email: "john@example.com", lifecyclestage: "lead" } },
    { properties: { email: "jane@example.com", lifecyclestage: "" } },
    { properties: { email: "", lifecyclestage: "customer" } },
    { properties: { email: "bob@example.com", lifecyclestage: null } },
    { properties: { email: null, lifecyclestage: "lead" } },
    { properties: { email: "alice@example.com", lifecyclestage: "opportunity" } },
    { properties: { email: "test@example.com", lifecyclestage: "" } },
    { properties: { email: "", lifecyclestage: "" } },
    { properties: { email: "valid@example.com", lifecyclestage: "lead" } },
    { properties: { email: "another@example.com", lifecyclestage: null } },
];

const mockCompanies = [
    { properties: { domain: "acme.com", industry: "Technology" } },
    { properties: { domain: "", industry: "Healthcare" } },
    { properties: { domain: "example.com", industry: "" } },
    { properties: { domain: null, industry: "Finance" } },
    { properties: { domain: "test.com", industry: null } },
    { properties: { domain: "valid.com", industry: "Retail" } },
    { properties: { domain: "", industry: "" } },
    { properties: { domain: "corp.com", industry: "Technology" } },
];

const mockDeals = [
    { properties: { closedate: "2024-12-01", amount: "50000", dealstage: "closedwon", pipeline: "default" } },
    { properties: { closedate: "", amount: "30000", dealstage: "negotiation", pipeline: "default" } },
    { properties: { closedate: "2024-11-15", amount: "", dealstage: "proposal", pipeline: "default" } },
    { properties: { closedate: null, amount: null, dealstage: "discovery", pipeline: "default" } },
    { properties: { closedate: "2024-10-01", amount: "75000", dealstage: "", pipeline: "" } },
    { properties: { closedate: "2024-09-15", amount: "25000", dealstage: "closedwon", pipeline: "default" } },
    { properties: { closedate: "", amount: "", dealstage: null, pipeline: null } },
    { properties: { closedate: "2024-08-01", amount: "100000", dealstage: "closedwon", pipeline: "default" } },
    { properties: { closedate: null, amount: "45000", dealstage: "proposal", pipeline: "default" } },
    { properties: { closedate: "2024-07-01", amount: null, dealstage: "negotiation", pipeline: "default" } },
];

async function runFullAudit() {
    console.log("=".repeat(70));
    console.log("🔍 DATA QUALITY AUDIT v2 - FULL OUTPUT");
    console.log("=".repeat(70));

    // 1. Run deterministic audit
    const engine = new DataQualityEngine(mockContacts, mockCompanies, mockDeals);
    const auditResult = engine.runAudit();

    console.log("\n📈 OVERALL HEALTH");
    console.log("-".repeat(40));
    console.log(`   Score: ${auditResult.overall_health.score}/100`);
    console.log(`   Severity: ${auditResult.overall_health.severity.toUpperCase()}`);
    console.log(`\n   🎯 PRIMARY RISK DRIVER:`);
    console.log(`   "${auditResult.overall_health.primary_risk_driver}"`);

    console.log("\n" + "=".repeat(70));
    console.log("🎯 PRIORITIZED ACTIONS (with owner_role + corrected order)");
    console.log("=".repeat(70));

    const primaryActions = auditResult.prioritized_actions.filter(a => a.tier === "primary");
    const secondaryActions = auditResult.prioritized_actions.filter(a => a.tier === "secondary");

    console.log("\n📌 PRIMARY (Top 5):");
    primaryActions.forEach(action => {
        console.log(`\n   #${action.priority} [${action.criticality.toUpperCase()}]`);
        console.log(`   Action: ${action.action}`);
        console.log(`   Owner: ${action.owner_role}`);
        console.log(`   Why: ${action.why}`);
        console.log(`   Effort: ${action.effort.toUpperCase()} | Time: ${action.time_to_value_days} days`);
    });

    if (secondaryActions.length > 0) {
        console.log("\n📎 SECONDARY:");
        secondaryActions.forEach(action => {
            console.log(`   #${action.priority} ${action.action} (${action.owner_role})`);
        });
    }

    // 2. Show AI prompt preview
    console.log("\n" + "=".repeat(70));
    console.log("🤖 AI AGENT INPUT (Minimal - What AI Receives)");
    console.log("=".repeat(70));

    const agentService = new AgentService();
    const promptPreview = agentService.getPromptPreview(auditResult);

    console.log("\n--- SYSTEM PROMPT ---");
    console.log(promptPreview.system_prompt);

    console.log("\n--- AGENT INPUT (data sent to AI) ---");
    console.log(JSON.stringify(promptPreview.agent_input, null, 2));

    // 3. Run AI agent (if API key available)
    // Check for either standard OpenAI key OR Azure config
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasAzure = !!process.env.AZURE_OPENAI_API_KEY;

    if (hasOpenAI || hasAzure) {
        console.log("\n" + "=".repeat(70));
        console.log("🧠 AI AGENT OUTPUT");
        console.log("=".repeat(70));

        try {
            const aiOutput = await agentService.runExecutiveAgent(auditResult);
            console.log("\n--- EXECUTIVE SUMMARY ---");
            console.log(aiOutput.executive_summary);

            console.log("\n--- TOP RISKS ---");
            aiOutput.top_risks.forEach((risk, i) => console.log(`${i + 1}. ${risk}`));

            console.log("\n--- FOCUS AREAS ---");
            aiOutput.focus_areas.forEach((area, i) => console.log(`${i + 1}. ${area}`));

            console.log(`\n--- CONFIDENCE: ${aiOutput.confidence_level.toUpperCase()} ---`);

            console.log("\n--- RAW AI OUTPUT ---");
            console.log(JSON.stringify(aiOutput, null, 2));
        } catch (err) {
            console.log("\n❌ AI Agent Error:", err.message);
        }
    } else {
        console.log("\n⚠️  OPENAI_API_KEY or AZURE_OPENAI_API_KEY not set - AI agent skipped");
    }
}

runFullAudit();
