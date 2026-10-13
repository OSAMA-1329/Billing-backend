import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';
import { startSalesRetentionScheduler } from './services/salesRetentionService.js';

dotenv.config();

const port = Number(process.env.PORT) || 5000;
const uri = "mongodb+srv://osama8754091522_db_user:sE2u3uMk6OuoBb3U@cluster0.znpdd5i.mongodb.net/?appName=Cluster0";
// const uri = "mongodb://127.0.0.1:27017/billing-pos";


if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

await connectDB(uri);
startSalesRetentionScheduler();

app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
