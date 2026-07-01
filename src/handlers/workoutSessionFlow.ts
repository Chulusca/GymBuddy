import { InlineKeyboard } from "grammy";
import { createInitialWorkoutSession, getLastExercisePerformance, saveWorkoutSession, type RoutineEntry, type WorkoutSessionState } from "./workoutFlow";
import { buildGuidedReply, buildQuickActionsKeyboard } from "./workoutUi";

const WEEKDAY_ORDER = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

function sortRoutinesByWeekday(routines: RoutineEntry[]) {
  return [...routines].sort((a, b) => {
    const aIndex = WEEKDAY_ORDER.indexOf(a.day);
    const bIndex = WEEKDAY_ORDER.indexOf(b.day);
    const aOrder = aIndex === -1 ? 999 : aIndex;
    const bOrder = bIndex === -1 ? 999 : bIndex;
    return aOrder - bOrder;
  });
}

function formatWorkoutSummary(session: any, startedAt?: Date) {
  const completedExercises = session.exercisesCompleted?.filter((entry: any) => entry.sets?.length > 0) ?? [];
  const totalExercises = session.exercises?.length ?? 0;
  const totalSeries = completedExercises.reduce((sum: number, entry: any) => sum + (entry.sets?.length ?? 0), 0);
  const progressPercent = totalExercises > 0 ? Math.round((completedExercises.length / totalExercises) * 100) : 100;
  const durationMinutes = startedAt ? Math.max(1, Math.round((new Date().getTime() - startedAt.getTime()) / 60000)) : 0;

  const exerciseLines = completedExercises.map((entry: any) => {
    const setSummary = entry.sets.map((set: any) => `${set.reps}x${set.weight}`).join(", ");
    return `• ${entry.name}: ${setSummary}`;
  });

  const body = [
    `⏱️ Tiempo: ${durationMinutes} min`,
    `🏋️ Ejercicios hechos: ${completedExercises.length}/${totalExercises}`,
    `🔁 Series registradas: ${totalSeries}`,
    `📈 Progreso: ${progressPercent}%`,
    "",
    "Ejercicios registrados:",
    ...exerciseLines
  ].join("\n");

  return body;
}

export class WorkoutSessionController {
  private readonly sessions = new Map<string, WorkoutSessionState>();

  constructor(private readonly getUserRoutinesFn: (userId: number) => Promise<RoutineEntry[]>) {}

  async startWorkoutSelection(ctx: any, user: any) {
    const routines = await this.getUserRoutinesFn(user.id);
    if (routines.length === 0) {
      await ctx.reply("No tenés rutinas cargadas todavía. Primero creá una con /rutina.");
      return false;
    }

    const sessionKey = `${ctx.chat?.id ?? user.id}:${user.id}`;
    const session = createInitialWorkoutSession(routines);
    this.sessions.set(sessionKey, session);

    const sortedRoutines = sortRoutinesByWeekday(routines);
    const keyboard = new InlineKeyboard();
    sortedRoutines.forEach((routine) => {
      keyboard.text(routine.day, `select_routine:${routine.id}`);
      keyboard.row();
    });

    await ctx.reply("🏋️ Elegí una rutina para entrenar.\n\nSi todavía no tenés una, creá una con /rutina.", { reply_markup: keyboard });
    return true;
  }

