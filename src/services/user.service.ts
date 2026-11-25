import { randomBytes } from 'crypto';
import { z } from 'zod';
import { User } from '../models';
import { AuthUser } from '../middleware/auth';
import { tenantFilter } from '../utils/tenant';
import { forbidden, notFound } from '../utils/errors';
import { oid } from '../utils/objectId';
import { Pagination, paginated, toSkip } from '../utils/pagination';
import { hashPassword } from './auth.service';
import { createUserBody, updateUserBody } from '../validators/user.validators';
import { audit, changedFields } from './audit.service';

export async function createUser(actor: AuthUser, input: z.infer<typeof createUserBody>) {
  const temporaryPassword = input.password ? undefined : randomBytes(9).toString('base64url');
  const user = await User.create({
    schoolId: actor.schoolId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role,
    preferredLanguage: input.preferredLanguage,
    passwordHash: await hashPassword(input.password ?? temporaryPassword!),
  });
  await audit(actor, 'CREATE', 'User', user._id, { role: user.role });
  return { user, ...(temporaryPassword ? { temporaryPassword } : {}) };
}

export async function listUsers(actor: AuthUser, query: Pagination & { role?: string }) {
  const filter = tenantFilter(actor, query.role ? { role: query.role } : {});
  const { skip, limit } = toSkip(query);
  const [data, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return paginated(data, total, query);
}

export async function updateUser(actor: AuthUser, id: string, input: z.infer<typeof updateUserBody>) {
  const isSelf = actor.id === id;
  if (!isSelf && actor.role !== 'ADMIN') throw forbidden();
  if (input.role && actor.role !== 'ADMIN') throw forbidden('Only admins can change roles');

  const user = await User.findOne(tenantFilter(actor, { _id: oid(id) }));
  if (!user) throw notFound('User');
  if (input.role && user.role === 'ADMIN') throw forbidden('Admin role cannot be changed here');

  const { password, ...rest } = input;
  user.set(rest);
  if (password) {
    user.passwordHash = await hashPassword(password);
    user.set('refreshTokens', []); // password change signs out all sessions
  }
  await user.save();
  await audit(actor, 'UPDATE', 'User', user._id, changedFields(input));
  return user;
}
