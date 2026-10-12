import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';

dotenv.config();

const port = Number(process.env.PORT) || 5000;
const uri = "mongodb+srv://osama8754091522_db_user:sE2u3uMk6OuoBb3U@cluster0.znpdd5i.mongodb.net/?appName=Cluster0";

if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

await connectDB(uri);

app.listen(port, () => {
  console.log(`API listening on https://billing-backend-5xym.onrender.com:${port}`);
});
