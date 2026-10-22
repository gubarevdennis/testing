import { hash, verify } from '@node-rs/argon2';

// argon2id with OWASP-recommended parameters (m=19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

export function passwordProblems(password: string): string | null {
  if (password.length < 10) return 'Пароль должен содержать не менее 10 символов';
  if (password.length > 256) return 'Пароль слишком длинный';
  if (!/[\p{L}]/u.test(password) || !/\d/.test(password)) return 'Пароль должен содержать буквы и цифры';
  return null;
}
