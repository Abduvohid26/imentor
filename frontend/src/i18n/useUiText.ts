import { useCallback, useContext } from 'react';
import { AppLanguageContext } from '../App';
import { localeForLanguage, type AppLanguage } from './language';
import { translate, type UiTextKey } from './translations';

export function useUiText() {
  const { language } = useContext(AppLanguageContext);
  const t = useCallback(
    (key: UiTextKey, params?: Record<string, string | number>) => translate(language, key, params),
    [language],
  );
  return { t, language, locale: localeForLanguage(language) };
}

export function useTranslate(lang: AppLanguage) {
  return useCallback(
    (key: UiTextKey, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );
}
