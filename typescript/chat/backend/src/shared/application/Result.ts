export class Result<T, E = string> {
  private constructor(
    private readonly isSuccess: boolean,
    private readonly value?: T,
    private readonly error?: E,
  ) {}

  static ok<T, E = string>(value: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static err<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  getOrThrow(): T {
    if (!this.isSuccess) {
      throw new Error(String(this.error));
    }
    return this.value as T;
  }

  getOr(defaultValue: T): T {
    return this.isSuccess ? (this.value as T) : defaultValue;
  }

  isOk(): boolean {
    return this.isSuccess;
  }

  isErr(): boolean {
    return !this.isSuccess;
  }

  unwrapError(): E {
    return this.error as E;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (!this.isSuccess) {
      return Result.err<U, E>(this.error!);
    }
    return Result.ok<U, E>(fn(this.value as T));
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (!this.isSuccess) {
      return Result.err<U, E>(this.error!);
    }
    return fn(this.value as T);
  }
}
