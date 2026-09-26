export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "error",
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "bad_request", details);
export const unauthorized = (msg = "Sign in again.") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "Not found.") => new HttpError(404, msg, "not_found");
export const conflict = (msg: string, code = "conflict", details?: unknown) => new HttpError(409, msg, code, details);
export const tooMany = (msg: string) => new HttpError(429, msg, "rate_limited");
