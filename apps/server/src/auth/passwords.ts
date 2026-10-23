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

/**
 * Common passwords and keyboard/word patterns (lowercased, digits and punctuation stripped) that are refused even when
 * long enough. Offline list: the server never sends passwords or their hashes to an external breach service.
 */
const COMMON = new Set([
  'password', 'passwort', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'letmein', 'welcome', 'admin',
  'administrator', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'master', 'superman', 'sunshine', 'princess',
  'trustno', 'abc', 'abcdef', 'abcdefgh', 'qazwsx', 'changeme', 'secret', 'default', 'login', 'user', 'test', 'guest',
  'parol', 'пароль', 'йцукен', 'йцукенгшщзхъ', 'фывапролджэ', 'ячсмить', 'привет', 'админ', 'qwertz', 'azerty',
  'company', 'office', 'summer', 'winter', 'spring', 'autumn', 'january', 'december', 'zaq', 'xsw', 'pass',
]);

export function passwordProblems(password: string): string | null {
  if (password.length < 12) return 'Пароль должен содержать не менее 12 символов';
  if (password.length > 256) return 'Пароль слишком длинный';
  if (!/[\p{L}]/u.test(password) || !/\d/.test(password)) return 'Пароль должен содержать буквы и цифры';
  const core = password.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (COMMON.has(core) || new Set(password).size < 5) return 'Этот пароль слишком распространён — придумайте другой';
  return null;
}
