import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY é obrigatória no .env');
}

export const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Modelo Gemini Flash: rápido, bom em tool use, tier grátis generoso
// (gemini-2.5-flash tem 10 req/min e 250 req/dia no grátis)
export const MODELO = 'gemini-2.5-flash';
