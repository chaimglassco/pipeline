const { sendJson } = require("./_auth");

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_ROWS = 200;
const MAX_COLUMNS = 50;

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    const sourceUrl = String(req.query?.url || "").trim();
    const csvUrl = createGoogleSheetsCsvUrl(sourceUrl);
    if (!csvUrl) {
      return sendJson(res, 400, { error: "Native preview currently supports public Google Sheets links." });
    }

    const response = await fetch(csvUrl, {
      headers: {
        Accept: "text/csv,text/plain,*/*",
        "User-Agent": "LaunchFlow Sheet Preview",
      },
    });
    if (!response.ok) {
      return sendJson(res, response.status === 404 ? 404 : 502, { error: "The public sheet could not be loaded. Confirm sharing is enabled." });
    }

    const text = await readLimitedText(response);
    const rows = parseCsv(text).slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS));
    return sendJson(res, 200, { rows });
  } catch (error) {
    return sendJson(res, 500, { error: error?.message || "Sheet preview could not be loaded." });
  }
};

function createGoogleSheetsCsvUrl(sourceUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return "";
  }

  const hostname = parsedUrl.hostname.replace(/^www\./i, "").toLowerCase();
  if (parsedUrl.protocol !== "https:" || hostname !== "docs.google.com") return "";

  const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([^/]+)/i);
  if (!match?.[1]) return "";

  const gid = parsedUrl.searchParams.get("gid") || parsedUrl.hash.match(/gid=([0-9]+)/)?.[1] || "0";
  const csvUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/export`);
  csvUrl.searchParams.set("format", "csv");
  csvUrl.searchParams.set("gid", gid);
  return csvUrl.toString();
}

async function readLimitedText(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_CSV_BYTES) {
    throw new Error("Sheet preview is too large. Use a smaller public sheet or a specific tab.");
  }
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  if (row.some((value) => value !== "") || rows.length === 0) rows.push(row);
  return rows;
}
