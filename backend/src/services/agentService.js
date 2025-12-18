/**
 * Agent Service (LangChain-powered)
 * Translates deterministic facts into executive narratives using OpenAI.
 * ENFORCES strict input/output contracts via Zod schema validation.
 */
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

// --- Output Schema (The Contract) ---
const AuditOutputSchema = z.object({
    executive_summary: z.string().describe("A concise executive summary for a CRO audience, max 120 words. Focus on business impact, not technical details."),
    top_risks: z.array(z.string()).describe("Top 3 business risks identified from the audit signals, ordered by severity."),
    recommended_focus_areas: z.array(z.string()).describe("Top 3 actionable remediation focus areas with specific recommendations."),
    confidence_level: z.enum(["high", "medium", "low"]).describe("AI confidence in the analysis based on data completeness.")
});

export class AgentService {
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.OPENAI_API_KEY;

        // Initialize OpenAI with streaming
        this.llm = new ChatOpenAI({
            modelName: "gpt-4o",
            temperature: 0.3, // Lower for more consistent, factual output
            openAIApiKey: this.apiKey,
            streaming: true
        });
    }

    /**
     * Step 2.1: Define Agent Input (STRICT)
     * Strips all raw data. Only allows scored signals and metadata.
     */
    normalizeAudit(auditResult) {
        return {
            overall_health: auditResult.overall_health,
            signals: auditResult.signals.map(s => ({
                key: s.key,
                value: Math.round(s.value), // Round for readability
                criticality: s.criticality,
                severity: s.severity,
                impacts: s.impacts
            })),
            prioritized_actions: [] // Placeholder for future logic
        };
    }

    /**
     * Step 3.1 & 3.2: Build LangChain Prompt
     */
    buildPrompt() {
        return ChatPromptTemplate.fromMessages([
            ["system", `You are an enterprise RevOps audit analyst.

Rules:
- You must not invent metrics or facts.
- You may only reference signals explicitly provided in the input.
- You must explain business consequences, not technical details.
- If signals conflict, defer to severity and criticality.
- Write for a CRO (Chief Revenue Officer) audience.
- Be concise but comprehensive.
- For top_risks and recommended_focus_areas, provide exactly 3 items each.`],
            ["human", `Analyze the following HubSpot CRM audit data and provide your assessment.

Audit Data:
{audit_data}

Provide:
1. A concise executive summary (max 120 words) focusing on business impact
2. The top 3 business risks in order of severity
3. The top 3 recommended focus areas for remediation with specific actions
4. Your confidence level in this analysis (high/medium/low)`]
        ]);
    }

    /**
     * Step 2.2: Define Agent Output (STRICT)
     * Validates that the AI didn't hallucinate keys.
     */
    validateOutput(output) {
        const requiredKeys = ["executive_summary", "top_risks", "recommended_focus_areas", "confidence_level"];
        const missing = requiredKeys.filter(k => !output[k]);
        if (missing.length > 0) {
            throw new Error(`AI Contract Violation: Missing keys [${missing.join(", ")}]`);
        }

        // Validate array lengths
        if (!Array.isArray(output.top_risks) || output.top_risks.length === 0) {
            throw new Error("AI Contract Violation: top_risks must be a non-empty array");
        }
        if (!Array.isArray(output.recommended_focus_areas) || output.recommended_focus_areas.length === 0) {
            throw new Error("AI Contract Violation: recommended_focus_areas must be a non-empty array");
        }

        return output;
    }

    /**
     * Main execution loop with STREAMING support.
     * Returns structured output from OpenAI with real-time streaming.
     */
    async runExecutiveAgent(auditResult, onStream = null) {
        // 1. Normalize
        const agentInput = this.normalizeAudit(auditResult);

        // 2. Build Prompt
        const prompt = this.buildPrompt();

        // 3. Create chain with structured output
        const llmWithStructure = this.llm.withStructuredOutput(AuditOutputSchema, {
            name: "audit_analysis"
        });
        const chain = prompt.pipe(llmWithStructure);

        console.log("--- Agent Input ---\n", JSON.stringify(agentInput, null, 2));

        // 4. Execute with streaming if callback provided
        let output;

        if (onStream) {
            // Streaming mode - collect chunks and call callback
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
            // Non-streaming mode
            output = await chain.invoke({
                audit_data: JSON.stringify(agentInput, null, 2)
            });
        }

        console.log("--- AI Output ---\n", JSON.stringify(output, null, 2));

        // 5. Validate
        return this.validateOutput(output);
    }

    /**
     * Non-streaming execution for backwards compatibility.
     */
    async runExecutiveAgentSync(auditResult) {
        return this.runExecutiveAgent(auditResult, null);
    }
}
