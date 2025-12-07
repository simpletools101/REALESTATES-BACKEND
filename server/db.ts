import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Maximum number of connection attempts
const MAX_RETRIES = 5;
// Initial delay in milliseconds before retrying (will be multiplied by backoff factor)
const INITIAL_RETRY_DELAY = 1000;
// Backoff multiplier for each retry attempt
const BACKOFF_FACTOR = 1.5;

// Create a pool with connection retry logic
export const createPoolWithRetry = async () => {
  let retries = 0;
  let delay = INITIAL_RETRY_DELAY;
  
  while (retries < MAX_RETRIES) {
    try {
      console.log(`Attempting to connect to database (attempt ${retries + 1}/${MAX_RETRIES})`);
      const newPool = new Pool({ connectionString: process.env.DATABASE_URL });
      
      // Test the connection by executing a simple query
      await newPool.query('SELECT 1');
      console.log('Database connection established successfully');
      
      return newPool;
    } catch (error) {
      retries++;
      console.error(`Database connection failed (attempt ${retries}/${MAX_RETRIES}):`, error);
      
      if (retries >= MAX_RETRIES) {
        console.error('Maximum connection attempts reached. Could not connect to database.');
        const errorMessage = (error instanceof Error) ? error.message : String(error);
        throw new Error(`Failed to connect to database after ${MAX_RETRIES} attempts: ${errorMessage}`);
      }
      
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.floor(delay * BACKOFF_FACTOR);
    }
  }
};

// Initialize pool with retry logic
export let pool: Pool;
export let db: ReturnType<typeof drizzle>;

// Remove all Neon/Postgres usage except for migration/legacy tools
// This file is now only used for migration/legacy health checks
// All CRUD operations are handled by DynamoDB via storage.ts

// Remove periodic health check and all runtime Neon logic
// (If you need to check Neon health, run a migration/legacy script manually)