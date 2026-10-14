import { describe, it, expect } from 'vitest';
import { parseSectionMarkdown, SECTION_STANDARDS_PROMPT } from '@/server/section-synthesizer';

describe('Unit: SectionMarkdown Parser', () => {
  it('extracts title, key points, and body from canonical output', () => {
    const candidate = `# Sistemas de Archivos: Almacenamiento Físico

### Pontos Nucleares
- La cache acelera el acceso al disco
- Los inodos almacenan metadatos

### Cache de Lectura
- **Definición Teórica:** La cache mantiene datos recientes en RAM.
- **Mecanismo & Aplicación Práctica:** Verifica memoria antes de E/S a disco.
- **Ejemplo Práctico:** El servidor de archivos mantiene 2s de lecturas recientes.
`;

    const parsed = parseSectionMarkdown(candidate);

    expect(parsed.sectionTitle).toBe('Sistemas de Archivos: Almacenamiento Físico');
    expect(parsed.keyPoints).toEqual([
      'La cache acelera el acceso al disco',
      'Los inodos almacenan metadatos',
    ]);
    expect(parsed.markdown).toContain('Definición Teórica');
    expect(parsed.markdown).not.toContain('Pontos Nucleares');
    expect(parsed.markdown).not.toContain('# Sistemas de Archivos');
  });

  it('strips a surrounding code fence entirely', () => {
    const candidate = '```markdown\n# Título\n\n### Pontos Nucleares\n- Punto A\n\nCuerpo del texto.\n```';
    const parsed = parseSectionMarkdown(candidate);

    expect(parsed.sectionTitle).toBe('Título');
    expect(parsed.keyPoints).toEqual(['Punto A']);
    expect(parsed.markdown).toBe('Cuerpo del texto.');
  });

  it('falls back to generic title for empty or heading-less input', () => {
    expect(parseSectionMarkdown('').sectionTitle).toBe('Seção sem título');
    expect(parseSectionMarkdown('Solo texto suelto.').sectionTitle).toBe('Seção sem título');
  });

  it('provides the mandatory structure rules for the LLM', () => {
    expect(SECTION_STANDARDS_PROMPT).toContain('Pontos Nucleares');
    expect(SECTION_STANDARDS_PROMPT).toContain('Definição Teórica');
    expect(SECTION_STANDARDS_PROMPT.toLowerCase()).toContain('omissions');
  });
});