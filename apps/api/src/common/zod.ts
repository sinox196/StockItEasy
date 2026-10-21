import { applyDecorators, ArgumentMetadata, Body, Injectable, PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z, ZodType } from 'zod';

/** Validates a payload with a schema from @stockiteasy/shared (same rules as the clients). */
@Injectable()
export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown, _meta: ArgumentMetadata) {
    return this.schema.parse(value ?? {});
  }
}

function jsonSchema(schema: ZodType): Record<string, unknown> {
  try {
    const s = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    delete s.$schema;
    return s;
  } catch {
    return { type: 'object' };
  }
}

/** Parameter decorator: validated body + OpenAPI request body generated from the zod schema. */
export const ZBody = (schema: ZodType) => Body(new ZodPipe(schema));
export const ZQuery = (schema: ZodType) => Query(new ZodPipe(schema));

/** Method decorator documenting the body in Swagger. */
export const ApiZodBody = (schema: ZodType) => applyDecorators(ApiBody({ schema: jsonSchema(schema) as never }));

/** Method decorator documenting query parameters in Swagger. */
export function ApiZodQuery(schema: ZodType) {
  const s = jsonSchema(schema) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const decorators = Object.entries(s.properties ?? {}).map(([name, prop]) =>
    ApiQuery({ name, required: (s.required ?? []).includes(name) && prop.default === undefined, schema: prop as never }),
  );
  return applyDecorators(...decorators);
}
