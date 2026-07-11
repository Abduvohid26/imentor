import { describe, expect, it } from 'vitest';

import { stripQuestionsForStudent } from './liveTestApi';

describe('stripQuestionsForStudent', () => {
  it('removes answer key and explanation', () => {
    const out = stripQuestionsForStudent([
      {
        question: 'Savol?',
        options: ['A', 'B', 'C'],
        correctOptionIndex: 1,
        explanation: 'secret',
      },
    ]);
    expect(out).toEqual([
      {
        question: 'Savol?',
        options: ['A', 'B', 'C'],
      },
    ]);
  });
});

describe('isPublicStudentTestUrl', () => {
  it('detects student mode from query string', async () => {
    const { isPublicStudentTestUrl } = await import('./liveTestApi');
    window.history.pushState({}, '', '/?mode=student&sid=lts_demo');
    expect(isPublicStudentTestUrl()).toBe(true);
    window.history.pushState({}, '', '/');
    expect(isPublicStudentTestUrl()).toBe(false);
  });
});
