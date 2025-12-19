import axios from "axios";

/**
 * HubSpot Client for fetching CRM data with pagination.
 * strictly adheres to v3 CRM API specifications.
 */
export class HubSpotClient {
    /**
     * @param {string} accessToken - OAuth access token
     */
    constructor(accessToken) {
        this.client = axios.create({
            baseURL: "https://api.hubapi.com",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
    }

    /**
     * Generic helper to fetch all records of a given object type using cursor pagination.
     * @param {string} objectType - 'contacts', 'companies', or 'deals'
     * @param {string[]} properties - List of properties to retrieve
     * @param {number} maxRecords - Maximum records to fetch (default 10000)
     * @returns {Promise<Array>} - Array of CRM objects
     */
    async fetchAll(objectType, properties, maxRecords = 10000) {
        let allResults = [];
        let after = undefined;
        const limit = 100; // Max limit for basic GET requests

        try {
            do {
                const response = await this.client.get(`/crm/v3/objects/${objectType}`, {
                    params: {
                        limit,
                        properties: properties.join(","),
                        after,
                    },
                });

                const { results, paging } = response.data;
                allResults = allResults.concat(results);

                // Enforce maximum record limit to prevent OOM
                if (allResults.length >= maxRecords) {
                    console.warn(`${objectType}: Reached max record limit (${maxRecords}). Results truncated.`);
                    break;
                }

                // Check for next page
                if (paging && paging.next && paging.next.after) {
                    after = paging.next.after;
                } else {
                    after = undefined;
                }
            } while (after);

            return allResults;
        } catch (error) {
            console.error(`Error fetching ${objectType}:`, error.message);
            throw new Error(`Failed to fetch ${objectType}`);
        }
    }

    /**
     * Fetch all contacts with email and lifecyclestage.
     * @returns {Promise<Array>}
     */
    async fetchAllContacts() {
        // Properties required for audit: email, lifecyclestage
        return this.fetchAll("contacts", ["email", "lifecyclestage"]);
    }

    /**
     * Fetch all companies with domain and industry.
     * @returns {Promise<Array>}
     */
    async fetchAllCompanies() {
        // Properties required for audit: domain, industry
        return this.fetchAll("companies", ["domain", "industry"]);
    }

    /**
     * Fetch all deals with close date, amount, stage, and pipeline.
     * @returns {Promise<Array>}
     */
    async fetchAllDeals() {
        // Properties required for audit: closedate, amount, dealstage, pipeline
        return this.fetchAll("deals", ["closedate", "amount", "dealstage", "pipeline"]);
    }
}
