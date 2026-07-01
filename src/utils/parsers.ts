const VALID_DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

function normalizeDayName(value: string): string | null {
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

    const dayMap: Record<string, string> = {
        lunes: "Lunes",
        martes: "Martes",
        miercoles: "Miercoles",
        jueves: "Jueves",
        viernes: "Viernes",
        sabado: "Sabado",
        domingo: "Domingo"
    };

    return dayMap[normalized] ?? null;
}

function splitCsvColumns(line: string) {
    const trimmed = line.trim();

    if (!trimmed) return [];

    if (trimmed.includes("|")) {
        return trimmed.split("|").map((part) => part.trim());
    }

    if (trimmed.includes(",")) {
        return trimmed.split(",").map((part) => part.trim());
    }

    if (trimmed.includes(";")) {
        return trimmed.split(";").map((part) => part.trim());
    }

    return trimmed.split(/\s{2,}/).map((part) => part.trim());
}

function isCsvHeader(line: string) {
    const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    return normalized.includes("dia") && normalized.includes("ejercicio") && normalized.includes("sets") && normalized.includes("rep");
}

export function parseRoutineInput(input: string): { days: string[], exercisesText: string } {
    // Busca todos los días consecutivos al principio del texto (ignorando mayúsculas y tildes)
    const regex = /^(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)[,\s]*)+/i;
    const normalizedInput = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const match = normalizedInput.match(regex);
    
    if (match) {
        const matchedText = match[0] ?? "";
        const daysPart = normalizedInput.substring(0, matchedText.length);
        const exercisesText = normalizedInput.substring(matchedText.length).trim();
        
        const days = daysPart.toLowerCase()
            .split(/[\s,]+/)
            .filter(d => VALID_DAYS.includes(d))
            .map(d => d.charAt(0).toUpperCase() + d.slice(1));
            
        return { days, exercisesText };
    }
    
    return { days: [], exercisesText: normalizedInput };
}

export function parseExercises(input: string) {
    const exercises: Array<{ order: number; name: string; sets: number; reps: number }> = [];
    const parts = input.split(','); 
    let currentOrder = 1; 
    
    for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;

        const match = trimmedPart.match(/(.+)\s+(\d+)[xX](\d+)/);
        const exerciseName = match?.[1]?.trim();
        const sets = match?.[2];
        const reps = match?.[3];

        if (exerciseName && sets && reps) {
            exercises.push({
                order: currentOrder++,
                name: exerciseName,
                sets: parseInt(sets, 10),
                reps: parseInt(reps, 10)
            });
        }
    }
    return exercises;
}

export function parseRoutineReorderInput(input: string): { day: string | null; exercisesText: string } {
    const normalizedInput = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const match = normalizedInput.match(/^(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(.*)$/i);

    if (!match) {
        return { day: null, exercisesText: normalizedInput };
    }

    const day = normalizeDayName(match[1] ?? "");
    return {
        day,
        exercisesText: match[2]?.trim() ?? ""
    };
}

export function swapExercisePositions<T extends { order: number; name: string; sets: number; reps: number }>(exercises: T[], firstIndex: number, secondIndex: number) {
    const updatedExercises = exercises.map((exercise) => ({ ...exercise }));

    if (firstIndex === secondIndex || firstIndex < 0 || secondIndex < 0 || firstIndex >= updatedExercises.length || secondIndex >= updatedExercises.length) {
        return updatedExercises.map((exercise, index) => ({ ...exercise, order: index + 1 }));
    }

    const firstExercise = updatedExercises[firstIndex];
    const secondExercise = updatedExercises[secondIndex];

    if (!firstExercise || !secondExercise) {
        return updatedExercises.map((exercise, index) => ({ ...exercise, order: index + 1 }));
    }

    updatedExercises[firstIndex] = secondExercise;
    updatedExercises[secondIndex] = firstExercise;

    return updatedExercises.map((exercise, index) => ({ ...exercise, order: index + 1 }));
}

export function parseCsvRoutineInput(input: string) {
    const routines: Array<{ day: string; exercises: Array<{ order: number; name: string; sets: number; reps: number }> }> = [];
    const grouped = new Map<string, Array<{ order: number; name: string; sets: number; reps: number }>>();

    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    for (const line of lines) {
        if (isCsvHeader(line)) continue;

        const columns = splitCsvColumns(line);
        if (columns.length < 4) continue;

        const day = normalizeDayName(columns[0] ?? "");
        const exerciseName = columns[1]?.trim();
        const sets = Number.parseInt(columns[2]?.trim() ?? "", 10);
        const reps = Number.parseInt(columns[3]?.trim() ?? "", 10);

        if (!day || !exerciseName || Number.isNaN(sets) || Number.isNaN(reps)) {
            continue;
        }

        if (!grouped.has(day)) {
            grouped.set(day, []);
        }

        const exercises = grouped.get(day)!;
        exercises.push({
            order: exercises.length + 1,
            name: exerciseName,
            sets,
            reps
        });
    }

    for (const [day, exercises] of grouped.entries()) {
        if (exercises.length > 0) {
            routines.push({ day, exercises });
        }
    }

    return routines;
}