import { Bot, InlineKeyboard } from "grammy";
import { registerUser } from "../services/userService";
import { parseRoutineInput, parseExercises, parseCsvRoutineInput } from "../utils/parsers";
import { createRoutine, deleteAllRoutinesForUser } from "../services/routineService";
import { getUserRoutines, getRoutineByDay, getRecentWorkouts } from "./workoutFlow";
import { buildDeleteConfirmationKeyboard, buildGuidedReply, buildHelpKeyboard, buildMainMenuKeyboard, buildQuickActionsKeyboard } from "./workoutUi";
import { WorkoutSessionController } from "./workoutSessionFlow";

const WEEKDAY_ORDER = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

type Exercise = { order: number; name: string; sets: number; reps: number };
type RoutineEntry = { id?: string; day: string; exercises: Exercise[] };
type TelegramUser = { id: number; username?: string; first_name?: string };

const pendingDeleteConfirmations = new Map<string, number>();
const workoutSessionFlow = new WorkoutSessionController(getUserRoutines);

function formatRoutineReply(prefix: string, routines: RoutineEntry[]) {
    const daysString = routines.map((routine) => routine.day).join(" y ");
    const firstRoutine = routines[0];
    const exerciseLines = firstRoutine?.exercises.map((exercise) => `${exercise.order}. ${exercise.name}: ${exercise.sets}x${exercise.reps}`) ?? [];

    return [`${prefix}: ${daysString}`, ...exerciseLines].join("\n\n");
}

function sortRoutinesByWeekday(routines: RoutineEntry[]) {
    return [...routines].sort((a, b) => {
        const aIndex = WEEKDAY_ORDER.indexOf(a.day);
        const bIndex = WEEKDAY_ORDER.indexOf(b.day);
        const aOrder = aIndex === -1 ? 999 : aIndex;
        const bOrder = bIndex === -1 ? 999 : bIndex;
        return aOrder - bOrder;
    });
}

function formatRoutineDetail(routine: { day: string; exercises: Exercise[] }) {
    const lines = routine.exercises.map((exercise) => `${exercise.order}. ${exercise.name}: ${exercise.sets}x${exercise.reps}`);
    return [`📅 ${routine.day}`, ...lines].join("\n");
}

