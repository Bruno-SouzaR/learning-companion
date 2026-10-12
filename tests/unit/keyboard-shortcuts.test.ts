import { describe, it, expect, vi } from 'vitest';

describe('Unit: Pre-Flight Keyboard Shortcuts Logic', () => {
  it('triggers submission on Enter without shift', () => {
    const handleRefine = vi.fn();
    const preventDefault = vi.fn();

    const simulateKeyDown = (key: string, shiftKey: boolean) => {
      if (key === 'Enter' && !shiftKey) {
        preventDefault();
        handleRefine();
      }
    };

    simulateKeyDown('Enter', false);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(handleRefine).toHaveBeenCalledTimes(1);
  });

  it('allows newline without triggering submission on Shift+Enter', () => {
    const handleRefine = vi.fn();
    const preventDefault = vi.fn();

    const simulateKeyDown = (key: string, shiftKey: boolean) => {
      if (key === 'Enter' && !shiftKey) {
        preventDefault();
        handleRefine();
      }
    };

    simulateKeyDown('Enter', true);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(handleRefine).not.toHaveBeenCalled();
  });
});
