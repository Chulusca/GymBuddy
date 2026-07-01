import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("Falta definir DATABASE_URL en el archivo .env");
}

// Inicializamos el driver nativo de Postgres
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Exportamos Prisma ya configurado y listo para usar
export const prisma = new PrismaClient({ adapter });