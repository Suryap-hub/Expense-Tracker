/**
 * Validate request parts with Zod schemas. Parsed (and coerced) values land
 * on req.valid.{body,query,params}. Express 5 makes req.query read-only, so
 * we never overwrite the originals.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const part of ['params', 'query', 'body']) {
    if (schemas[part]) {
      req.valid[part] = schemas[part].parse(req[part] ?? {});
    }
  }
  next();
};

/**
 * Strip keys that MongoDB would interpret as operators ("$gt", "a.b") from
 * request bodies. Defense in depth against NoSQL injection - Zod validation
 * already rejects unknown shapes on every route.
 */
export function sanitizeBody(req, _res, next) {
  const clean = (value, depth = 0) => {
    if (depth > 10 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
    for (const key of Object.keys(value)) {
      if (key.startsWith('$') || key.includes('.')) delete value[key];
      else value[key] = clean(value[key], depth + 1);
    }
    return value;
  };
  if (req.body) clean(req.body);
  next();
}
