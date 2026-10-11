import { pipeline } from '@xenova/transformers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPromise: Promise<any> | null = null;

export async function getExtractor() {
  if (!extractorPromise) {
    // Lazily initialize in-process pipeline on first call
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    }).catch((err) => {
      extractorPromise = null;
      console.error('Failed to load local embeddings pipeline:', err);
      throw err;
    });
  }
  return extractorPromise;
}

/**
 * Generate a 384-dimensional normalized float embedding vector for any text.
 * Runs 100% in-process on CPU with zero external network or API calls.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  try {
    const extractor = await getExtractor();
    const output = await extractor(text.trim(), {
      pooling: 'mean',
      normalize: true,
    });

    return Array.from(output.data);
  } catch (error) {
    console.error('Error computing embedding for text:', text.slice(0, 50), error);
    return [];
  }
}

/**
 * Compute cosine similarity between two normalized vectors.
 * Returns a value between -1.0 and 1.0 (typically 0.0 to 1.0 for normalized text embeddings).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }

  return dotProduct;
}
