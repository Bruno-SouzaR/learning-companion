import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { replaceStudySectionInFile } from '@/server/wiki-store';
import { getDb } from '@/server/db';

describe('Unit: replaceStudySectionInFile (Surgical In-Place Replacement)', () => {
  const tmpDir = path.join(process.cwd(), 'data', 'wiki', 'studies');
  const testFile = path.join(tmpDir, 'test-surgical-replace.md');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const initialContent = `
# Documento de Teste

**Tema:** Otimização &bull; **Data:** 2026-10-18

## 1. Introdução à Otimização

### Pontos Nucleares
- Ponto nuclear 1

### Conceito 1
- **Definição Teórica:** Teoria da seção 1.

---

## 2. Métodos de Resolução

### Pontos Nucleares
- Ponto nuclear 2 antigo

### Conceito Antigo
- **Definição Teórica:** Texto com erro na seção 2.

---

## 3. Conclusão e Aplicações

### Pontos Nucleares
- Ponto nuclear 3

### Conceito 3
- **Definição Teórica:** Teoria da seção 3 intacta.
`.trim();

    const frontmatter = {
      id: 'studies_test_surgical',
      title: 'Documento de Teste',
      slug: 'documento-de-teste',
      topic: 'Otimização',
      total_chunks: 3,
      version: 1,
    };

    fs.writeFileSync(testFile, matter.stringify(initialContent, frontmatter), 'utf-8');

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO entries (
        id, slug, file_path, module, title, explanation, tags, status, version, created_at, updated_at
      ) VALUES ('studies_test_surgical', 'documento-de-teste', ?, 'studies', 'Documento de Teste', ?, '[]', 'active', 1, datetime('now'), datetime('now'))
    `).run(testFile, initialContent);
  });

  afterEach(() => {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
    const db = getDb();
    db.prepare("DELETE FROM entries WHERE id = 'studies_test_surgical'").run();
  });

  it('surgically replaces section 2 while preserving sections 1 and 3 completely intact', async () => {
    const updatedSection = {
      sectionIndex: 2,
      sectionTitle: 'Métodos Exatos e Heurísticas (Corrigido)',
      keyPoints: ['Ponto nuclear 2 regenerado'],
      markdown: '### Conceito Novo\n- **Definição Teórica:** Definição 100% regenerada com sucesso.',
    };

    const success = await replaceStudySectionInFile(testFile, updatedSection, 'Otimização');
    expect(success).toBe(true);

    const updatedRaw = fs.readFileSync(testFile, 'utf-8');
    const parsed = matter(updatedRaw);

    // Section 1 must remain intact
    expect(parsed.content).toContain('## 1. Introdução à Otimização');
    expect(parsed.content).toContain('Teoria da seção 1.');

    // Section 2 must be replaced with new title and content
    expect(parsed.content).toContain('## 2. Métodos Exatos e Heurísticas (Corrigido)');
    expect(parsed.content).toContain('Ponto nuclear 2 regenerado');
    expect(parsed.content).toContain('Definição 100% regenerada com sucesso.');
    expect(parsed.content).not.toContain('Texto com erro na seção 2.');

    // Section 3 must remain intact
    expect(parsed.content).toContain('## 3. Conclusão e Aplicações');
    expect(parsed.content).toContain('Teoria da seção 3 intacta.');

    // SQLite entry must also be updated
    const db = getDb();
    const row = db
      .prepare('SELECT explanation FROM entries WHERE id = ?')
      .get('studies_test_surgical') as { explanation: string };
    expect(row.explanation).toContain('Métodos Exatos e Heurísticas (Corrigido)');
    expect(row.explanation).toContain('Definição 100% regenerada com sucesso.');
  });
});
