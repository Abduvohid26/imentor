import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';

import { AppLanguageContext, GlobalTopicContext } from './testContexts';

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(
    <AppLanguageContext.Provider value={{ language: 'uz', setLanguage: () => {} }}>
      <GlobalTopicContext.Provider value={null}>{ui}</GlobalTopicContext.Provider>
    </AppLanguageContext.Provider>,
    options,
  );
}
