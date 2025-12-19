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
     */
    getSeverity(pct, criticality) {
        if (criticality === "critical" && pct > 30) return "high";
        if (pct > 30) return "high";
        if (pct > 10) return "medium";
        return "low";
    }

    /**
     * Derive primary risk driver from signals.
     */
    derivePrimaryRiskDriver(signals) {
        const criticalHighSeverity = signals.filter(
            s => s.criticality === "critical" && s.severity === "high"
        );

        if (criticalHighSeverity.length > 0) {
            const dealSignals = criticalHighSeverity.filter(s => s.key.startsWith("deals_"));

            if (dealSignals.length >= 2) {
                const avgValue = Math.round(dealSignals.reduce((sum, s) => sum + s.value, 0) / dealSignals.length);
                return `Forecast integrity is compromised: ${avgValue}% of deals lack critical forecasting fields (close date, amount), making revenue projections unreliable.`;
            } else if (dealSignals.length === 1) {
                return `${dealSignals[0].label}: ${Math.round(dealSignals[0].value)}% of deals affected. ${dealSignals[0].impacts[0]}.`;
            }
        }

        const highSeverity = signals.filter(s => s.severity === "high");
        if (highSeverity.length > 0) {
            const worst = highSeverity.sort((a, b) => b.value - a.value)[0];
            return `${worst.label}: ${Math.round(worst.value)}% missing. ${worst.impacts[0]}.`;
        }

        return "Data quality is acceptable. Minor improvements recommended.";
    }

    /**
     * Generate deterministic prioritized actions from signals.
     * Ordering: Deals (revenue) -> Process (pipeline) -> Funnel (lifecycle) -> Support (contacts/companies)
     */
    generatePrioritizedActions(signals) {
        const actions = [];

        // Action templates with owner_role and explicit ordering weight
        const ACTION_TEMPLATES = {
            deals_missing_close_date_pct: {
                action: "Enforce required Close Date on all deals",
                effort: "low",
                time_to_value_days: 7,
                domain: "revenue_forecasting",
                owner_role: "Sales Ops",
                order_weight: 100  // Highest priority
            },
            deals_missing_amount_pct: {
                action: "Enforce required Amount field on all deals",
                effort: "low",
                time_to_value_days: 7,
                domain: "revenue_forecasting",
                owner_role: "Sales Ops",
                order_weight: 99
            },
            deals_missing_pipeline_or_stage_pct: {
                action: "Standardize deal pipeline and stage enforcement",
                effort: "low",
                time_to_value_days: 7,
                domain: "sales_process",
                owner_role: "Sales Ops",
                order_weight: 98  // Before lifecycle (process dependency)
            },
            contacts_missing_lifecycle_pct: {
                action: "Mandate lifecycle stage assignment on contacts",
                effort: "medium",
                time_to_value_days: 21,
                domain: "funnel_visibility",
                owner_role: "RevOps",
                order_weight: 80  // After pipeline discipline
            },
            contacts_missing_email_pct: {
                action: "Implement email validation workflow for new contacts",
                effort: "medium",
                time_to_value_days: 14,
                domain: "marketing_attribution",
                owner_role: "Marketing Ops",
                order_weight: 50
            },
            companies_missing_domain_pct: {
                action: "Enable automatic company domain enrichment",
                effort: "low",
                time_to_value_days: 7,
                domain: "data_enrichment",
                owner_role: "RevOps",
                order_weight: 60
            },
            companies_missing_industry_pct: {
                action: "Add industry classification via enrichment or manual process",
                effort: "medium",
                time_to_value_days: 30,
                domain: "segmentation",
                owner_role: "Marketing Ops",
                order_weight: 40
            }
        };

        // Only create actions for signals that need attention
        const actionableSignals = signals.filter(s => s.severity !== "low");

        // Score each signal for prioritization
        const scoredSignals = actionableSignals.map(signal => {
            const template = ACTION_TEMPLATES[signal.key];
            if (!template) return null;

            // Use explicit order_weight as primary sort, then criticality/severity as tiebreaker
            let score = template.order_weight;

            // Only boost if severity is high (don't reorder based on medium)
            if (signal.severity === "high") score += 10;

            return { signal, template, score };
        }).filter(Boolean);

        // Sort by score descending (order_weight dominant)
        scoredSignals.sort((a, b) => b.score - a.score);

        // Generate actions
        let priority = 1;
        for (const { signal, template } of scoredSignals) {
            actions.push({
                priority,
                action: template.action,
                signal_key: signal.key,
                why: `${Math.round(signal.value)}% of ${signal.label.toLowerCase().replace("missing ", "").replace(" pct", "")} affected. ${signal.impacts[0]}.`,
                effort: template.effort,
                time_to_value_days: template.time_to_value_days,
                owner_role: template.owner_role,
                impacts: signal.impacts.slice(0, 2),
                criticality: signal.criticality,
                severity: signal.severity,
                tier: priority <= 5 ? "primary" : "secondary"
            });
            priority++;
        }

        return actions;
    }

    /**
     * Group signals by object type for presentation.
     */
    groupSignalsByObject(signals) {
        return {
            deals: signals.filter(s => s.key.startsWith("deals_")),
            companies: signals.filter(s => s.key.startsWith("companies_")),
            contacts: signals.filter(s => s.key.startsWith("contacts_"))
        };
    }

    /**
     * Main entry point to run the audit.
     */
    runAudit() {
        const signalResults = [];
        let highCount = 0;
        let mediumCount = 0;
        let totalPenalty = 0;

        const processSignal = (key, value) => {
            const config = SIGNAL_REGISTRY[key];
            if (!config) return;

            const severity = this.getSeverity(value, config.criticality);

            if (severity === "high") highCount++;
            else if (severity === "medium") mediumCount++;

            let penalty = 0;
            if (severity === "high") penalty = 30;
            else if (severity === "medium") penalty = 15;
            else penalty = 5;

            let weight = config.criticality === "critical" ? 2 : 1;
            totalPenalty += (penalty * weight);

            signalResults.push({
                key,
                label: config.label,
                value,
                severity,
                criticality: config.criticality,
                impacts: config.impacts
            });
        };

        // Execute calculations
        processSignal("contacts_missing_email_pct", this.calculateMissingPct(this.contacts, "email"));
        processSignal("contacts_missing_lifecycle_pct", this.calculateMissingPct(this.contacts, "lifecyclestage"));
        processSignal("companies_missing_domain_pct", this.calculateMissingPct(this.companies, "domain"));
        processSignal("companies_missing_industry_pct", this.calculateMissingPct(this.companies, "industry"));
        processSignal("deals_missing_close_date_pct", this.calculateMissingPct(this.deals, "closedate"));
        processSignal("deals_missing_amount_pct", this.calculateMissingPct(this.deals, "amount"));

        const missingStage = this.deals.length ?
            (this.deals.filter(d => !d.properties.dealstage || !d.properties.pipeline).length / this.deals.length) * 100
            : 0;
        processSignal("deals_missing_pipeline_or_stage_pct", missingStage);

        // Score with floor
        let score = 100 - totalPenalty;
        const isTrulyBroken = this.deals.length === 0 || signalResults.every(s => s.severity === "high");
        if (isTrulyBroken) {
            score = 0;
        } else if (score < 10) {
            score = 10;
        }

        // Overall severity
        let overallSeverity = "low";
        if (highCount >= 2) overallSeverity = "high";
        else if (mediumCount >= 2) overallSeverity = "medium";

        const hasCriticalFail = signalResults.some(s => s.criticality === "critical" && s.severity === "high");
        if (hasCriticalFail) overallSeverity = "high";

        // Derive insights
        const primaryRiskDriver = this.derivePrimaryRiskDriver(signalResults);
        const prioritizedActions = this.generatePrioritizedActions(signalResults);
        const signalsByObject = this.groupSignalsByObject(signalResults);

        return {
            overall_health: {
                score: Math.round(score),
                severity: overallSeverity,
                primary_risk_driver: primaryRiskDriver
            },
            signals: signalResults,
            signals_by_object: signalsByObject,
            prioritized_actions: prioritizedActions,
            metadata: {
                contacts_count: this.contacts.length,
                companies_count: this.companies.length,
                deals_count: this.deals.length,
                generated_at: new Date().toISOString()
            }
        };
    }
}
