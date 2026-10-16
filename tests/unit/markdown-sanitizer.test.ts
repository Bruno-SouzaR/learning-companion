import { describe, it, expect } from 'vitest';
import { sanitizePortugueseMarkdown } from '@/server/section-synthesizer';

describe('Unit: sanitizePortugueseMarkdown', () => {
  it('replaces common Spanish section headers with Brazilian Portuguese', () => {
    const input = `
### Concepto
- **Definición Teórica:** Concepto en cuestión.
- **Mecanismo & Aplicación Práctica:** Cómo funciona.
- **Ejemplo Práctico:** Un ejemplo claro.
| Ventajas | Desventajas |
| --- | --- |
| Rápido | Complejo |
    `.trim();

    const result = sanitizePortugueseMarkdown(input);

    expect(result).toContain('Definição Teórica');
    expect(result).not.toContain('Definición');
    expect(result).toContain('Mecanismo & Aplicação Prática');
    expect(result).not.toContain('Aplicación');
    expect(result).toContain('Exemplo Prático');
    expect(result).not.toContain('Ejemplo');
    expect(result).toContain('Vantagens');
    expect(result).not.toContain('Ventajas');
    expect(result).toContain('Desvantagens');
    expect(result).not.toContain('Desventajas');
  });

  it('preserves clean Portuguese content without alteration', () => {
    const input = 'Este é um texto em português brasileiro com exemplo de código.';
    expect(sanitizePortugueseMarkdown(input)).toBe(input);
  });

  it('handles empty or non-string inputs safely', () => {
    expect(sanitizePortugueseMarkdown('')).toBe('');
    // @ts-expect-error test fallback
    expect(sanitizePortugueseMarkdown(null)).toBe('');
  });
});
