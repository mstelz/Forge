import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError, ZodIssue } from "zod";

export type ApiErrorBody = {
  error: string;
  issues?: ZodIssue[];
  id?: string;
  name?: string;
};

export const apiError = (
  c: Context,
  status: ContentfulStatusCode,
  body: ApiErrorBody,
) => c.json(body, status);

export const notFound = (c: Context) => apiError(c, 404, { error: "not_found" });

export const validationError = (c: Context, err: ZodError) =>
  apiError(c, 400, { error: "validation", issues: err.issues });

export const idConflict = (c: Context, id: string) =>
  apiError(c, 409, { error: "id_conflict", id });

export const nameConflict = (c: Context, name: string) =>
  apiError(c, 409, { error: "name_conflict", name });
