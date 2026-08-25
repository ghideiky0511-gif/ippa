export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends ServiceError {
  constructor(
    code = "INVALID_INPUT",
    message = code,
    public readonly details?: unknown,
  ) { super(code, 400, message); }
}

export class ForbiddenError extends ServiceError {
  constructor(code = "FORBIDDEN", message = code) { super(code, 403, message); }
}

export class NotFoundError extends ServiceError {
  constructor(code = "NOT_FOUND", message = code) { super(code, 404, message); }
}

export class ConflictError extends ServiceError {
  constructor(code = "CONFLICT", message = code) { super(code, 409, message); }
}

export class GoneError extends ServiceError {
  constructor(code = "GONE", message = code) { super(code, 410, message); }
}
