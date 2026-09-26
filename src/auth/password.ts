import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { StoreError } from '../core/errors'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../shared/accounts'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const N = 16_384
const R = 8
const P = 1
const KEY_LENGTH = 64

export function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new StoreError('invalid', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new StoreError('invalid', `Password must be at most ${MAX_PASSWORD_LENGTH} characters`)
  }
}

async function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  })
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password)
  const salt = randomBytes(16)
  const key = await derive(password, salt, N, R, P)
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(n),
    Number(r),
    Number(p),
  )
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
