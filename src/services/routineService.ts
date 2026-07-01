import { prisma } from '../db/client';

export async function createRoutine(userId: number, days: string[], exercises: { order: number, name: string, sets: number, reps: number }[]) {
    try {
        const id = BigInt(userId);
        const createdRoutines = [];

        for (const day of days) {
            // Borramos la rutina anterior de ese día si existía para evitar duplicados
            await prisma.routine.deleteMany({
                where: { userId: id, day: day }
            });

            const routine = await prisma.routine.create({
                data: {
                    userId: id,
                    day: day,
                    exercises: {
                        create: exercises
                    }
                },
                include: { exercises: true }
            });
            createdRoutines.push(routine);
        }
        return createdRoutines;
    } catch (error) {
        console.error("Error creando rutina:", error);
        throw error;
    }
}

export async function deleteAllRoutinesForUser(userId: number) {
    try {
        const id = BigInt(userId);
        const result = await prisma.routine.deleteMany({
            where: { userId: id }
        });

        return result.count;
    } catch (error) {
        console.error("Error borrando rutinas:", error);
        throw error;
    }
}