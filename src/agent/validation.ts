/**
 * Validate tool arguments against a JSON Schema.
 * Lightweight validation: checks required fields and basic types.
 */
export function validateToolArguments(
  schema: Record<string, unknown> | undefined,
  args: Record<string, any>,
): { valid: boolean; errors?: string[] } {
  if (!schema) return { valid: true };

  const errors: string[] = [];

  // Check required fields
  const required = schema.required as string[] | undefined;
  if (required && Array.isArray(required)) {
    for (const field of required) {
      if (args[field] === undefined || args[field] === null) {
        errors.push(`Missing required parameter: ${field}`);
      }
    }
  }

  // Check property types
  const properties = schema.properties as Record<string, { type?: string }> | undefined;
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      const value = args[key];
      if (value === undefined || value === null) continue;

      const expectedType = propSchema.type;
      if (!expectedType) continue;

      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push(`Parameter "${key}" must be an integer, got ${actualType}`);
        }
      } else if (expectedType === 'number') {
        if (typeof value !== 'number') {
          errors.push(`Parameter "${key}" must be a number, got ${actualType}`);
        }
      } else if (expectedType !== actualType) {
        errors.push(`Parameter "${key}" must be ${expectedType}, got ${actualType}`);
      }
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
