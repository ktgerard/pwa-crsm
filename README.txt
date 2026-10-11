Cut Room Supply Manager v0.2.0

NEW
- Order Review tab sourced from the current draft count or latest completed count.
- Replenishment lines grouped by supplier.
- Suggested order quantities remain editable before generation.
- Shows SKU/vendor part number, on-hand, Min/Max, suggested quantity, unit price, extended cost and supplier totals.
- Generate Order writes one draft order snapshot plus order-line snapshots to the existing Supabase order tables.
- Inventory session ID is preserved in the order notes for traceability.

Cut Room Supply Manager v0.1.1\n\nFixes empty-draft labeling, direct resume, discard/start-new, autosave status, quantity repopulation after reload, and count progress.\n\nTest: discard the old empty v0.1 draft, enter 3-5 quantities, wait for Saved, reload/reopen, and confirm values repopulate.\n