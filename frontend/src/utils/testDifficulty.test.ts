import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_DIFFICULTY,
  buildTestDifficultyPrompt,
  isTestDifficulty,
  testDifficultyTemperature,
  testExplanationInstruction,
  testStemInstruction,
} from './testDifficulty';

describe('testDifficulty', () => {
  it('defaults to medium', () => {
    expect(DEFAULT_TEST_DIFFICULTY).toBe('medium');
  });

  it('accepts only easy/medium/hard', () => {
    expect(isTestDifficulty('medium')).toBe(true);
    expect(isTestDifficulty('oson')).toBe(false);
  });

  it('uses lower temperature for easy (fewer wrong items)', () => {
    expect(testDifficultyTemperature('easy')).toBeLessThan(testDifficultyTemperature('medium'));
    expect(testDifficultyTemperature('medium')).toBeLessThan(testDifficultyTemperature('hard'));
  });

  it('quality rules ban two correct options', () => {
    const prompt = buildTestDifficultyPrompt('medium');
    expect(prompt).toMatch(/bitta to'g'ri javob/i);
    expect(prompt).toMatch(/O'RTA/);
  });

  it('easy stem is not a complex vignette', () => {
    expect(buildTestDifficultyPrompt('easy')).toMatch(/OSON/);
    expect(testExplanationInstruction('easy')).toMatch(/3-5/);
    expect(testStemInstruction('hard')).toMatch(/2–3 gap/);
  });
});
