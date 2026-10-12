import { describe, it, expect } from 'vitest';
import { marked } from 'marked';

describe('Unit: MarkdownView Rendering Logic', () => {
  it('converts markdown headings, lists and tables into formatted HTML', () => {
    const markdown = `
### Tópico de Teste
- Ponto 1
- Ponto 2

| Mecanismo | Vantagens |
| :--- | :--- |
| Cache | Rápido |
`;

    const html = marked.parse(markdown) as string;

    expect(html).toContain('<h3');
    expect(html).toContain('Tópico de Teste</h3>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Ponto 1</li>');
    expect(html).toContain('<table>');
    expect(html).toContain('>Mecanismo</th>');
    expect(html).toContain('>Cache</td>');
  });

  it('renders inline code and codeblocks properly', () => {
    const markdown = 'Código inline `ls -la` e bloco:\n```bash\nmkdir -p test\n```';
    const html = marked.parse(markdown) as string;

    expect(html).toContain('<code>ls -la</code>');
    expect(html).toContain('<pre><code');
    expect(html).toContain('mkdir -p test');
  });

  it('handles empty input safely', () => {
    const html = marked.parse('') as string;
    expect(html).toBe('');
  });
});
