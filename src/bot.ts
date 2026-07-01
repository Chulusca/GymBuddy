// src/bot.ts
import { Bot } from "grammy";
import * as dotenv from "dotenv";
import { setupCommands } from "./handlers/commands";

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("Falta BOT_TOKEN");

const bot = new Bot(token);

// Inyectamos todos los comandos desde el handler
setupCommands(bot);

void bot.api.setMyCommands([
    { command: "start", description: "Iniciar y ver la bienvenida" },
    { command: "rutina", description: "Crear o cargar rutinas" },
    { command: "entrenar", description: "Registrar un entrenamiento" },
    { command: "verRutinas", description: "Ver tus rutinas guardadas" },
    { command: "entrenamientos", description: "Ver tu historial de entrenamientos" },
    { command: "help", description: "Mostrar ayuda" },
    { command: "borrarRutinas", description: "Borrar todas tus rutinas" }
]).catch((error) => console.error("No se pudieron registrar los comandos del bot:", error));

bot.catch((err) => console.error("Error en el bot:", err));

bot.start();
console.log("GymBuddy corriendo y conectado a DB...");