  async handleTextInput(ctx: any, user: any, chatId: number | undefined, text: string) {
    const sessionKey = `${chatId}:${user.id}`;
    const session = this.sessions.get(sessionKey);

    if (!session || session.step !== "collect_set") {
      return false;
    }

    const parsed = parseWorkoutSetInput(text);
    if (!parsed) {
      await ctx.reply("Formato inválido. Enviá algo como: 10 60");
      return true;
    }

    const currentExercise = session.currentExercise;
    if (!currentExercise) {
      await ctx.reply("No hay un ejercicio activo para registrar.");
      return true;
    }

    const existingExerciseEntry = session.exercisesCompleted.find((entry: any) => entry.name === currentExercise.name);
    if (!existingExerciseEntry) {
      session.exercisesCompleted.push({
        name: currentExercise.name,
        plannedSets: currentExercise.sets,
        plannedReps: currentExercise.reps,
        sets: []
      });
    }

    const exerciseEntry = session.exercisesCompleted.find((entry: any) => entry.name === currentExercise.name);
    if (!exerciseEntry) {
      session.exercisesCompleted.push({
        name: currentExercise.name,
        plannedSets: currentExercise.sets,
        plannedReps: currentExercise.reps,
        sets: [{ reps: parsed.reps, weight: parsed.weight }]
      });
    } else {
      exerciseEntry.sets.push({ reps: parsed.reps, weight: parsed.weight });
    }

    const keyboard = new InlineKeyboard()
      .text("✅ Terminar ejercicio", "finish_exercise")
      .text("⏭️ Saltar ejercicio", "skip_exercise");
    await ctx.reply(`Serie guardada: ${parsed.reps} reps x ${parsed.weight} kg.\n\nEnviá la próxima serie como: reps kg`, { reply_markup: keyboard });
    session.step = "collect_set";
    return true;
  }

