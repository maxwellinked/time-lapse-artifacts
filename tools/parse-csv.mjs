export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (quoted) throw new Error("metadata.csv ends inside a quoted field");
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...values] = rows;
  if (!headers?.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error("metadata.csv has missing or duplicate headers");
  return values
    .filter((columns) => columns.some(Boolean))
    .map((columns, rowIndex) => {
      if (columns.length !== headers.length) {
        throw new Error(
          `metadata.csv row ${rowIndex + 2} has ${columns.length} fields; expected ${headers.length}`,
        );
      }
      return {
        rowIndex,
        values: Object.fromEntries(headers.map((header, index) => [header, columns[index]])),
      };
    });
}

