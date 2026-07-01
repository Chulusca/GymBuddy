import { prisma } from '../db/client';

type RoutineExercise = { order: number, name: string, sets: number, reps: number };

export async function createRoutine(userId: number, days: string[], exercises: RoutineExercise[]) {
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

export async function updateRoutineExercises(userId: number, day: string, exercises: RoutineExercise[]) {
    try {
        const id = BigInt(userId);
        const routine = await prisma.routine.findFirst({
            where: { userId: id, day },
            select: { id: true }
        });

        if (!routine) {
            return null;
        }

        await prisma.exercise.deleteMany({
            where: { routineId: routine.id }
        });

        await prisma.exercise.createMany({
            data: exercises.map((exercise, index) => ({
                routineId: routine.id,
                name: exercise.name,
                order: index + 1,
                sets: exercise.sets,
                reps: exercise.reps
            }))
        });

        return prisma.routine.findUnique({
            where: { id: routine.id },
            include: { exercises: true }
        });
    } catch (error) {
        console.error("Error actualizando ejercicios de la rutina:", error);
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