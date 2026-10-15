Cut Room Supply Manager v0.2.3 — Order History

Adds an Order History tab, listing generated orders with their saved statuses, date, line count and total. Select an order to view supplier-grouped line details, separate SKU and vendor part/BB#, saved quantities and prices, and printable supplier sheets. Read-only history in this release; no SQL migration.

NOTE: Historical item descriptions and vendor identifiers are looked up from current master records, including inactive items. Quantities and prices come from saved order lines. If a master record is later edited or deleted, its descriptive information may change or be unavailable; full immutable descriptions would require additional snapshot fields in a future migration.

Cut Room Supply Manager v0.2.2

DATA-INTEGRITY FIXES
- Saved appears only after Supabase confirms the row write.
- Blur and Enter force an immediate save.
- Per-item saves are serialized to avoid overlapping writes.
- Clearing a saved quantity removes its database row.
- Completing a count flushes pending saves first.
- Refresh/navigation warns while writes are pending.

Cut Room Supply Manager v0.2.1

FIX
- Order generation no longer inserts extended_cost. Supabase calculates that generated column from quantity_ordered × unit_price_snapshot.

Cut Room Supply Manager v0.2.0

NEW
- Order Review tab sourced from the current draft count or latest completed count.
- Replenishment lines grouped by supplier.
- Suggested order quantities remain editable before generation.
- Shows SKU/vendor part number, on-hand, Min/Max, suggested quantity, unit price, extended cost and supplier totals.
- Generate Order writes one draft order snapshot plus order-line snapshots to the existing Supabase order tables.
- Inventory session ID is preserved in the order notes for traceability.

Cut Room Supply Manager v0.1.1\n\nFixes empty-draft labeling, direct resume, discard/start-new, autosave status, quantity repopulation after reload, and count progress.\n\nTest: discard the old empty v0.1 draft, enter 3-5 quantities, wait for Saved, reload/reopen, and confirm values repopulate.\n