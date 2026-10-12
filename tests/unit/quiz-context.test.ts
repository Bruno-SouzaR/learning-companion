import { describe, it, expect } from 'vitest';
import { extractQuizContextSkeleton } from '@/server/quiz-context';

describe('Unit: QuizContext Skeleton Extractor', () => {
  it('extracts section titles, nuclear points and definition blocks, discarding long prose', () => {
    const fullMarkdown = `
# Capítulo 1: Sistemas de Arquivos

## 1. Estruturas de Dados
### Pontos Nucleares
- Superbloco guarda metadados globais
- Tabela de inodos mapeia arquivos
Longa prosa técnica explicativa de 20 parágrafos que não precisa ser reenviada para gerar 10 perguntas. ${'Detalhes extensos de arquitetura que ocupam milhares de caracteres '.repeat(20)}

### Inodos
- **Definição Teórica:** Estrutura que armazena atributos e ponteiros.
- **Mecanismo:** Aloca blocos indiretos quando o arquivo cresce.
Mais detalhes de implementação e exemplos de código longos que aumentam o tamanho da prosa. ${'Texto prolixo '.repeat(20)}

## 2. Métodos de Alocação
### Pontos Nucleares
- Alocação contígua sofre com fragmentação
- Lista encadeada tem acesso sequencial lento
`;

    const skeleton = extractQuizContextSkeleton(fullMarkdown);

    expect(skeleton).toContain('# Capítulo 1: Sistemas de Arquivos');
    expect(skeleton).toContain('## 1. Estruturas de Dados');
    expect(skeleton).toContain('- Superbloco guarda metadados globais');
    expect(skeleton).toContain('- Tabela de inodos mapeia arquivos');
    expect(skeleton).toContain('### Inodos');
    expect(skeleton).toContain('- **Definição Teórica:** Estrutura que armazena atributos e ponteiros.');
    expect(skeleton).toContain('## 2. Métodos de Alocação');
    expect(skeleton).toContain('- Alocação contígua sofre com fragmentação');

    // Confirms excessive prose is omitted
    expect(skeleton).not.toContain('Longa prosa técnica explicativa');
    expect(skeleton).not.toContain('Mais detalhes de implementação');
    expect(skeleton.length).toBeLessThan(fullMarkdown.length / 2);
  });

  it('handles empty input safely', () => {
    expect(extractQuizContextSkeleton('')).toBe('');
    expect(extractQuizContextSkeleton('   ')).toBe('');
  });
});
