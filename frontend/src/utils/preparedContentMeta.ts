import type { SyllabusTopicContext } from './syllabusTopicContext';
import type { PreparedContentMeta } from './preparedContentStore';
import { getCurrentLocalUser } from './localStaffAuth';

export function buildPreparedContentMeta(topicCtx?: SyllabusTopicContext | null): PreparedContentMeta {
  const user = getCurrentLocalUser();
  return {
    authorDisplayName: user?.displayName || user?.phoneDigits || '',
    subjectName: topicCtx?.subjectName || '',
    subjectCode: topicCtx?.subjectCode || '',
  };
}
