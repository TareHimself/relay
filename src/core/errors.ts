export class StoreError extends Error {
  constructor(
    public readonly code: 'not_found' | 'conflict' | 'invalid' | 'ambiguous' | 'forbidden',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'StoreError'
  }
}
