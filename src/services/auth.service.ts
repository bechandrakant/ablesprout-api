import { createHash, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { School, User, UserDoc } from '../models';
import { withTransaction } from '../db/transaction';
import { conflict, notFound, unauthorized } from '../utils/errors';
import { registerSchoolBody } from '../validators/auth.validators';
import { logger } from '../config/logger';

const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;
const MAX_SESSIONS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
let dummy: string | undefined;
const dummyHash = () => (dummy ??= bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS));
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

function signAccess(user: UserDoc) {
  return jwt.sign(
    { sub: user.id, schoolId: String(user.schoolId), role: user.role, typ: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] },
  );
}

/** Issues a new access/refresh pair and stores only the SHA-256 hash of the refresh token. */
async function issueTokens(user: UserDoc): Promise<TokenPair> {
  const refreshToken = jwt.sign({ sub: user.id, typ: 'refresh', jti: randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
  // Drop expired tokens, add the new one, and cap concurrent sessions.
  await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: { expiresAt: { $lte: new Date() } } } });
  await User.updateOne(
    { _id: user._id },
    { $push: { refreshTokens: { $each: [{ tokenHash: sha256(refreshToken), expiresAt }], $slice: -MAX_SESSIONS } } },
  );
  return { accessToken: signAccess(user), refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

export async function registerSchool(input: z.infer<typeof registerSchoolBody>) {
  if (await User.exists({ email: input.admin.email })) throw conflict('An account with this email already exists');
  const passwordHash = await hashPassword(input.admin.password);

  const { school, admin } = await withTransaction(async (session) => {
    const [school] = await School.create([input.school], { session });
    const [admin] = await User.create(
      [
        {
          schoolId: school._id,
          name: input.admin.name,
          email: input.admin.email,
          phone: input.admin.phone,
          preferredLanguage: input.admin.preferredLanguage,
          passwordHash,
          role: 'ADMIN',
        },
      ],
      { session },
    );
    return { school, admin };
  });

  const tokens = await issueTokens(admin);
  return { school, user: admin, ...tokens };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email }).select('+passwordHash');
  // Compare against a dummy hash when the user is missing to keep timing uniform.
  const hash = user?.passwordHash ?? dummyHash();
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string; typ: string };
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as typeof payload;
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
  if (payload.typ !== 'refresh') throw unauthorized('Invalid refresh token');

  const tokenHash = sha256(refreshToken);
  // Atomically consume the token (rotation): it can be used exactly once.
  const user = await User.findOneAndUpdate(
    { _id: payload.sub, refreshTokens: { $elemMatch: { tokenHash, expiresAt: { $gt: new Date() } } } },
    { $pull: { refreshTokens: { tokenHash } } },
    { new: true },
  );
  if (!user) {
    // Validly signed but unknown => already used or revoked. Treat as token theft: revoke all sessions.
    await User.updateOne({ _id: payload.sub }, { $set: { refreshTokens: [] } });
    logger.warn({ userId: payload.sub }, 'Refresh token reuse detected; all sessions revoked');
    throw unauthorized('Refresh token has been revoked');
  }
  return issueTokens(user);
}

export async function logout(refreshToken: string) {
  await User.updateOne(
    { refreshTokens: { $elemMatch: { tokenHash: sha256(refreshToken) } } },
    { $pull: { refreshTokens: { tokenHash: sha256(refreshToken) } } },
  );
}

export async function me(userId: string) {
  const user = await User.findById(userId).populate('schoolId', 'name city state board');
  if (!user) throw notFound('User');
  return user;
}
