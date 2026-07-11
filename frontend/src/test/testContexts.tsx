import { createContext } from 'react';

import type { AppLanguage } from '../i18n/language';
import type { SyllabusTopicContext } from '../utils/syllabusTopicContext';

export const GlobalTopicContext = createContext<SyllabusTopicContext | null>(null);

export const AppLanguageContext = createContext<{
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
}>({
  language: 'uz',
  setLanguage: () => {},
});
