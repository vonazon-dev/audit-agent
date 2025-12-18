# HubSpot Data Quality Audit Agent

## 🚀 Executive Summary
**We are solving the "Garbage In, Garbage Out" problem in our CRM.**

This project is an intelligent **Audit Agent** designed to autonomously analyze our HubSpot data quality. Unlike standard dashboards that just show charts, this agent acts like a **RevOps Analyst**: it continually monitors data hygiene, identifies critical risks to revenue forecasting, and explains *why* they matter in plain English.

**Business Value:**
-   **Trustworthy Forecasts:** Ensures deals have the minimum viable data (Close Date, Amount) to be included in projections.
-   **Automated Oversight:** Replaces manual weekly audits with instant, on-demand analysis.
-   **Actionable Intelligence:** Translates technical metrics (e.g., "Field 123 is null") into business risks (e.g., "Marketing cannot measure ROI for Q3").

---

## 🏗 System Architecture

The system is built on a **"Safe AI"** architecture. We deliberately separate *calculation* from *interpretation* to ensure the AI never hallucinations numbers.

### 1. The Constitution (`SignalRegistry.js`)
*The Source of Truth.*
This file defines the strict rules of engagement. It lists every metric we track (e.g., `deals_missing_close_date`), its severity level (`critical`, `high`, `medium`), and the exact business impacts associated with it. 
* *Note: The AI is not allowed to invent new signals; it must respect this registry.*

### 2. The Calculator (`DataQualityEngine.js`)
*Deterministic Logic.*
This is a pure logic engine. It takes raw HubSpot data and runs it against our Signal Registry. It calculates the exact percentages of missing or bad data. 
* *Key Feature:* It enforces **Severity Escalation**. If a "Critical" signal (like Missing Amount) exceeds 30%, it automatically flags a High Severity risk, regardless of other factors.

### 3. The Analyst (`AgentService.js`)
*Generative AI (GPT-4o).*
This is where the magic happens. We feed the *proven facts* from the Engine into GPT-4o. The AI's job is **Narrative Generation**. 
* **Input:** "Deals missing close date: 45% (Critical)"
* **Output:** "Severe Risk: Nearly half of the pipeline lacks close dates, rendering the Q4 revenue forecast unreliable. Immediate action required."

**Safety Rails:**
-   **Zod Schema Validation:** We define a strict contract for the AI's output. If it tries to return a format we didn't ask for, or misses a key field, the system rejects it.
-   **Input Normalization:** We strip all PII (Personally Identifiable Information) and only send the aggregated metrics to OpenAI.

---

## 🛠 Usage

### Prerequisites
- Node.js (v18+)
- OpenAI API Key

### Running the Agent
```bash
# Install dependencies
npm install

# Start the server
npm start
```

### API Endpoints
-   `POST /api/audit`: Triggers a full audit cycle.
    -   Fetches live HubSpot data.
    -   Runs the Data Quality Engine.
    -   Generates the Executive Summary via AI.
    -   Returns the JSON report.

---

## 🛡 Security & Compliance
-   **No Raw Data Training:** OpenAI is used strictly for inference. No customer data is stored or used for model training.
-   **Deterministic Scoring:** The "Health Score" (0-100) is calculated mathematically, not estimated by AI, ensuring consistent week-over-week tracking.
