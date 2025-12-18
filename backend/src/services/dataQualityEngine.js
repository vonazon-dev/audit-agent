import { SIGNAL_REGISTRY } from "../config/signalRegistry.js";

/**
 * Data Quality Engine for HubSpot Audit (Phase 3)
 * Deterministic, read-only logic to evaluate CRM hygiene.
 * Enforces "Constitution" rules from SignalRegistry.
 */
export class DataQualityEngine {
    constructor(contacts, companies, deals) {
        this.contacts = contacts;
        this.companies = companies;
        this.deals = deals;
    }

    /**
     * Compute percent of missing values for a property.
     * Missing = null, undefined, or empty string.
     */
    calculateMissingPct(records, property) {
        if (!records || records.length === 0) return 0;
        const missingCount = records.filter(r => {
            const val = r.properties[property];
            return val === null || val === undefined || val === "";
        }).length;
        return (missingCount / records.length) * 100;
    }

    /**
     * Determine severity based on missing percentage and criticality.
     * Rules:
     * - Critical signal > 30% -> High Severity (Escalation)
     * - High signal > 50% -> Medium+ (mapped to High for simplicity in v1)
     * - Standard: 0-10% Low, 10-30% Medium, >30% High
     */
    getSeverity(pct, criticality) {
        // Enforce Criticality Escalation
        if (criticality === "critical" && pct > 30) return "high";

        // Standard Thresholds
        if (pct > 30) return "high";
        if (pct > 10) return "medium";
        return "low";
    }

    /**
     * Main entry point to run the audit.
     * @returns {Object} DataQualityAuditResult (Facts only)
     */
    runAudit() {
        const signalResults = [];
        let highCount = 0;
        let mediumCount = 0;
        let totalPenalty = 0;

        // --- 1. Signal Logic ---

        // Helper to process a signal from registry
        const processSignal = (key, value) => {
            const config = SIGNAL_REGISTRY[key];
            if (!config) return; // Should not happen if registry is sync'd

            const severity = this.getSeverity(value, config.criticality);

            // Stats for aggregation
            if (severity === "high") highCount++;
            else if (severity === "medium") mediumCount++;

            // Penalty Calculation (Simple Model)
            let penalty = 0;
            if (severity === "high") penalty = 30;
            else if (severity === "medium") penalty = 15;
            else penalty = 5;

            // Weight Boosting for Critical Signals
            let weight = 1;
            if (config.criticality === "critical") weight = 2;

            totalPenalty += (penalty * weight);

            signalResults.push({
                key: key,
                label: config.label,
                value: value,
                severity: severity,
                criticality: config.criticality,
                impacts: config.impacts // Attach impacts from registry
            });
        };

        // Execute Calculations (Deterministic)
        processSignal("contacts_missing_email_pct", this.calculateMissingPct(this.contacts, "email"));
        processSignal("contacts_missing_lifecycle_pct", this.calculateMissingPct(this.contacts, "lifecyclestage"));

        processSignal("companies_missing_domain_pct", this.calculateMissingPct(this.companies, "domain"));
        processSignal("companies_missing_industry_pct", this.calculateMissingPct(this.companies, "industry"));

        processSignal("deals_missing_close_date_pct", this.calculateMissingPct(this.deals, "closedate"));
        processSignal("deals_missing_amount_pct", this.calculateMissingPct(this.deals, "amount"));

        // Deals Pipeline/Stage: custom logic
        const missingStage = this.deals.length ?
            (this.deals.filter(d => !d.properties.dealstage || !d.properties.pipeline).length / this.deals.length) * 100
            : 0;
        processSignal("deals_missing_pipeline_or_stage_pct", missingStage);


        // --- 2. Aggregation & Scoring ---

        // Clamp score 0-100
        let score = 100 - totalPenalty;
        if (score < 0) score = 0;

        // Domain Severity Rule
        let overallSeverity = "low";
        if (highCount >= 2) overallSeverity = "high";
        else if (mediumCount >= 2) overallSeverity = "medium";

        // Override: If ANY critical signal is High severity, overall is High (Shift-Left Risk)
        const hasCriticalFail = signalResults.some(s => s.criticality === "critical" && s.severity === "high");
        if (hasCriticalFail) overallSeverity = "high";

        return {
            overall_health: {
                score: Math.round(score),
                severity: overallSeverity
            },
            signals: signalResults
        };
    }
}
