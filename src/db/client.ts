import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function buildConnectionConfig() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("Falta definir DATABASE_URL en el archivo .env");
    }

    const parsedUrl = new URL(connectionString);
    const ssl = parsedUrl.hostname.includes('railway') || parsedUrl.hostname.includes('postgres')
        ? { rejectUnauthorized: false }
        : undefined;

    return {
        connectionString,
        ssl,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    };
}

const config = buildConnectionConfig();

const pool = new Pool(config);
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });