import { describe, it, expect } from 'vitest';

describe('Unit: StudyIngest Form Validation & Logic', () => {
  function validateSubmission(state: {
    title: string;
    topic: string;
    inputMode: 'file' | 'text';
    selectedFile: File | null;
    textContent: string;
  }): { isValid: boolean; error: string | null } {
    if (!state.title.trim() || !state.topic.trim()) {
      return { isValid: false, error: 'Título e tópico são campos obrigatórios.' };
    }
    if (state.inputMode === 'file' && !state.selectedFile) {
      return { isValid: false, error: 'Selecione um arquivo PDF para upload.' };
    }
    if (state.inputMode === 'text' && !state.textContent.trim()) {
      return { isValid: false, error: 'O conteúdo do texto não pode estar vazio.' };
    }
    return { isValid: true, error: null };
  }

  describe('Happy Path Validation', () => {
    it('accepts valid text mode payload', () => {
      const state = {
        title: 'Sistemas Operacionais: Escalonamento',
        topic: 'Operating Systems',
        inputMode: 'text' as const,
        selectedFile: null,
        textContent: 'O escalonador round-robin usa um quantum de tempo.',
      };

      const result = validateSubmission(state);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('accepts valid file mode payload when file is attached', () => {
      const mockFile = new File(['%PDF-1.4 mock'], 'chapter1.pdf', { type: 'application/pdf' });
      const state = {
        title: 'Capítulo 1',
        topic: 'Redes',
        inputMode: 'file' as const,
        selectedFile: mockFile,
        textContent: '',
      };

      const result = validateSubmission(state);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe('Edge Cases & Rejections', () => {
    it('rejects submission when title or topic is blank', () => {
      const missingTitle = validateSubmission({
        title: '   ',
        topic: 'Topic',
        inputMode: 'text',
        selectedFile: null,
        textContent: 'Some valid text',
      });
      expect(missingTitle.isValid).toBe(false);
      expect(missingTitle.error).toContain('obrigatórios');

      const missingTopic = validateSubmission({
        title: 'Title',
        topic: '   ',
        inputMode: 'text',
        selectedFile: null,
        textContent: 'Some valid text',
      });
      expect(missingTopic.isValid).toBe(false);
      expect(missingTopic.error).toContain('obrigatórios');
    });

    it('rejects file mode when selectedFile is null', () => {
      const result = validateSubmission({
        title: 'Title',
        topic: 'Topic',
        inputMode: 'file',
        selectedFile: null,
        textContent: '',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Selecione um arquivo PDF');
    });

    it('rejects text mode when textContent is empty or whitespace', () => {
      const result = validateSubmission({
        title: 'Title',
        topic: 'Topic',
        inputMode: 'text',
        selectedFile: null,
        textContent: '    \n\t   ',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('não pode estar vazio');
    });
  });
});
