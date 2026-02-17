export function createMockSqlAdapter(options = {}) {
  const rows = Array.isArray(options.rows)
    ? options.rows
    : [{ id: 1, name: "alpha" }];

  return {
    async query(request) {
      const maxRows = Number.isInteger(request?.max_rows) ? request.max_rows : rows.length;
      const limited = rows.slice(0, maxRows);
      return {
        rows: limited,
        row_count: limited.length,
        columns: Object.keys(limited[0] || {}),
        metadata: {
          read_only: request?.read_only ?? true,
        },
      };
    },
  };
}
