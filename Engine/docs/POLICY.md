# ORGANIZATIONAL POLICY ENGINE SPECIFICATION

The Policy Engine maps calculated risk scores, context flags, and transaction metadata to policy actions across organization types (`BANK`, `ENTERPRISE`, `GOVERNMENT`, `CONTACT_CENTER`).

---

## Action Definitions

- **`CONTINUE`**: Risk score is low (0–29). Normal call processing continues under background AI monitoring.
- **`VERIFY`**: Risk score is medium (30–69). Step-up independent verification recommended before sharing sensitive credentials or authorizing financial actions.
- **`HOLD`**: High risk score (70–100) combined with high-value financial transfers (₹5,00,000+) or critical sensitive actions. Transaction HOLD requested by policy engine.
- **`ESCALATE`**: High risk score without financial transfer. Security alert escalated to authorized compliance staff.

---

## Bank Policy Adapter Simulation

> [!NOTE]
> The Bank Policy Adapter formats security payloads for System 1. It never claims a real bank transaction was blocked.