function formatWorkoutHistory(workouts: Array<{ routineDay?: string | null; startedAt: Date; exercises: Array<{ name: string; plannedSets?: number | null; plannedReps?: number | null; sets: Array<{ reps: number; weight: number }> }> }>) {
    if (workouts.length === 0) {
        return "Todavía no registraste entrenamientos.";
    }

    return workouts.map((workout, index) => {
        const header = `${index + 1}. ${workout.routineDay ?? "Entrenamiento"} · ${new Date(workout.startedAt).toLocaleString("es-ES", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Argentina/Buenos_Aires"
        })}`;
        const exerciseLines = workout.exercises.map((exercise) => {
            const setSummary = exercise.sets.map((set) => `${set.reps}x${set.weight}`).join(", ");
            return `   - ${exercise.name}: ${setSummary}`;
        });
        return [header, ...exerciseLines].join("\n");
    }).join("\n\n");
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

async function saveRoutineEntries(user: TelegramUser, routineEntries: RoutineEntry[]) {
    await registerUser(user.id, user.username, user.first_name);

    const createdRoutines: RoutineEntry[] = [];

    for (const entry of routineEntries) {
        const created = await createRoutine(user.id, [entry.day], entry.exercises);
        createdRoutines.push(...created.map((item) => ({
            day: item.day,
            exercises: item.exercises.map((exercise: Exercise) => ({
                order: exercise.order,
                name: exercise.name,
                sets: exercise.sets,
                reps: exercise.reps
            }))
        })));
    }

    return createdRoutines;
}

async function handleTextRoutine(ctx: any, user: TelegramUser, message: string) {
    const { days, exercisesText } = parseRoutineInput(message);

    if (days.length === 0) {
        await ctx.reply("❌ Día inválido o no encontrado. Usá días de la semana (ej: Lunes o Lunes, Jueves).");
        return;
    }

    const parsedExercises = parseExercises(exercisesText);
    if (parsedExercises.length === 0) {
        await ctx.reply("❌ No entendí los ejercicios. Formato esperado: 'Sentadilla 4x12, Prensa 3x12'.");
        return;
    }

    try {
        const routines = await saveRoutineEntries(user, days.map((day) => ({ day, exercises: parsedExercises })));
        if (routines.length === 0) {
            await ctx.reply("Hubo un error al guardar tu rutina.");
            return;
        }

        const reply = buildGuidedReply(
            "Rutina creada",
            formatRoutineReply("✅ Rutina guardada para", routines),
            "Registrá tu primer entrenamiento con /entrenar o revisá tus rutinas con /verRutinas.",
            buildQuickActionsKeyboard()
        );
        await ctx.reply(reply.text, { reply_markup: reply.reply_markup });
    } catch (error) {
        console.error(error);
        await ctx.reply("Hubo un error interno al guardar tu rutina.");
    }
}

async function handleCsvRoutine(ctx: any, user: TelegramUser, document: any) {
    try {
        const fileId = document.file_id;
        const getFileUrl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`;
        const getFileResponse = await fetch(getFileUrl);
        const getFileData = await getFileResponse.json() as { ok?: boolean; result?: { file_path?: string } };
        const filePath = getFileData.result?.file_path;

        if (!filePath) {
            await ctx.reply("No pude leer el archivo adjunto.");
            return;
        }

        const csvUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
        const csvResponse = await fetch(csvUrl);
        const csvContent = await csvResponse.text();
        const parsedRoutines = parseCsvRoutineInput(csvContent);

        if (parsedRoutines.length === 0) {
            await ctx.reply("❌ No pude leer el CSV. Asegurate de usar columnas: Dia | Ejercicio | Sets | Reps");
            return;
        }

        const routines = await saveRoutineEntries(user, parsedRoutines);
        if (routines.length === 0) {
            await ctx.reply("Hubo un error al guardar tus rutinas.");
            return;
        }

        await ctx.reply(formatRoutineReply("✅ Rutinas cargadas para", routines));
    } catch (error) {
        console.error(error);
        await ctx.reply("Hubo un error al procesar el archivo CSV.");
    }
}

async function handleStartCommand(ctx: any) {
    const user = ctx.from;
    if (!user) return;

    try {
        const isNew = await registerUser(user.id, user.username, user.first_name);
        const welcomeText = isNew
            ? `¡Bienvenido a GymBuddy, ${user.first_name}! 🏋️‍♂️\n\nEstoy acá para ayudarte a organizar tus rutinas, registrar tus entrenamientos y ver tu progreso.`
            : `¡Qué onda, ${user.first_name}! Tu perfil ya está activo.\n\nEstas son las cosas que podés hacer con GymBuddy:`;

        const introBody = [
            "• /rutina: crear o cargar rutinas",
            "• /entrenar: registrar un entrenamiento",
            "• /verRutinas: ver tus rutinas por día",
            "• /entrenamientos: ver tu historial",
            "• /borrarRutinas: borrar todo con confirmación"
        ].join("\n");

        const welcomeReply = buildGuidedReply(
            isNew ? "¡Bienvenido a GymBuddy!" : "¡Qué onda!",
            `${welcomeText}\n\n${introBody}\n\nElegí una opción o escribí el comando que quieras.`,
            isNew ? "Empezá creando tu primera rutina con /rutina." : "Podés seguir con /rutina o /entrenar.",
            buildMainMenuKeyboard()
        );

        await ctx.reply(welcomeReply.text, { reply_markup: welcomeReply.reply_markup ?? buildMainMenuKeyboard() });
    } catch (error) {
        console.error("Error al procesar /start:", error);
        await ctx.reply("Hubo un problema al iniciar tu sesión. Intentá de nuevo en un momento.");
    }
}

async function handleRutinaCommand(ctx: any) {
    const user = ctx.from;
    const message = typeof ctx.match === "string" ? ctx.match : "";

    if (!user) return;

    try {
        const document = ctx.message?.document;
        if (document) {
            await handleCsvRoutine(ctx, user, document);
            return;
        }

        if (!message) {
            await ctx.reply("Formato incorrecto. Usá:\n/rutina Lunes, Jueves Sentadilla 4x12, Prensa 3x12\nO enviá un archivo CSV con columnas Dia | Ejercicio | Sets | Reps");
            return;
        }

        await handleTextRoutine(ctx, user, message);
    } catch (error) {
        console.error("Error al procesar /rutina:", error);
        await ctx.reply("No pude procesar tu rutina en este momento. Intentá de nuevo más tarde.");
    }
}

async function handleEntrenarCommand(ctx: any) {
    const user = ctx.from;
    if (!user) return;

    try {
        await workoutSessionFlow.startWorkoutSelection(ctx, user);
    } catch (error) {
        console.error("Error al procesar /entrenar:", error);
        await ctx.reply("No pude iniciar el flujo de entrenamiento. Intentá de nuevo más tarde.");
    }
}

async function handleHelpCommand(ctx: any) {
    const keyboard = buildHelpKeyboard();

    const helpReply = buildGuidedReply(
        "Guía rápida de GymBuddy",
        "Hola, soy tu GymBuddy 🤖. Te ayudo a crear rutinas, registrar entrenamientos y ver tu progreso.\n\nPara empezar, te recomiendo este orden:\n1. /rutina para crear tu rutina\n2. /entrenar para registrar tu primer entrenamiento\n3. /entrenamientos para ver tu progreso",
        "Elegí una opción de abajo para ir directo a la ayuda que necesitás.",
        keyboard
    );

    await ctx.reply(helpReply.text, { reply_markup: helpReply.reply_markup ?? keyboard });
}

async function handleVerRutinasCommand(ctx: any) {
    const user = ctx.from;
    if (!user) return;

    try {
        const routines = await getUserRoutines(user.id);
        if (routines.length === 0) {
            await ctx.reply("No tenés rutinas guardadas todavía.");
            return;
        }

        const sortedRoutines = sortRoutinesByWeekday(routines);
        const keyboard = new InlineKeyboard();
        sortedRoutines.forEach((routine) => {
            keyboard.text(routine.day, `view_routine_day:${routine.day}`);
            keyboard.row();
        });

        await ctx.reply("Elegí un día para ver la rutina guardada:", { reply_markup: keyboard });
    } catch (error) {
        console.error("Error al procesar /verRutinas:", error);
        await ctx.reply("No pude cargar tus rutinas en este momento. Intentá de nuevo más tarde.");
    }
}

async function handleEntrenamientosCommand(ctx: any) {
    const user = ctx.from;
    if (!user) return;

    try {
        const workouts = await getRecentWorkouts(user.id, 10);
        const historyReply = buildGuidedReply(
            "Historial de entrenamientos",
            `📋 Últimos entrenamientos registrados:\n\n${formatWorkoutHistory(workouts)}`,
            "Si querés seguir entrenando, usá /entrenar.",
            buildQuickActionsKeyboard()
        );
        await ctx.reply(historyReply.text, { reply_markup: historyReply.reply_markup ?? buildQuickActionsKeyboard() });
    } catch (error) {
        console.error("Error al procesar /entrenamientos:", error);
        await ctx.reply("No pude cargar tu historial en este momento. Intentá de nuevo más tarde.");
    }
}

async function handleBorrarRutinasCommand(ctx: any) {
    const user = ctx.from;
    if (!user) return;

    try {
        const key = `${ctx.chat?.id ?? user.id}:${user.id}`;
        pendingDeleteConfirmations.set(key, user.id);

        const keyboard = buildDeleteConfirmationKeyboard();

        await ctx.reply(
            "⚠️ Esto borrará todas tus rutinas guardadas. ¿Querés confirmar?",
            { reply_markup: keyboard }
        );
    } catch (error) {
        console.error("Error al procesar /borrarRutinas:", error);
        await ctx.reply("No pude preparar la confirmación para borrar tus rutinas. Intentá de nuevo más tarde.");
    }
}

async function handleSlashCommand(ctx: any, text: string) {
    const command = text.split(/\s+/)[0]?.slice(1).toLowerCase() ?? "";

    switch (command) {
        case "start":
            await handleStartCommand(ctx);
            return;
        case "rutina":
            await handleRutinaCommand(ctx);
            return;
        case "entrenar":
            await handleEntrenarCommand(ctx);
            return;
        case "help":
            await handleHelpCommand(ctx);
            return;
        case "verrutinas":
            await handleVerRutinasCommand(ctx);
            return;
        case "entrenamientos":
            await handleEntrenamientosCommand(ctx);
            return;
        case "borrarrutinas":
            await handleBorrarRutinasCommand(ctx);
            return;
        default:
            await ctx.reply("Perdón, no te entendí. 😅\n\nPodés usar alguno de estos comandos:\n• /rutina\n• /entrenar\n• /verRutinas\n• /entrenamientos\n• /help\n\nSi querés, te puedo ayudar paso a paso.");
    }
}

export function setupCommands(bot: Bot) {
    bot.command("start", handleStartCommand);
    bot.command("rutina", handleRutinaCommand);
    bot.command("entrenar", handleEntrenarCommand);
    bot.command("help", handleHelpCommand);
    bot.command("verRutinas", handleVerRutinasCommand);
    bot.command("entrenamientos", handleEntrenamientosCommand);
    bot.command("borrarRutinas", handleBorrarRutinasCommand);

    bot.on("message:text", async (ctx) => {
        const user = ctx.from;
        const chatId = ctx.chat?.id;
        if (!user || !chatId) return;

        const text = ctx.message.text?.trim() ?? "";
        if (!text) return;

        const handledByWorkoutFlow = await workoutSessionFlow.handleTextInput(ctx, user, chatId, text);
        if (handledByWorkoutFlow) {
            return;
        }

        if (text.startsWith("/")) {
            await handleSlashCommand(ctx, text);
            return;
        }

        await ctx.reply("Perdón, no te entendí. 😅\n\nPodés usar alguno de estos comandos:\n• /rutina\n• /entrenar\n• /verRutinas\n• /entrenamientos\n• /help\n\nSi querés, te puedo ayudar paso a paso.");
    });

    bot.callbackQuery(/^(menu_create_routine|menu_view_routines|menu_start_workout|menu_view_workouts|menu_delete_routines|menu_help|help_create_routine|help_view_routines|help_start_workout|help_view_workouts|help_delete_routines|help_examples|confirm_delete_routines|cancel_delete_routines|select_routine:[^\s]+|view_routine_day:[^\s]+|add_another_set|finish_exercise|skip_exercise)$/, async (ctx) => {
        const user = ctx.from;
        const chatId = ctx.chat?.id;

        if (!user || !chatId) {
            await ctx.answerCallbackQuery({ text: "No se pudo procesar la confirmación." });
            return;
        }

        const callbackData = ctx.callbackQuery.data;

        const handledByWorkoutFlow = await workoutSessionFlow.handleCallback(ctx, user, chatId, callbackData);
        if (handledByWorkoutFlow) {
            return;
        }

        if (callbackData?.startsWith("view_routine_day:")) {
            const day = callbackData.split(":")[1] ?? "";
            const routine = await getRoutineByDay(user.id, day);
            if (!routine) {
                await ctx.editMessageText("No encontré esa rutina guardada.");
                await ctx.answerCallbackQuery({ text: "Rutina no encontrada" });
                return;
            }

            await ctx.editMessageText(formatRoutineDetail(routine));
            await ctx.answerCallbackQuery({ text: "Rutina mostrada" });
            return;
        }

        if (callbackData === "menu_create_routine" || callbackData === "help_create_routine") {
            await ctx.editMessageText("📝 Crear rutina\n\nPodés usar /rutina con texto o con un archivo CSV.\n\nEjemplos:\n- /rutina Lunes Sentadilla 4x12, Prensa 3x10\n- /rutina Martes, Jueves Remo 3x10, Peso muerto 4x8\n- Enviá un CSV con columnas: Dia | Ejercicio | Sets | Reps");
            await ctx.answerCallbackQuery({ text: "Guía de rutinas" });
            return;
        }

        if (callbackData === "menu_view_routines" || callbackData === "help_view_routines") {
            await ctx.editMessageText("👀 Ver rutinas\n\nUsá /verRutinas para elegir un día y ver la rutina guardada.\n\nTe aparecerán los días disponibles para que elijas uno rápidamente.");
            await ctx.answerCallbackQuery({ text: "Guía de rutinas guardadas" });
            return;
        }

        if (callbackData === "menu_start_workout" || callbackData === "help_start_workout") {
            await ctx.editMessageText("🏋️ Entrenar\n\nUsá /entrenar para iniciar un registro de entrenamiento.\n\nEl bot te pedirá que envíes cada serie como: reps kg y te permitirá avanzar o saltar ejercicios.");
            await ctx.answerCallbackQuery({ text: "Guía de entrenamiento" });
            return;
        }

        if (callbackData === "menu_view_workouts" || callbackData === "help_view_workouts") {
            await ctx.editMessageText("📋 Entrenamientos\n\nUsá /entrenamientos para ver tus últimos entrenamientos registrados con fecha y ejercicios.");
            await ctx.answerCallbackQuery({ text: "Guía de historial" });
            return;
        }

        if (callbackData === "menu_delete_routines" || callbackData === "help_delete_routines") {
            await ctx.editMessageText("🗑️ Borrar rutinas\n\nUsá /borrarRutinas para eliminar todas tus rutinas guardadas.\n\nEl bot te pedirá confirmación antes de borrar todo.");
            await ctx.answerCallbackQuery({ text: "Guía de borrado" });
            return;
        }

        if (callbackData === "menu_help") {
            await ctx.editMessageText("❓ Ayuda rápida\n\nPodés empezar con /rutina para cargar una rutina, luego usar /entrenar para registrarla y /entrenamientos para ver tu progreso.");
            await ctx.answerCallbackQuery({ text: "Ayuda general" });
            return;
        }

        if (callbackData === "help_examples") {
            await ctx.editMessageText("📘 Ejemplos rápidos:\n\n- /rutina Lunes Sentadilla 4x12, Prensa 3x10\n- /rutina Martes, Jueves Remo 3x10, Peso muerto 4x8\n- /entrenar\n- /verRutinas\n- /entrenamientos");
            await ctx.answerCallbackQuery({ text: "Ejemplos mostrados" });
            return;
        }

        const key = `${chatId}:${user.id}`;
        const pendingUserId = pendingDeleteConfirmations.get(key);

        if (!pendingUserId) {
            await ctx.answerCallbackQuery({ text: "No había una confirmación pendiente." });
            return;
        }

        pendingDeleteConfirmations.delete(key);

        if (ctx.callbackQuery.data === "confirm_delete_routines") {
            try {
                const deletedCount = await deleteAllRoutinesForUser(user.id);
                await ctx.editMessageText(`✅ Se borraron ${deletedCount} rutinas.`);
                await ctx.answerCallbackQuery({ text: "Rutinas borradas" });
            } catch (error) {
                console.error(error);
                await ctx.editMessageText("❌ Ocurrió un error al borrar las rutinas.");
                await ctx.answerCallbackQuery({ text: "Error al borrar" });
            }
            return;
        }

        await ctx.editMessageText("Operación cancelada.");
        await ctx.answerCallbackQuery({ text: "Cancelado" });
    });
}