# Quote preparation pilot
Integrated into existing /projects snapshots and revision audit. No new DB table, no production records populated. Older callers omitting quote preserve stored quote. Owner-private.

Manual structured intake and cost entries can be prepared by an assistant through existing project tool; no automatic AI extraction, supplier lookup, price catalog or FlowAccount integration. Queue stage is manual. Costs require dates/sources, missing is not zero, margin vs markup explicit with no default. Human review/approval is recorded evidence, not a role-based digital signature. Editing fields clears UI approval. Not a customer quotation, no VAT/discount calculation or customer sending. No legal/accounting posting. Follow evidence before using totals, include all costs manually.

19 unit tests pass; full tsc existing unrelated errors remain. Authenticated UI not tested. Do not call this fully automated quotation software.
