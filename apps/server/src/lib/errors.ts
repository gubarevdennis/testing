export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Требуется вход в систему') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Недостаточно прав') => new AppError(403, 'forbidden', message);
/** Used instead of 403 where revealing existence would leak information (ACL-162). */
export const notFound = (message = 'Не найдено или нет доступа') => new AppError(404, 'not_found', message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const tooLarge = (message: string) => new AppError(413, 'too_large', message);
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details);
