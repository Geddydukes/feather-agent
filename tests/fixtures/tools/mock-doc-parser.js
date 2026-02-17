export function createMockPdfParser(options = {}) {
  const pages = Array.isArray(options.pages)
    ? options.pages
    : [
        { page_no: 1, text: "Default page 1 text" },
      ];

  return {
    async parse(request) {
      const maxPages = Number.isInteger(request?.max_pages) ? request.max_pages : pages.length;
      return {
        pages: pages.slice(0, maxPages),
        metadata: {
          source: request?.path ? "path" : "content_base64",
        },
      };
    },
  };
}

