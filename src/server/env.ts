import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  LLM_BASE_URL: z.string().default('http://127.0.0.1:8085/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gemma-4-e4b'),
  LLM_MODEL_ENGLISH: z.string().optional(),
  LLM_BASE_URL_ENGLISH: z.string().optional(),
  LLM_MODEL_STUDIES: z.string().optional(),
  LLM_BASE_URL_STUDIES: z.string().optional(),
  PORT: z.coerce.number().default(3000),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function loadDotEnvFile(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    result[key] = val;
  }
  return result;
}

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const diskEnv = loadDotEnvFile();
  const parsed = envSchema.safeParse({
    LLM_BASE_URL: diskEnv.LLM_BASE_URL || process.env.LLM_BASE_URL,
    LLM_API_KEY: diskEnv.LLM_API_KEY || process.env.LLM_API_KEY,
    LLM_MODEL: diskEnv.LLM_MODEL || process.env.LLM_MODEL,
    LLM_MODEL_ENGLISH: diskEnv.LLM_MODEL_ENGLISH || process.env.LLM_MODEL_ENGLISH,
    LLM_BASE_URL_ENGLISH: diskEnv.LLM_BASE_URL_ENGLISH || process.env.LLM_BASE_URL_ENGLISH,
    LLM_MODEL_STUDIES: diskEnv.LLM_MODEL_STUDIES || process.env.LLM_MODEL_STUDIES,
    LLM_BASE_URL_STUDIES: diskEnv.LLM_BASE_URL_STUDIES || process.env.LLM_BASE_URL_STUDIES,
  });

  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.format());
    throw new Error('Invalid environment variables for learning-companion');
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function getEnglishModel(): string {
  const env = getEnv();
  return env.LLM_MODEL_ENGLISH || env.LLM_MODEL;
}

export function getEnglishBaseUrl(): string {
  const env = getEnv();
  return env.LLM_BASE_URL_ENGLISH || env.LLM_BASE_URL;
}
export function getStudiesModel(): string {
  const env = getEnv();
  return env.LLM_MODEL_STUDIES || env.LLM_MODEL;
}

export function getStudiesBaseUrl(): string {
  const env = getEnv();
  return env.LLM_BASE_URL_STUDIES || env.LLM_BASE_URL;
}
