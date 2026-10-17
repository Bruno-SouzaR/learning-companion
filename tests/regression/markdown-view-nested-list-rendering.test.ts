import { describe, it, expect } from 'vitest';
import { marked } from 'marked';
import '@/components/markdown-view'; // Ensures marked options and custom renderer are initialized

describe('Regression: MarkdownView Nested List and Block Item Rendering', () => {
  it('safely renders markdown containing nested sub-lists without throwing or collapsing into raw text', () => {
    const markdownWithNestedList = `
### Programação Linear (PL)
- **Definição Teórica:** Técnica de otimização matemática.
- **Mecanismo & Aplicação Prática:** A PL traduz cenários reais:
    - **Sub-item A:** Variáveis de decisão.
    - **Sub-item B:** Restrições operacionais.
- **Exemplo Prático:** Maximizar $Z = 5x_1 + 3x_2$.

### Método Simplex
- **Definição Teórica:** Algoritmo iterativo sobre os vértices do poliedro.
- **Mecanismo & Aplicação Prática:**
    - Identifica solução básica inicial.
    - Executa pivoteamento em vértices adjacentes.
`;

    // Must not throw "Error: Token with list type was not found"
    expect(() => {
      const html = marked.parse(markdownWithNestedList) as string;
      expect(html).toContain('<h3 id="programacao-linear-pl"');
      expect(html).toContain('<h3 id="metodo-simplex"');
      expect(html).toContain('<li class="leading-relaxed">');
      expect(html).toContain('Sub-item A');
      expect(html).toContain('pivoteamento');
      // Must not collapse into a raw unparsed text dump
      expect(html).not.toMatch(/^<p>### Programação Linear/);
    }).not.toThrow();
  });

  it('renders Pontos Nucleares list with interactive styling while rendering concept lists as standard nested lists', () => {
    const mixedMarkdown = `
### Pontos Nucleares
- Ponto nuclear 1 sobre otimização
- Ponto nuclear 2 sobre o algoritmo Simplex

### Conceito Principal
- Item normal com detalhes adicionais:
    - Detalhe interno 1
    - Detalhe interno 2
`;

    const html = marked.parse(mixedMarkdown) as string;

    // Pontos nucleares list should have the interactive class
    expect(html).toContain('class="pontos-nucleares-list');
    expect(html).toContain('class="ponto-nuclear-item');
    expect(html).toContain('Ponto nuclear 1');

    // The concept list should have the standard list class and nested items
    expect(html).toContain('Detalhe interno 1');
    expect(html).toContain('Detalhe interno 2');
    expect(html).toContain('<h3 id="conceito-principal"');
  });
});
