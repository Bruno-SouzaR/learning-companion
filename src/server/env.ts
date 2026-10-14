import { z } from 'zod';

const envSchema = z.object({
  LLM_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('llama-3.1-8b-instant'),
  LLM_MODEL_ENGLISH: z.string().optional(),
  LLM_MODEL_STUDIES: z.string().optional(),
  LLM_BASE_URL_STUDIES: z.string().optional(),
  PORT: z.coerce.number().default(3000),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse({
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_MODEL_ENGLISH: process.env.LLM_MODEL_ENGLISH,
    LLM_MODEL_STUDIES: process.env.LLM_MODEL_STUDIES,
    LLM_BASE_URL_STUDIES: process.env.LLM_BASE_URL_STUDIES,
    PORT: process.env.PORT,
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

export function getStudiesModel(): string {
  const env = getEnv();
  return env.LLM_MODEL_STUDIES || env.LLM_MODEL;
}

export function getStudiesBaseUrl(): string {
  const env = getEnv();
  return env.LLM_BASE_URL_STUDIES || env.LLM_BASE_URL;
}
