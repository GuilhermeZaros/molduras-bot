import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY é obrigatória no .env');
}

export const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Modelo principal e reserva.
// A cota grátis é POR MODELO e por dia (gemini-2.5-flash dava só 20 req/dia);
// quando a do principal esgota, o bot troca sozinho pro reserva.
export const MODELO = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
export const MODELO_RESERVA = process.env.GEMINI_MODEL_RESERVA || 'gemini-3.1-flash-lite';