  async handleCallback(ctx: any, user: any, chatId: number | undefined, callbackData: string | undefined) {
    if (!callbackData) {
      return false;
    }

    if (callbackData === "add_another_set") {
      const sessionKey = `${chatId}:${user.id}`;
      const session = this.sessions.get(sessionKey);
      if (!session) {
        await ctx.answerCallbackQuery({ text: "No hay una sesión activa." });
        return true;
      }

      session.step = "collect_set";
      await ctx.editMessageText("Perfecto. Enviá la próxima serie como: reps kg");
      await ctx.answerCallbackQuery({ text: "Agregando serie" });
      return true;
    }

    if (callbackData === "finish_exercise") {
      const sessionKey = `${chatId}:${user.id}`;
      const session = this.sessions.get(sessionKey);
      if (!session) {
        await ctx.answerCallbackQuery({ text: "No hay una sesión activa." });
        return true;
      }

      const nextExercise = session.exercises[session.currentExerciseIndex + 1];
      if (nextExercise) {
        const lastPerformance = await getLastExercisePerformance(user.id, nextExercise.name);
        const historyText = lastPerformance
          ? `Última vez: ${lastPerformance.reps} reps x ${lastPerformance.weight} kg (${new Date(lastPerformance.performedAt).toLocaleDateString("es-ES")}).`
          : "Todavía no registraste este ejercicio.";

        session.currentExerciseIndex += 1;
        session.currentExercise = nextExercise;
        session.step = "collect_set";
        const nextKeyboard = new InlineKeyboard()
          .text("✅ Terminar ejercicio", "finish_exercise")
          .text("⏭️ Saltar ejercicio", "skip_exercise");
        await ctx.editMessageText(`Ejercicio completado.\n\nSiguiente ejercicio: ${nextExercise.name}\nMeta: ${nextExercise.sets} series x ${nextExercise.reps} reps.\n\n${historyText}\n\nEnviá una serie como: reps kg`, { reply_markup: nextKeyboard });
      } else {
        await saveWorkoutSession(user.id, session);
        this.sessions.delete(sessionKey);
        const summaryBody = formatWorkoutSummary(session, session.startedAt);
        const motivationalMessage = [
          "¡Excelente trabajo! 💪",
          "",
          "Terminaste una sesión más y eso cuenta mucho.",
          "Cada entrenamiento te acerca un paso más a tus metas."
        ].join("\n");
        const completionReply = buildGuidedReply(
          "Resumen del entrenamiento",
          `${motivationalMessage}\n\nTu sesión quedó registrada.\n\n${summaryBody}`,
          "Podés ver tu historial con /entrenamientos o empezar otro entrenamiento con /entrenar.",
          buildQuickActionsKeyboard()
        );
        await ctx.editMessageText(completionReply.text, { reply_markup: completionReply.reply_markup ?? buildQuickActionsKeyboard() });
      }
      await ctx.answerCallbackQuery({ text: "Ejercicio completado" });
      return true;
    }

    if (callbackData === "skip_exercise") {
      const sessionKey = `${chatId}:${user.id}`;
      const session = this.sessions.get(sessionKey);
      if (!session) {
        await ctx.answerCallbackQuery({ text: "No hay una sesión activa." });
        return true;
      }

      const nextExercise = session.exercises[session.currentExerciseIndex + 1];
      if (nextExercise) {
        const lastPerformance = await getLastExercisePerformance(user.id, nextExercise.name);
        const historyText = lastPerformance
          ? `Última vez: ${lastPerformance.reps} reps x ${lastPerformance.weight} kg (${new Date(lastPerformance.performedAt).toLocaleDateString("es-ES")}).`
          : "Todavía no registraste este ejercicio.";

        session.currentExerciseIndex += 1;
        session.currentExercise = nextExercise;
        session.step = "collect_set";
        const nextKeyboard = new InlineKeyboard()
          .text("✅ Terminar ejercicio", "finish_exercise")
          .text("⏭️ Saltar ejercicio", "skip_exercise");
        await ctx.editMessageText(`Ejercicio saltado.\n\nSiguiente ejercicio: ${nextExercise.name}\nMeta: ${nextExercise.sets} series x ${nextExercise.reps} reps.\n\n${historyText}\n\nEnviá una serie como: reps kg`, { reply_markup: nextKeyboard });
      } else {
        await saveWorkoutSession(user.id, session);
        this.sessions.delete(sessionKey);
        const summaryBody = formatWorkoutSummary(session, session.startedAt);
        const completionReply = buildGuidedReply(
          "Resumen del entrenamiento",
          `Tu sesión quedó registrada.\n\n${summaryBody}`,
          "Podés ver tu historial con /entrenamientos o empezar otro entrenamiento con /entrenar.",
          buildQuickActionsKeyboard()
        );
        await ctx.editMessageText(completionReply.text, { reply_markup: completionReply.reply_markup ?? buildQuickActionsKeyboard() });
      }
      await ctx.answerCallbackQuery({ text: "Ejercicio saltado" });
      return true;
    }

    if (callbackData.startsWith("select_routine:")) {
      const routineId = callbackData.split(":")[1];
      const sessionKey = `${chatId}:${user.id}`;
      const session = this.sessions.get(sessionKey);

      if (!session) {
        await ctx.answerCallbackQuery({ text: "No hay una sesión activa." });
        return true;
      }

      const selectedRoutine = (await this.getUserRoutinesFn(user.id)).find((routine: RoutineEntry) => routine.id === routineId);
      if (!selectedRoutine) {
        await ctx.answerCallbackQuery({ text: "No se encontró esa rutina." });
        return true;
      }

      const firstExercise = selectedRoutine.exercises[0];
      if (!firstExercise) {
        await ctx.answerCallbackQuery({ text: "La rutina no tiene ejercicios." });
        return true;
      }

      const lastPerformance = await getLastExercisePerformance(user.id, firstExercise.name);
      const historyText = lastPerformance
        ? `Última vez: ${lastPerformance.reps} reps x ${lastPerformance.weight} kg (${new Date(lastPerformance.performedAt).toLocaleDateString("es-ES")}).`
        : "Todavía no registraste este ejercicio.";

      session.routineId = selectedRoutine.id;
      session.routineDay = selectedRoutine.day;
      session.exercises = selectedRoutine.exercises;
      session.currentExerciseIndex = 0;
      session.currentExercise = firstExercise;
      session.step = "collect_set";

      const initialKeyboard = new InlineKeyboard().text("⏭️ Saltar ejercicio", "skip_exercise");

      await ctx.editMessageText(`Entrenando ${selectedRoutine.day}.\n\nEjercicio: ${firstExercise.name}\nTu meta: ${firstExercise.sets} series x ${firstExercise.reps} reps.\n\n${historyText}\n\nEnviá una serie como: reps kg`, { reply_markup: initialKeyboard });
      await ctx.answerCallbackQuery({ text: "Rutina seleccionada" });
      return true;
    }

    return false;
  }
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
