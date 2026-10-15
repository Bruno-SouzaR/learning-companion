/**
 * Defensive utility to sanitize study Markdown content,
 * replacing residual Spanish terms with correct Brazilian Portuguese (PT-BR) terms.
 */
export function sanitizePortugueseMarkdown(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Section headers and structural concepts
    .replace(/\bDefinici[oó]n\s+Te[oó]rica\b/gi, 'Definição Teórica')
    .replace(/\bMecanismo\s*(?:&|y|e)\s*Aplicaci[oó]n\s+Pr[aá]ctica\b/gi, 'Mecanismo & Aplicação Prática')
    .replace(/\bMecanismo\s*(?:&|y|e)\s*Aplica[cç][aã]o\s+Pr[aá]tica\b/gi, 'Mecanismo & Aplicação Prática')
    .replace(/\bEjemplo\s+Pr[aá]ctico\b/gi, 'Exemplo Prático')
    .replace(/\bEjemplo\b/gi, 'Exemplo')
    .replace(/\bejemplo\b/g, 'exemplo')
    .replace(/\bejemplos\b/g, 'exemplos')
    .replace(/\bEjemplos\b/g, 'Exemplos')
    .replace(/\bVentajas\b/gi, 'Vantagens')
    .replace(/\bventajas\b/g, 'vantagens')
    .replace(/\bDesventajas\b/gi, 'Desvantagens')
    .replace(/\bdesventajas\b/g, 'desvantagens')
    .replace(/\bSecci[oó]n\b/gi, 'Seção')
    .replace(/\bsecci[oó]n\b/g, 'seção')
    .replace(/\bsecciones\b/g, 'seções')
    .replace(/\bSecciones\b/g, 'Seções')
    .replace(/\bPontos\s+Clave\b/gi, 'Pontos Nucleares')
    .replace(/\bResumen\s+Estructurado\b/gi, 'Resumo Estruturado')
    // Defensively strip leaked bibliography and Explore+ subtopics
    .replace(/\n#{1,4}\s*(?:Refer[êe]ncias\s+Bibliogr[áa]ficas|Bibliografia|Explore\+|Saiba\s+Mais|Fontes)[\s\S]*?(?=\n#{1,3}\s|\n\s*---\s*\n|$)/gi, '')
    // Defensively strip leaked textbook assessment questions, answer choices, and gabaritos
    .replace(/\n#{1,4}\s*(?:Verificando\s+o\s+Aprendizado|Verifica[cç][aã]o\s+de\s+Aprendizado|Atividades?\s+de\s+Autoavalia[cç][aã]o|Autoavalia[cç][aã]o|Exerc[íi]cios?\s+Propostos?|Gabarito(?:\s+Final|\s+Comentado)?)[\s\S]*?(?=\n#{1,2}\s|\n\s*---\s*\n|$)/gi, '');
}
