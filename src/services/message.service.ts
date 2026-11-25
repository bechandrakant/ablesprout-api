import { z } from 'zod';
import { Message, Worksheet } from '../models';
import { AuthUser } from '../middleware/auth';
import { getAccessibleStudent, tenantFilter } from '../utils/tenant';
import { badRequest, notFound } from '../utils/errors';
import { oid } from '../utils/objectId';
import { Pagination, paginated, toSkip } from '../utils/pagination';
import { createMessageBody } from '../validators/message.validators';

const SENDER_FIELDS = 'name role';

export async function listMessages(actor: AuthUser, studentId: string, query: Pagination) {
  const student = await getAccessibleStudent(actor, studentId);
  const filter = tenantFilter(actor, { studentId: student._id });
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit).populate('senderId', SENDER_FIELDS),
    Message.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function createMessage(actor: AuthUser, studentId: string, input: z.infer<typeof createMessageBody>) {
  // Parents may message about their own child; read access is enough to post.
  const student = await getAccessibleStudent(actor, studentId);
  if (input.attachmentWorksheetId) {
    const ok = await Worksheet.exists(tenantFilter(actor, { _id: oid(input.attachmentWorksheetId), studentId: student._id }));
    if (!ok) throw badRequest('Attached worksheet must belong to this student');
  }
  const msg = await Message.create({
    schoolId: actor.schoolId,
    studentId: student._id,
    senderId: actor.id,
    body: input.body,
    attachmentWorksheetId: input.attachmentWorksheetId ? oid(input.attachmentWorksheetId) : null,
    readBy: [{ userId: oid(actor.id), readAt: new Date() }],
  });
  return msg.populate('senderId', SENDER_FIELDS);
}

export async function markRead(actor: AuthUser, messageId: string) {
  const msg = await Message.findOne(tenantFilter(actor, { _id: oid(messageId) }));
  if (!msg) throw notFound('Message');
  await getAccessibleStudent(actor, String(msg.studentId));
  // Idempotent: only push if this user hasn't read it yet.
  await Message.updateOne(
    tenantFilter(actor, { _id: msg._id, 'readBy.userId': { $ne: oid(actor.id) } }),
    { $push: { readBy: { userId: oid(actor.id), readAt: new Date() } } },
  );
  return Message.findById(msg._id).populate('senderId', SENDER_FIELDS);
}
