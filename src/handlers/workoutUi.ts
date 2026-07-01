import { InlineKeyboard } from "grammy";

export function buildMainMenuKeyboard() {
  return new InlineKeyboard()
    .text("📝 Crear rutina", "menu_create_routine")
    .text("👀 Ver rutinas", "menu_view_routines")
    .row()
    .text("🏋️ Entrenar", "menu_start_workout")
    .text("📋 Entrenamientos", "menu_view_workouts")
    .row()
    .text("🗑️ Borrar rutinas", "menu_delete_routines")
    .text("❓ Ayuda", "menu_help");
}

export function buildQuickActionsKeyboard() {
  return new InlineKeyboard()
    .text("📝 Crear rutina", "menu_create_routine")
    .text("🏋️ Entrenar", "menu_start_workout")
    .row()
    .text("👀 Ver rutinas", "menu_view_routines")
    .text("📋 Historial", "menu_view_workouts");
}

export function buildHelpKeyboard() {
  return new InlineKeyboard()
    .text("📝 Crear rutina", "help_create_routine")
    .text("👀 Ver rutinas", "help_view_routines")
    .row()
    .text("🏋️ Entrenar", "help_start_workout")
    .text("📋 Entrenamientos", "help_view_workouts")
    .row()
    .text("🗑️ Borrar rutinas", "help_delete_routines")
    .text("📘 Ejemplos", "help_examples");
}

export function buildDeleteConfirmationKeyboard() {
  return new InlineKeyboard()
    .text("✅ Sí, borrar", "confirm_delete_routines")
    .text("❌ Cancelar", "cancel_delete_routines");
}

export function buildGuidedReply(title: string, body: string, nextStep?: string, keyboard?: InlineKeyboard) {
  const parts = [`✨ ${title}`, "", body];
  if (nextStep) {
    parts.push("", `Próximo paso: ${nextStep}`);
  }

  return {
    text: parts.join("\n"),
    reply_markup: keyboard
  };
}
