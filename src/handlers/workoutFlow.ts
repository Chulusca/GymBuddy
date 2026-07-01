import { prisma } from "../db/client";

export type Exercise = { order: number; name: string; sets: number; reps: number };
export type RoutineEntry = { id: string; day: string; exercises: Exercise[] };
export type RoutineDetail = { id: string; day: string; exercises: Exercise[] };
export type WorkoutHistoryEntry = {
  id: string;
  routineDay?: string | null;
  startedAt: Date;
  exercises: Array<{
    name: string;
    plannedSets?: number | null;
    plannedReps?: number | null;
    sets: Array<{ reps: number; weight: number }>;
  }>;
};

export type WorkoutSessionState = {
  step: "select_routine" | "select_exercise" | "collect_set" | "confirm_next_set" | "done";
  routineId?: string;
  routineDay?: string;
  startedAt?: Date;
  exercises: Exercise[];
  currentExerciseIndex: number;
  currentExercise?: Exercise;
  exercisesCompleted: Array<{
    name: string;
    plannedSets: number;
    plannedReps: number;
    sets: Array<{ reps: number; weight: number }>;
  }>;
};

export async function getUserRoutines(userId: number): Promise<RoutineEntry[]> {
  const routines = await prisma.routine.findMany({
    where: { userId: BigInt(userId) },
    include: { exercises: true },
    orderBy: [{ day: "asc" }, { id: "asc" }]
  });

  return routines.map((routine: any) => ({
    id: routine.id,
    day: routine.day,
    exercises: routine.exercises
      .sort((a: any, b: any) => a.order - b.order)
      .map((exercise: any) => ({
        order: exercise.order,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps
      }))
  }));
}

export async function getRoutineByDay(userId: number, day: string): Promise<RoutineDetail | null> {
  const routine = await prisma.routine.findFirst({
    where: { userId: BigInt(userId), day },
    include: { exercises: true }
  });

  if (!routine) return null;

  return {
    id: routine.id,
    day: routine.day,
    exercises: routine.exercises
      .sort((a: any, b: any) => a.order - b.order)
      .map((exercise: any) => ({
        order: exercise.order,
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps
      }))
  };
}

export async function getLastExercisePerformance(userId: number, exerciseName: string): Promise<{ reps: number; weight: number; performedAt: Date } | null> {
  const lastExercise = await prisma.workoutExercise.findFirst({
    where: {
      workout: { userId: BigInt(userId) },
      name: exerciseName
    },
    include: { sets: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" }
  });

  if (!lastExercise || lastExercise.sets.length === 0) {
    return null;
  }

  const lastSet = lastExercise.sets[0];
  if (!lastSet) {
    return null;
  }

  return {
    reps: lastSet.reps,
    weight: lastSet.weight,
    performedAt: lastExercise.createdAt
  };
}

export async function getRecentWorkouts(userId: number, take = 5): Promise<WorkoutHistoryEntry[]> {
  const workouts = await prisma.workoutSession.findMany({
    where: { userId: BigInt(userId) },
    include: { exercises: { include: { sets: true } } },
    orderBy: { startedAt: "desc" },
    take
  });

  return workouts.map((workout: any) => ({
    id: workout.id,
    routineDay: workout.routineDay,
    startedAt: workout.startedAt,
    exercises: workout.exercises.map((exercise: any) => ({
      name: exercise.name,
      plannedSets: exercise.plannedSets,
      plannedReps: exercise.plannedReps,
      sets: exercise.sets.map((set: any) => ({ reps: set.reps, weight: set.weight }))
    }))
  }));
}

export function createInitialWorkoutSession(routines: RoutineEntry[]): WorkoutSessionState {
  return {
    step: "select_routine",
    startedAt: new Date(),
    exercises: [],
    currentExerciseIndex: 0,
    exercisesCompleted: []
  };
}

function parseSetInput(input: string) {
  const match = input.trim().match(/^(\d+)\s+(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  return {
    reps: Number(match[1]),
    weight: Number(match[2])
  };
}

export function parseWorkoutSetInput(input: string) {
  return parseSetInput(input);
}

export function getCurrentExercise(state: WorkoutSessionState) {
  return state.currentExercise;
}

export function getWorkoutSessionSummary(state: WorkoutSessionState) {
  return {
    routineDay: state.routineDay,
    currentExercise: state.currentExercise,
    exercisesCompleted: state.exercisesCompleted
  };
}

export async function saveWorkoutSession(userId: number, state: WorkoutSessionState) {
  if (!state.routineId || !state.routineDay) {
    return null;
  }

  const userIdBigInt = BigInt(userId);

  const workoutSession = await prisma.workoutSession.create({
    data: {
      userId: userIdBigInt,
      routineId: state.routineId,
      routineDay: state.routineDay,
      completedAt: new Date(),
      exercises: {
        create: state.exercisesCompleted.map((exercise) => ({
          name: exercise.name,
          plannedSets: exercise.plannedSets,
          plannedReps: exercise.plannedReps,
          sets: {
            create: exercise.sets.map((set) => ({
              reps: set.reps,
              weight: set.weight
            }))
          }
        }))
      }
    }
  });

  await prisma.workoutLog.createMany({
    data: state.exercisesCompleted.flatMap((exercise) =>
      exercise.sets.map((set) => ({
        userId: userIdBigInt,
        workoutId: workoutSession.id,
        exercise: exercise.name,
        sets: 1,
        reps: set.reps,
        weight: set.weight,
        routineDay: state.routineDay ?? null,
        routineId: state.routineId ?? null
      }))
    )
  });

  return workoutSession.id;
}
