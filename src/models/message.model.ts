import { InferSchemaType, Schema, model } from 'mongoose';
import { toJSONPlugin } from './plugins';

const readSchema = new Schema(
  { userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, readAt: { type: Date, required: true } },
  { _id: false },
);

const messageSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 5000 },
    attachmentWorksheetId: { type: Schema.Types.ObjectId, ref: 'Worksheet', default: null },
    readBy: { type: [readSchema], default: [] },
  },
  { timestamps: true },
);
messageSchema.index({ studentId: 1, createdAt: 1 });
messageSchema.plugin(toJSONPlugin);

export type MessageDoc = InferSchemaType<typeof messageSchema>;
export const Message = model('Message', messageSchema);
