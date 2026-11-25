import { z } from 'zod';
import { objectId, paginationQuery } from './common';

export const createMessageBody = z.object({
  body: z.string().trim().min(1).max(5000),
  attachmentWorksheetId: objectId.optional(),
});
export const listMessagesQuery = paginationQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
