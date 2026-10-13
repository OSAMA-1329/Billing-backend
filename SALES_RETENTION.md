# Sales Bill Retention

The backend retains sales invoices for the most recent 10 calendar months by default. At the next UTC midnight after backend startup, and every UTC midnight thereafter, the scheduler selects only invoices with a valid BSON `createdAt` date strictly earlier than the computed cutoff. Missing or invalid dates are never candidates. The cutoff clamps month-end dates (for example, October 31 minus one month is September 30).

Sale line items and payment totals are embedded in `SalesInvoice`, so deleting an expired invoice removes those embedded bill details. There are no separate sale-payment or sale-item collections in this schema. `StockMovement` rows are intentionally retained as inventory history, and cleanup never restores or adjusts product stock, customers, purchases, or any other collection. Retained stock movement references may point to an expired invoice ID.

## Safe rollout

1. Take a database backup and verify that it can be restored before enabling deletion. For example, from PowerShell with MongoDB Database Tools installed:

   ```powershell
   mongodump --uri "$env:MONGODB_URI" --out ".\backups\before-sales-retention"
   ```

2. Run the dry-run command and review every candidate invoice ID, number, date, and the cutoff:

   ```powershell
   cd backend
   npm run retention:dry-run
   ```

   This command is always dry-run and never deletes records.

3. Keep `SALES_RETENTION_DRY_RUN=true` during verification. Set it to `false` only after the backup and candidate list have been approved. The scheduler defaults to dry-run mode when this variable is absent.

## Configuration

- `MONGODB_URI`: MongoDB connection string. Defaults to the existing local `billing-pos` database.
- `SALES_RETENTION_MONTHS`: positive whole number of calendar months; defaults to `10`.
- `SALES_RETENTION_DRY_RUN`: `true` or unset logs candidates without deletion; set to `false` to enable scheduled deletion.

The job logs its mode and cutoff, completion count, and any execution errors. It is idempotent and guards against overlapping executions within a backend process. Run one backend scheduler instance per database unless deployment-level leader election is provided.