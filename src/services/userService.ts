import { prisma } from '../db/client';

export async function registerUser(id: number, username?: string, firstName?: string) {
    try {
        // Prisma maneja los BigInt, pero Telegram manda number. Hacemos el casteo.
        const userId = BigInt(id);

        const existingUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!existingUser) {
            await prisma.user.create({
                data: {
                    id: userId,
                    username: username || null,
                    firstName: firstName || null
                }
            });
            return true; // Usuario nuevo
        }
        return false; // Ya existía
    } catch (error) {
        console.error("Error registrando usuario:", error);
        throw error;
    }
}