export function createMockOcrAdapter(options = {}) {
  const text = typeof options.text === "string" ? options.text : "Default OCR text";
  return {
    async ocr(request) {
      return {
        text,
        page_no: request?.page_no ?? 1,
        blocks: [
          {
            text,
            confidence: 0.99,
          },
        ],
      };
    },
  };
}

