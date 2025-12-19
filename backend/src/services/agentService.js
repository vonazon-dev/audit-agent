/**
 * Agent Service (LangChain-powered)
 * Translates deterministic facts into executive narratives.
 * STRICTLY receives only pre-computed data — no raw HubSpot access.
 */
import { ChatOpenAI, AzureChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { azureOpenAIConfig } from "../config/azure-openai.js";

// --- Output Schema (The Contract) ---
const AuditOutputSchema = z.object({
    executive_summary: z.string().describe("A concise executive summary for a CRO audience, max 100 words. Focus on business impact and urgency."),
    top_risks: z.array(z.string()).max(3).describe("Top 3 business risks identified, ordered by severity. Must be derived from provided data only."),
    focus_areas: z.array(z.string()).max(3).describe("Top 3 actionable focus areas from the provided actions. Do not invent new ones."),
    confidence_level: z.enum(["high", "medium", "low"]).describe("AI confidence based on data completeness.")
});

export class AgentService {
    constructor(apiKey) {
        // Check for Azure OpenAI config first
        if (azureOpenAIConfig.apiKey && azureOpenAIConfig.endpoint) {
            this.llm = new AzureChatOpenAI({
                azureOpenAIApiKey: azureOpenAIConfig.apiKey,
                azureOpenAIApiInstanceName: "openai-model-mayank", // Derived from endpoint or config
                azureOpenAIApiDeploymentName: azureOpenAIConfig.deploymentName,
                azureOpenAIApiVersion: azureOpenAIConfig.apiVersion,
                temperature: 0.2,
                streaming: true
            });
        } else {
            // Fallback to standard OpenAI
            this.apiKey = apiKey || process.env.OPENAI_API_KEY;

            this.llm = new ChatOpenAI({
                modelName: "gpt-4o",
                temperature: 0.2, // Lower for factual consistency
                openAIApiKey: this.apiKey,
                streaming: true
            });
        }
    }

    /**
     * Build minimal AI input from audit result.
     * AI receives ONLY what it needs — nothing more.
     */
    buildAgentInput(auditResult) {
        const topActions = auditResult.prioritized_actions
            .filter(a => a.tier === "primary")
            .slice(0, 3)
            .map(a => ({
                priority: a.priority,
                action: a.action,
                why: a.why,
                owner: a.owner_role
            }));

        return {
            overall_health: {
                score: auditResult.overall_health.score,
                severity: auditResult.overall_health.severity
            },
            primary_risk_driver: auditResult.overall_health.primary_risk_driver,
            top_actions: topActions,
            context: "HubSpot CRM audit for executive audience (CRO level)"
        };
    }

    /**
     * Build the AI prompt — strictly scoped.
     */
    buildPrompt() {
        return ChatPromptTemplate.fromMessages([
            ["system", `You are a RevOps analyst writing for a Chief Revenue Officer.

STRICT RULES:
- You may ONLY reference data explicitly provided in the input
- You must NOT invent metrics, percentages, or issues
- You must NOT suggest actions beyond those provided
- You must NOT change severity levels or re-rank priorities
- Write in direct, professional language
- Maximum 100 words for executive summary
- Focus on business impact, not technical details`],
            ["human", `Generate an executive briefing from this HubSpot CRM audit:

{audit_data}

Provide:
1. Executive summary (max 100 words) — what's wrong and why it matters
2. Top 3 risks (from the data provided)
3. Top 3 focus areas (from the actions provided — do not invent new ones)
4. Your confidence level in this analysis`]
        ]);
    }

    /**
     * Validate AI output against contract.
     */
    validateOutput(output) {
        const requiredKeys = ["executive_summary", "top_risks", "focus_areas", "confidence_level"];
        const missing = requiredKeys.filter(k => !output[k]);
        if (missing.length > 0) {
            throw new Error(`AI Contract Violation: Missing keys [${missing.join(", ")}]`);
        }

        if (!Array.isArray(output.top_risks) || output.top_risks.length === 0) {
            throw new Error("AI Contract Violation: top_risks must be a non-empty array");
        }
        if (!Array.isArray(output.focus_areas) || output.focus_areas.length === 0) {
            throw new Error("AI Contract Violation: focus_areas must be a non-empty array");
        }

        // Enforce max lengths
        if (output.top_risks.length > 3) output.top_risks = output.top_risks.slice(0, 3);
        if (output.focus_areas.length > 3) output.focus_areas = output.focus_areas.slice(0, 3);

        return output;
    }

    /**
     * Main execution — runs AI interpretation on audit facts.
     */
    async runExecutiveAgent(auditResult, onStream = null) {
        // 1. Build minimal input
        const agentInput = this.buildAgentInput(auditResult);

        // 2. Build prompt
        const prompt = this.buildPrompt();

        // 3. Create chain with structured output
        const llmWithStructure = this.llm.withStructuredOutput(AuditOutputSchema, {
            name: "audit_analysis"
        });
        const chain = prompt.pipe(llmWithStructure);

        // 4. Execute
        let output;

        if (onStream) {
            const stream = await chain.stream({
                audit_data: JSON.stringify(agentInput, null, 2)
            });

            let accumulated = {};
            for await (const chunk of stream) {
                accumulated = { ...accumulated, ...chunk };
                onStream(chunk);
            }
            output = accumulated;
        } else {
            output = await chain.invoke({
                audit_data: JSON.stringify(agentInput, null, 2)
            });
        }

        // 5. Validate
        return this.validateOutput(output);
    }

    /**
     * Get the raw prompt for review/debugging.
     */
    getPromptPreview(auditResult) {
        const agentInput = this.buildAgentInput(auditResult);
        return {
            system_prompt: `You are a RevOps analyst writing for a Chief Revenue Officer.

STRICT RULES:
- You may ONLY reference data explicitly provided in the input
- You must NOT invent metrics, percentages, or issues
- You must NOT suggest actions beyond those provided
- You must NOT change severity levels or re-rank priorities
- Write in direct, professional language
- Maximum 100 words for executive summary
- Focus on business impact, not technical details`,
            user_prompt: `Generate an executive briefing from this HubSpot CRM audit:

${JSON.stringify(agentInput, null, 2)}

Provide:
1. Executive summary (max 100 words) — what's wrong and why it matters
2. Top 3 risks (from the data provided)
3. Top 3 focus areas (from the actions provided — do not invent new ones)
4. Your confidence level in this analysis`,
            agent_input: agentInput
        };
    }
}
