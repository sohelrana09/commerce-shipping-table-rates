/**
 * A tiny in-memory stand-in for the aio-lib-db client: just the calls Extra Fees makes.
 * Supports equality, $in, $gt, $gte and $lt filters, sort, replaceOne with upsert, deletes, and
 * the aggregation stages the reports use ($match, $unwind, $group with $sum/$last, $sort).
 */

function matches(doc, query) {
  return Object.entries(query).every(([key, condition]) => {
    const value = doc[key];
    if (
      condition &&
      typeof condition === "object" &&
      !Array.isArray(condition)
    ) {
      if ("$in" in condition && !condition.$in.includes(value)) {
        return false;
      }
      if ("$gt" in condition && !(value > condition.$gt)) {
        return false;
      }
      if ("$gte" in condition && !(value >= condition.$gte)) {
        return false;
      }
      if ("$lt" in condition && !(value < condition.$lt)) {
        return false;
      }
      return true;
    }
    return value === condition;
  });
}

function valueAt(doc, key) {
  return key.split(".").reduce((value, part) => value?.[part], doc);
}

function sortRows(list, spec) {
  const keys = Object.entries(spec);
  return [...list].sort((a, b) => {
    for (const [key, dir] of keys) {
      const left = valueAt(a, key);
      const right = valueAt(b, key);
      if (left < right) {
        return -dir;
      }
      if (left > right) {
        return dir;
      }
    }
    return 0;
  });
}

function cursor(docs) {
  let list = [...docs];
  const api = {
    sort(spec) {
      list = sortRows(list, spec);
      return api;
    },
    toArray: async () => list.map((doc) => ({ ...doc })),
  };
  return api;
}

function path(doc, ref) {
  return ref
    .slice(1)
    .split(".")
    .reduce((value, key) => value?.[key], doc);
}

function evaluate(doc, expr) {
  if (typeof expr === "string" && expr.startsWith("$")) {
    return path(doc, expr);
  }
  if (expr && typeof expr === "object" && "$substrBytes" in expr) {
    const [inner, start, length] = expr.$substrBytes;
    return String(evaluate(doc, inner) ?? "").slice(start, start + length);
  }
  if (expr && typeof expr === "object") {
    return Object.fromEntries(
      Object.entries(expr).map(([key, value]) => [key, evaluate(doc, value)]),
    );
  }
  return expr;
}

function group(docs, spec) {
  const { _id: idExpr, ...accumulators } = spec;
  const groups = new Map();
  for (const doc of docs) {
    const id = evaluate(doc, idExpr);
    const key = JSON.stringify(id);
    const row = groups.get(key) ?? { _id: id };
    for (const [field, acc] of Object.entries(accumulators)) {
      if ("$sum" in acc) {
        row[field] = (row[field] ?? 0) + Number(evaluate(doc, acc.$sum) ?? 0);
      }
      if ("$last" in acc) {
        row[field] = evaluate(doc, acc.$last);
      }
    }
    groups.set(key, row);
  }
  return [...groups.values()];
}

function aggregate(docs, pipeline) {
  let rows = docs.map((doc) => ({ ...doc }));
  for (const stage of pipeline) {
    if (stage.$match) {
      rows = rows.filter((doc) => matches(doc, stage.$match));
    } else if (stage.$unwind) {
      rows = rows.flatMap((doc) =>
        (path(doc, stage.$unwind) ?? []).map((value) => ({
          ...doc,
          [stage.$unwind.slice(1)]: value,
        })),
      );
    } else if (stage.$group) {
      rows = group(rows, stage.$group);
    } else if (stage.$sort) {
      rows = sortRows(rows, stage.$sort);
    }
  }
  return rows;
}

export function createFakeDb() {
  const collections = new Map();
  const calls = { closed: 0 };

  const collection = (name) => {
    if (!collections.has(name)) {
      collections.set(name, []);
    }
    const docs = collections.get(name);
    return {
      aggregate: (pipeline) => cursor(aggregate(docs, pipeline)),
      createIndex: async () => "ok",
      deleteMany: async (query) => {
        const before = docs.length;
        const keep = docs.filter((doc) => !matches(doc, query));
        docs.splice(0, docs.length, ...keep);
        return { deletedCount: before - keep.length };
      },
      deleteOne: async (query) => {
        const index = docs.findIndex((doc) => matches(doc, query));
        if (index < 0) {
          return { deletedCount: 0 };
        }
        docs.splice(index, 1);
        return { deletedCount: 1 };
      },
      drop: async () => {
        docs.splice(0);
      },
      find: (query = {}) => cursor(docs.filter((doc) => matches(doc, query))),
      // Like App Builder Database Storage: a miss rejects instead of resolving to null.
      findOne: async (query) => {
        const doc = docs.find((d) => matches(d, query));
        if (!doc) {
          const error = new Error(
            "Request x to v1/collection/c/findOne failed: Document not found",
          );
          error.httpStatusCode = 404;
          throw error;
        }
        return { _id: "x", ...doc };
      },
      replaceOne: async (query, replacement, options = {}) => {
        const index = docs.findIndex((doc) => matches(doc, query));
        if (index >= 0) {
          docs[index] = { ...replacement };
        } else if (options.upsert) {
          docs.push({ ...replacement });
        }
        return { acknowledged: true };
      },
    };
  };

  const client = {
    close: async () => {
      calls.closed += 1;
    },
    collection,
  };

  return {
    calls,
    collections,
    connect: async () => client,
    seed(name, docs) {
      collection(name);
      collections.get(name).push(...docs.map((doc) => ({ ...doc })));
    },
  };
}
