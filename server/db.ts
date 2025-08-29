import 'dotenv/config'; // This must be the FIRST import
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/postgres-js';
import ws from "ws";
import * as schema from "@shared/schema";
import postgres from 'postgres';
import { problems, testCases } from '../shared/schema';
// Use correct Drizzle import for Postgres
import { pgTable, serial, text, jsonb, integer } from 'drizzle-orm/pg-core';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL must be set. Did you forget to provision a database?'
  );
}

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });

// Use in-memory storage for now
export const pool = null;
