import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { runSalesRetention } from './services/salesRetentionService.js';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/billing-pos';

try {
  await connectDB(uri);
  const result = await runSalesRetention({ dryRun: true });
  console.log(JSON.stringify({
    cutoff: result.cutoff.toISOString(),
    matchedCount: result.matchedCount,
    candidates: result.candidates?.map((candidate) => ({
      id: String(candidate._id),
      invoiceNumber: candidate.invoiceNumber,
      createdAt: candidate.createdAt,
    })),
  }, null, 2));
} catch (error) {
  console.error('[sales-retention] dry-run failed', error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}