import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';

dotenv.config();

const port = Number(process.env.PORT) || 5000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

await connectDB(uri);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
