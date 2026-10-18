import { describe, it, expect } from 'vitest';
import { mergeContinuationText } from '@/server/llm';
import { sanitizePortugueseMarkdown } from '@/server/section-synthesizer';

describe('Regression: LLM Continuation Seam Stitching & Glitch Repair', () => {
  it('repairs interrupted bullet prefix stutters during continuation stitching', () => {
    const turn1 = '### Software LINDO\n- **Def';
    const turn2 = '- **Definição Teórica:** LINDO Systems é um software de otimização.';

    const stitched = mergeContinuationText(turn1, turn2);
    expect(stitched).not.toContain('Def- **Definição');
    expect(stitched).toContain('### Software LINDO\n- **Definição Teórica:** LINDO Systems');
  });

  it('deduplicates exact multi-character suffix/prefix overlap across turns', () => {
    const turn1 = 'A função objetivo é maximizar os lucros da empresa com base em restrições';
    const turn2 = 'com base em restrições orçamentárias de longo prazo.';

    const stitched = mergeContinuationText(turn1, turn2);
    expect(stitched).toBe(
      'A função objetivo é maximizar os lucros da empresa com base em restrições orçamentárias de longo prazo.'
    );
  });

  it('sanitizes residual joined labels and double-bullet markers in markdown sanitizer', () => {
    const rawGlitch1 = '- **Def- **Definição Teórica:** Conteúdo teórico aqui.';
    const rawGlitch2 =
      '- **Definição Teórica- **Mecanismo & Aplicação Prática:** Consiste em plotar as restrições.';

    const sanitized1 = sanitizePortugueseMarkdown(rawGlitch1);
    expect(sanitized1).toBe('- **Definição Teórica:** Conteúdo teórico aqui.');

    const sanitized2 = sanitizePortugueseMarkdown(rawGlitch2);
    expect(sanitized2).toContain('Definição Teórica:**\n- **Mecanismo & Aplicação Prática:**');
  });
});
