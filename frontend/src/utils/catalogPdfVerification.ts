import type { AppLanguage } from '../i18n/language';
import { translate } from '../i18n/translations';

export type CatalogPdfMeta = {
  documentId?: string;
  verificationCode?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function catalogPdfVerificationFooter(meta: CatalogPdfMeta | undefined, lang: AppLanguage): string {
  if (!meta?.documentId && !meta?.verificationCode) return '';
  const parts: string[] = [];
  if (meta.documentId) parts.push(escapeHtml(meta.documentId));
  if (meta.verificationCode) {
    parts.push(`${escapeHtml(translate(lang, 'publicCatalog.verificationCode'))}: ${escapeHtml(meta.verificationCode)}`);
  }
  return `
    <div style="margin-top:32px;padding:14px 16px;border-radius:10px;border:1px solid #a7f3d0;background:#ecfdf5;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#047857;text-transform:uppercase;">
        ${escapeHtml(translate(lang, 'publicCatalog.verifiedDocument'))}
      </p>
      <p style="margin:0;font-size:12px;color:#065f46;font-family:ui-monospace,monospace;">${parts.join(' · ')}</p>
      <p style="margin:8px 0 0;font-size:10px;color:#047857;">FJSTI · iMentor · ${escapeHtml(translate(lang, 'welcome.footerInstitute'))}</p>
    </div>
  `;
}
