export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };
