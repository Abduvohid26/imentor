import type { SyllabusTopicContext } from './syllabusTopicContext';
import type { PreparedContentMeta } from './preparedContentStore';
import { getCurrentLocalUser } from './localStaffAuth';
import { isTopicContextComplete, resolveTopicNorm } from './syllabusTopicContext';

export function buildPreparedContentMeta(
  topicCtx?: SyllabusTopicContext | null,
): PreparedContentMeta {
  const user = getCurrentLocalUser();
  const meta: PreparedContentMeta = {
    authorDisplayName: user?.displayName || user?.phoneDigits || '',
    subjectName: topicCtx?.subjectName || '',
    subjectCode: topicCtx?.subjectCode || '',
  };
  if (topicCtx && isTopicContextComplete(topicCtx)) {
    meta.variantLabel = topicCtx.variantLabel;
    meta.topicCode = topicCtx.id.trim().toLowerCase().replace(/\s+/g, '');
    meta.topicNorm = resolveTopicNorm(topicCtx);
  }
  return meta;
}
