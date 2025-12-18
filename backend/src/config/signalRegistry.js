/**
 * Signal Registry (The Constitution)
 * Single source of truth for all audit signals, their criticality, and business impacts.
 * 
 * Rules:
 * - AI cannot invent new signals.
 * - AI cannot invent new impacts.
 * - Criticality determines severity floors.
 */
export const SIGNAL_REGISTRY = {
    // --- Contacts ---
    contacts_missing_email_pct: {
        id: "contacts_missing_email_pct",
        label: "Contacts Missing Email",
        criticality: "high",
        domain: "marketing_attribution",
        impacts: [
            "Cannot identify returning visitors",
            "Attribution reporting will be incomplete",
            "Marketing automation emails will fail"
        ]
    },
    contacts_missing_lifecycle_pct: {
        id: "contacts_missing_lifecycle_pct",
        label: "Contacts Missing Lifecycle Stage",
        criticality: "high", // Promoted to high based on common RevOps needs
        domain: "funnel_visibility",
        impacts: [
            "Funnel conversion rates cannot be calculated",
            "Leads may get stuck in limbo without clear ownership",
            "Marketing cannot segment by buying stage"
        ]
    },

    // --- Companies ---
    companies_missing_domain_pct: {
        id: "companies_missing_domain_pct",
        label: "Companies Missing Domain Name",
        criticality: "high",
        domain: "data_enrichment",
        impacts: [
            "Automatic association of contacts to companies will fail",
            "De-duplication logic is compromised",
            "Third-party enrichment tools cannot function"
        ]
    },
    companies_missing_industry_pct: {
        id: "companies_missing_industry_pct",
        label: "Companies Missing Industry",
        criticality: "medium",
        domain: "segmentation",
        impacts: [
            "ICP (Ideal Customer Profile) analysis unavailable",
            "Account segmentation for ABM is impossible",
            "Strategic reporting by vertical is compromised"
        ]
    },

    // --- Deals ---
    deals_missing_close_date_pct: {
        id: "deals_missing_close_date_pct",
        label: "Deals Missing Close Date",
        criticality: "critical", // Highest importance
        domain: "revenue_forecasting",
        impacts: [
            "Forecast accuracy is fundamentally unreliable",
            "Revenue projections cannot be trusted",
            "Sales velocity metrics will be incorrect"
        ]
    },
    deals_missing_amount_pct: {
        id: "deals_missing_amount_pct",
        label: "Deals Missing Amount",
        criticality: "critical",
        domain: "revenue_forecasting",
        impacts: [
            "Total pipeline value is underreported",
            "Win rates by value cannot be calculated",
            "Rep quota attainment tracking is broken"
        ]
    },
    deals_missing_pipeline_or_stage_pct: {
        id: "deals_missing_pipeline_or_stage_pct",
        label: "Deals Missing Pipeline/Stage",
        criticality: "critical",
        domain: "sales_process",
        impacts: [
            "Deals are invisible in the board view",
            "Sales process adherence cannot be verified",
            "Conversion rates between stages are calculable"
        ]
    }
};
