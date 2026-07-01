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

bot.catch((err) => console.error("Error en el bot:", err));

bot.start();
console.log("GymBuddy corriendo y conectado a DB...");