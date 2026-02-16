const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 48;
const TOP_Y = 748;
const BOTTOM_Y = 54;
const DEFAULT_FONT_SIZE = 10;
const DEFAULT_LINE_HEIGHT = 14;
const BODY_WRAP_WIDTH = 92;

type InvoicePdfLineItem = {
  brand: string;
  category: string;
  name: string;
  description?: string;
  quantity: number;
  unitPriceCents: number;
  customPriceCents?: number;
  isCustomItem: boolean;
};

export type InvoicePdfDocumentInput = {
  invoiceNumber: string;
  status: string;
  issueDate: number;
  dueDate: number;
  participatingBrands: string[];
  client: {
    name: string;
    company: string;
    email: string;
  };
  notes?: string;
  lineItems: InvoicePdfLineItem[];
};

function sanitizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .trim();
}

function escapePdfText(value: string): string {
  return sanitizeText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDateValue(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
}

function wrapText(value: string, width: number): string[] {
  const clean = sanitizeText(value);
  if (!clean) return [""];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    // Hard split very long tokens
    let start = 0;
    while (start < word.length) {
      lines.push(word.slice(start, start + width));
      start += width;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function buildPdfDocumentFromPageStreams(pageStreams: string[]): Uint8Array {
  const objectCount = 4 + pageStreams.length * 2;
  const pageObjectStart = 5;
  const contentObjectStart = 5 + pageStreams.length;
  const objects = new Map<number, string>();

  const kids: string[] = [];
  for (let i = 0; i < pageStreams.length; i += 1) {
    kids.push(`${pageObjectStart + i} 0 R`);
  }

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageStreams.length} >>`);
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>");

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageObjectId = pageObjectStart + i;
    const contentObjectId = contentObjectStart + i;
    const stream = pageStreams[i];

    objects.set(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );

    objects.set(
      contentObjectId,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  }

  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let id = 1; id <= objectCount; id += 1) {
    const body = objects.get(id);
    if (!body) {
      throw new Error(`Missing PDF object ${id}`);
    }
    offsets[id] = output.length;
    output += `${id} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = output.length;
  output += `xref\n0 ${objectCount + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let id = 1; id <= objectCount; id += 1) {
    output += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }

  output += "trailer\n";
  output += `<< /Size ${objectCount + 1} /Root 1 0 R >>\n`;
  output += "startxref\n";
  output += `${xrefOffset}\n`;
  output += "%%EOF";

  return new TextEncoder().encode(output);
}

export function buildInvoicePdfDocument(input: InvoicePdfDocumentInput): Uint8Array {
  const pageCommands: string[][] = [];
  let currentPage = -1;
  let currentY = TOP_Y;

  const ensurePage = () => {
    if (currentPage === -1) {
      currentPage = 0;
      pageCommands.push([]);
      currentY = TOP_Y;
    }
  };

  const newPage = () => {
    currentPage += 1;
    pageCommands.push([]);
    currentY = TOP_Y;
  };

  const ensureSpace = (lineHeight: number = DEFAULT_LINE_HEIGHT) => {
    ensurePage();
    if (currentY - lineHeight < BOTTOM_Y) {
      newPage();
    }
  };

  const drawLine = () => {
    ensureSpace(DEFAULT_LINE_HEIGHT);
    const y = currentY + 4;
    pageCommands[currentPage].push(
      `0.4 w ${MARGIN_X} ${y} m ${PAGE_WIDTH - MARGIN_X} ${y} l S`
    );
    currentY -= DEFAULT_LINE_HEIGHT;
  };

  const addText = (
    text: string,
    options?: {
      bold?: boolean;
      size?: number;
      indent?: number;
      lineHeight?: number;
    }
  ) => {
    const size = options?.size ?? DEFAULT_FONT_SIZE;
    const lineHeight = options?.lineHeight ?? Math.max(DEFAULT_LINE_HEIGHT, size + 3);
    const font = options?.bold ? "F2" : "F1";
    const x = MARGIN_X + (options?.indent ?? 0);

    ensureSpace(lineHeight);
    pageCommands[currentPage].push(
      `BT /${font} ${size} Tf ${x} ${currentY} Td (${escapePdfText(text)}) Tj ET`
    );
    currentY -= lineHeight;
  };

  const addWrapped = (
    label: string,
    value: string,
    options?: {
      indent?: number;
    }
  ) => {
    const indent = options?.indent ?? 0;
    const wrapped = wrapText(value, BODY_WRAP_WIDTH);

    wrapped.forEach((line, index) => {
      if (index === 0) {
        addText(`${label}${line}`, { indent });
        return;
      }
      addText(line, { indent: indent + 8 });
    });
  };

  const issueDateLabel = formatDateValue(input.issueDate);
  const dueDateLabel = formatDateValue(input.dueDate);
  const subtotalCents = input.lineItems.reduce((sum, item) => {
    const unitCents = item.customPriceCents ?? item.unitPriceCents;
    return sum + unitCents * item.quantity;
  }, 0);

  addText("GFAM AGENCY INVOICE", { bold: true, size: 16, lineHeight: 20 });
  addText(`Invoice Number: ${input.invoiceNumber}`, { bold: true, size: 12, lineHeight: 18 });
  addText(`Status: ${input.status.toUpperCase()}`);
  addText(`Issue Date: ${issueDateLabel}`);
  addText(`Due Date: ${dueDateLabel}`);
  drawLine();

  addText("BILL TO", { bold: true, size: 11 });
  addWrapped("", input.client.company || "Unknown Company");
  addWrapped("", input.client.name || "Unknown Client");
  addWrapped("", input.client.email || "No email");
  drawLine();

  addText("INVOICE DETAILS", { bold: true, size: 11 });
  addWrapped("Participating Brands: ", input.participatingBrands.join(", ") || "N/A");
  addWrapped("Notes: ", input.notes || "No notes provided.");
  drawLine();

  addText("LINE ITEMS (FULL DETAIL)", { bold: true, size: 11 });

  input.lineItems.forEach((item, index) => {
    const unitCents = item.customPriceCents ?? item.unitPriceCents;
    const lineTotalCents = unitCents * item.quantity;
    const pricingSource =
      item.customPriceCents !== undefined ? "Custom price override" : "Catalog price";

    addText(`Item ${index + 1}: ${item.name}`, { bold: true });
    addWrapped("Description: ", item.description || "No description provided.", { indent: 10 });
    addWrapped("Brand: ", item.brand, { indent: 10 });
    addWrapped("Category: ", item.category, { indent: 10 });
    addWrapped("Item Type: ", item.isCustomItem ? "Custom/ad-hoc item" : "Catalog service", {
      indent: 10,
    });
    addWrapped("Pricing Source: ", pricingSource, { indent: 10 });
    addWrapped("Quantity: ", `${item.quantity}`, { indent: 10 });
    addWrapped("Catalog Unit Price: ", formatCurrencyFromCents(item.unitPriceCents), {
      indent: 10,
    });
    addWrapped(
      "Applied Unit Price: ",
      `${formatCurrencyFromCents(unitCents)}${
        item.customPriceCents !== undefined
          ? ` (override from ${formatCurrencyFromCents(item.unitPriceCents)})`
          : ""
      }`,
      {
        indent: 10,
      }
    );
    addWrapped("Line Total: ", formatCurrencyFromCents(lineTotalCents), { indent: 10 });
    drawLine();
  });

  addText("TOTALS", { bold: true, size: 11 });
  addWrapped("Subtotal: ", formatCurrencyFromCents(subtotalCents), { indent: 10 });
  addWrapped("Tax: ", formatCurrencyFromCents(0), { indent: 10 });
  addWrapped("Total Due: ", formatCurrencyFromCents(subtotalCents), { indent: 10 });

  const streams = pageCommands.map((commands) => commands.join("\n"));
  return buildPdfDocumentFromPageStreams(streams);
}
