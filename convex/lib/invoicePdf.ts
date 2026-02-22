const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const SHEET_MARGIN = 30;
const SHEET_X = SHEET_MARGIN;
const SHEET_Y = SHEET_MARGIN;
const SHEET_WIDTH = PAGE_WIDTH - SHEET_MARGIN * 2;
const SHEET_HEIGHT = PAGE_HEIGHT - SHEET_MARGIN * 2;

const CONTENT_PAD_X = 28;
const CONTENT_PAD_TOP = 28;
const CONTENT_PAD_BOTTOM = 24;
const CONTENT_X = SHEET_X + CONTENT_PAD_X;
const CONTENT_RIGHT = SHEET_X + SHEET_WIDTH - CONTENT_PAD_X;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_X;
const CONTENT_TOP = SHEET_Y + SHEET_HEIGHT - CONTENT_PAD_TOP;
const CONTENT_BOTTOM = SHEET_Y + CONTENT_PAD_BOTTOM;

type Rgb = readonly [number, number, number];

const COLORS = {
  pageBg: [3, 7, 18] as Rgb, // #030712
  sheetBg: [17, 24, 39] as Rgb, // #111827
  panelBg: [22, 30, 46] as Rgb, // slightly lighter than sheet
  panelAltBg: [31, 41, 55] as Rgb, // #1f2937
  border: [31, 41, 55] as Rgb, // #1f2937
  text: [249, 250, 251] as Rgb, // #f9fafb
  textSoft: [209, 213, 219] as Rgb, // #d1d5db
  textMuted: [156, 163, 175] as Rgb, // #9ca3af
  textFaint: [107, 114, 128] as Rgb, // #6b7280
  white: [255, 255, 255] as Rgb,
  sankofa: [16, 185, 129] as Rgb,
  lighthouse: [139, 92, 246] as Rgb,
  centex: [245, 158, 11] as Rgb,
  gfam: [59, 130, 246] as Rgb,
  warning: [251, 191, 36] as Rgb,
  success: [52, 211, 153] as Rgb,
  danger: [248, 113, 113] as Rgb,
  info: [96, 165, 250] as Rgb,
} as const;

const FONT_REGULAR = "F1";
const FONT_BOLD = "F2";

const HEADER_H1_SIZE = 18;
const HEADER_H2_SIZE = 11;
const BODY_SIZE = 10;
const BODY_SMALL_SIZE = 9;
const LABEL_SIZE = 8;

const LINE_HEIGHT = 14;

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

function rgbToPdf(color: Rgb): string {
  return color.map((channel) => (channel / 255).toFixed(4)).join(" ");
}

function estimateCharWidth(fontSize: number, bold = false): number {
  return fontSize * (bold ? 0.56 : 0.52);
}

function estimateTextWidth(text: string, fontSize: number, bold = false): number {
  return sanitizeText(text).length * estimateCharWidth(fontSize, bold);
}

function maxCharsForWidth(widthPt: number, fontSize: number, bold = false): number {
  return Math.max(4, Math.floor(widthPt / estimateCharWidth(fontSize, bold)));
}

function wrapTextByChars(value: string, widthChars: number): string[] {
  const clean = sanitizeText(value);
  if (!clean) return [""];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= widthChars) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let start = 0;
    while (start < word.length) {
      lines.push(word.slice(start, start + widthChars));
      start += widthChars;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function wrapTextToWidth(
  value: string,
  widthPt: number,
  fontSize: number,
  bold = false,
): string[] {
  return wrapTextByChars(value, maxCharsForWidth(widthPt, fontSize, bold));
}

function clampLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines;
  const next = lines.slice(0, maxLines);
  const last = next[maxLines - 1] ?? "";
  next[maxLines - 1] =
    last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 3))}...` : `${last}...`;
  return next;
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
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageObjectId = pageObjectStart + i;
    const contentObjectId = contentObjectStart + i;
    const stream = pageStreams[i];

    objects.set(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /${FONT_REGULAR} 3 0 R /${FONT_BOLD} 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );

    objects.set(contentObjectId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
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

function brandColor(brand: string): Rgb {
  switch (brand) {
    case "Sankofa":
      return COLORS.sankofa;
    case "Lighthouse":
      return COLORS.lighthouse;
    case "Centex":
      return COLORS.centex;
    case "GFAM Media Studios":
      return COLORS.gfam;
    default:
      return COLORS.gfam;
  }
}

function prettyStatus(status: string): string {
  const normalized = sanitizeText(status).toLowerCase();
  switch (normalized) {
    case "open":
      return "Open";
    case "paid":
      return "Paid";
    case "draft":
      return "Draft";
    case "void":
      return "Void";
    case "uncollectible":
      return "Uncollectible";
    case "sent":
      return "Sent";
    case "overdue":
      return "Overdue";
    default:
      return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Unknown";
  }
}

function statusColor(status: string): Rgb {
  const normalized = sanitizeText(status).toLowerCase();
  switch (normalized) {
    case "paid":
      return COLORS.success;
    case "draft":
      return COLORS.warning;
    case "void":
    case "overdue":
    case "uncollectible":
      return COLORS.danger;
    case "sent":
    case "open":
    default:
      return COLORS.info;
  }
}

type TableColumn = {
  key: "item" | "qty" | "unit" | "total";
  label: string;
  width: number;
  align?: "left" | "right" | "center";
};

const TABLE_COLUMNS: TableColumn[] = [
  { key: "item", label: "Item", width: 260, align: "left" },
  { key: "qty", label: "Qty", width: 44, align: "center" },
  { key: "unit", label: "Unit", width: 88, align: "right" },
  { key: "total", label: "Total", width: 92, align: "right" },
];

export function buildInvoicePdfDocument(input: InvoicePdfDocumentInput): Uint8Array {
  const pageCommands: string[][] = [];
  let pageIndex = -1;
  let cursorY = CONTENT_TOP;

  const totalPagesLaterMarkers: Array<{ page: number; x: number; y: number }> = [];

  const currentPageCommands = () => {
    if (pageIndex < 0) {
      throw new Error("PDF page not initialized");
    }
    return pageCommands[pageIndex];
  };

  const push = (...commands: string[]) => {
    currentPageCommands().push(...commands);
  };

  const drawRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    options?: {
      fill?: Rgb;
      stroke?: Rgb;
      lineWidth?: number;
    },
  ) => {
    const parts = ["q"];
    if (options?.lineWidth) {
      parts.push(`${options.lineWidth} w`);
    }
    if (options?.stroke) {
      parts.push(`${rgbToPdf(options.stroke)} RG`);
    }
    if (options?.fill) {
      parts.push(`${rgbToPdf(options.fill)} rg`);
    }
    parts.push(`${x} ${y} ${width} ${height} re`);
    if (options?.fill && options?.stroke) {
      parts.push("B");
    } else if (options?.fill) {
      parts.push("f");
    } else {
      parts.push("S");
    }
    parts.push("Q");
    push(parts.join(" "));
  };

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: { color?: Rgb; lineWidth?: number },
  ) => {
    push(
      [
        "q",
        `${options?.lineWidth ?? 1} w`,
        `${rgbToPdf(options?.color ?? COLORS.border)} RG`,
        `${x1} ${y1} m ${x2} ${y2} l S`,
        "Q",
      ].join(" "),
    );
  };

  const drawText = (
    text: string,
    options: {
      x: number;
      y: number;
      size?: number;
      bold?: boolean;
      color?: Rgb;
      align?: "left" | "right" | "center";
    },
  ) => {
    const safe = escapePdfText(text);
    const size = options.size ?? BODY_SIZE;
    const bold = options.bold ?? false;
    const textWidth = estimateTextWidth(safe, size, bold);
    let x = options.x;

    if (options.align === "right") {
      x -= textWidth;
    } else if (options.align === "center") {
      x -= textWidth / 2;
    }

    push(
      [
        "q",
        `${rgbToPdf(options.color ?? COLORS.text)} rg`,
        "BT",
        `/${bold ? FONT_BOLD : FONT_REGULAR} ${size} Tf`,
        `${x} ${options.y} Td`,
        `(${safe}) Tj`,
        "ET",
        "Q",
      ].join(" "),
    );
  };

  const startPage = () => {
    pageIndex += 1;
    pageCommands.push([]);
    cursorY = CONTENT_TOP;

    drawRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, { fill: COLORS.pageBg });
    drawRect(SHEET_X, SHEET_Y, SHEET_WIDTH, SHEET_HEIGHT, {
      fill: COLORS.sheetBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    drawText("GFAM Agency", {
      x: CONTENT_X,
      y: SHEET_Y + 10,
      size: 8,
      bold: true,
      color: COLORS.textFaint,
    });

    const markerX = CONTENT_RIGHT;
    const markerY = SHEET_Y + 10;
    totalPagesLaterMarkers.push({ page: pageIndex, x: markerX, y: markerY });
  };

  const ensurePage = () => {
    if (pageIndex < 0) {
      startPage();
    }
  };

  const ensureSpace = (height: number, onPageBreak?: () => void) => {
    ensurePage();
    if (cursorY - height < CONTENT_BOTTOM) {
      startPage();
      onPageBreak?.();
    }
  };

  const advance = (height: number) => {
    cursorY -= height;
  };

  const sectionLabel = (label: string, x: number, y: number) => {
    drawText(label.toUpperCase(), {
      x,
      y,
      size: LABEL_SIZE,
      bold: true,
      color: COLORS.textFaint,
    });
  };

  const drawWrappedTextBlock = (params: {
    lines: string[];
    x: number;
    yTop: number;
    width: number;
    fontSize?: number;
    color?: Rgb;
    bold?: boolean;
    lineHeight?: number;
  }) => {
    const fontSize = params.fontSize ?? BODY_SIZE;
    const lineHeight = params.lineHeight ?? Math.max(LINE_HEIGHT, fontSize + 3);
    params.lines.forEach((line, index) => {
      drawText(line, {
        x: params.x,
        y: params.yTop - index * lineHeight,
        size: fontSize,
        color: params.color ?? COLORS.text,
        bold: params.bold,
      });
    });
    return params.lines.length * lineHeight;
  };

  const issueDateLabel = formatDateValue(input.issueDate);
  const dueDateLabel = formatDateValue(input.dueDate);
  const subtotalCents = input.lineItems.reduce((sum, item) => {
    const unitCents = item.customPriceCents ?? item.unitPriceCents;
    return sum + unitCents * item.quantity;
  }, 0);
  const totalCents = subtotalCents;

  const paymentTermsDays = Math.max(
    0,
    Math.round((input.dueDate - input.issueDate) / (24 * 60 * 60 * 1000)),
  );
  const paymentTermsLabel =
    paymentTermsDays === 0 ? "Due on issue date" : `Net ${paymentTermsDays}`;

  const statusLabel = prettyStatus(input.status);
  const badgeColor = statusColor(input.status);
  const participatingBrands =
    input.participatingBrands.length > 0 ? input.participatingBrands : ["GFAM Agency"];

  const companyName =
    participatingBrands.length === 1 ? participatingBrands[0] : "GFAM Agency";
  const invoiceTitle = "INVOICE";

  const drawHeader = () => {
    ensureSpace(118);

    const headerX = CONTENT_X;
    const headerRight = CONTENT_RIGHT;
    const headerTop = cursorY;

    drawText(companyName, {
      x: headerX,
      y: headerTop,
      size: HEADER_H1_SIZE,
      bold: true,
      color: COLORS.text,
    });

    drawText(
      participatingBrands.length > 1
        ? participatingBrands.join(" • ")
        : "GFAM Agency Billing",
      {
        x: headerX,
        y: headerTop - 18,
        size: BODY_SMALL_SIZE,
        color: COLORS.textMuted,
      },
    );

    drawText(invoiceTitle, {
      x: headerRight,
      y: headerTop + 2,
      size: HEADER_H2_SIZE,
      bold: true,
      color: COLORS.textMuted,
      align: "right",
    });
    drawText(input.invoiceNumber, {
      x: headerRight,
      y: headerTop - 16,
      size: 14,
      bold: true,
      color: COLORS.text,
      align: "right",
    });

    const badgeText = statusLabel.toUpperCase();
    const badgeFontSize = 8;
    const badgeWidth = Math.max(
      64,
      estimateTextWidth(badgeText, badgeFontSize, true) + 18,
    );
    const badgeHeight = 18;
    const badgeX = headerRight - badgeWidth;
    const badgeY = headerTop - 42;
    drawRect(badgeX, badgeY, badgeWidth, badgeHeight, {
      fill: [badgeColor[0], badgeColor[1], badgeColor[2]],
      stroke: badgeColor,
      lineWidth: 0.8,
    });
    drawText(badgeText, {
      x: badgeX + badgeWidth / 2,
      y: badgeY + 5,
      size: badgeFontSize,
      bold: true,
      color: COLORS.sheetBg,
      align: "center",
    });

    const metaBoxHeight = 48;
    const metaBoxWidth = 210;
    const metaBoxX = headerRight - metaBoxWidth;
    const metaBoxY = headerTop - 104;
    drawRect(metaBoxX, metaBoxY, metaBoxWidth, metaBoxHeight, {
      fill: COLORS.panelBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    drawText("Issue", {
      x: metaBoxX + 12,
      y: metaBoxY + 31,
      size: LABEL_SIZE,
      bold: true,
      color: COLORS.textFaint,
    });
    drawText(issueDateLabel, {
      x: metaBoxX + 12,
      y: metaBoxY + 17,
      size: BODY_SMALL_SIZE,
      color: COLORS.textSoft,
    });

    drawText("Due", {
      x: metaBoxX + 112,
      y: metaBoxY + 31,
      size: LABEL_SIZE,
      bold: true,
      color: COLORS.textFaint,
    });
    drawText(dueDateLabel, {
      x: metaBoxX + 112,
      y: metaBoxY + 17,
      size: BODY_SMALL_SIZE,
      color: COLORS.textSoft,
    });

    advance(118);
  };

  const drawInfoPanels = () => {
    const gap = 16;
    const panelWidth = (CONTENT_WIDTH - gap) / 2;
    const leftX = CONTENT_X;
    const rightX = leftX + panelWidth + gap;
    const panelTop = cursorY;

    const senderLines = [
      "GFAM Agency",
      "813 Lake Air Dr Suite B",
      "Waco, TX 76710",
      "billing@gfamagency.com",
    ];

    const clientLines = [
      input.client.company || "Unknown Company",
      input.client.name || "Unknown Client",
      input.client.email || "No email",
    ];

    const brandText = participatingBrands.join(", ");
    const detailRows = [
      ["Payment Terms", paymentTermsLabel],
      ["Brands", brandText],
    ] as const;

    const brandLines = clampLines(
      wrapTextToWidth(brandText, panelWidth - 22 - 80, BODY_SMALL_SIZE),
      2,
    );

    const rightPanelHeight =
      14 + // top pad to label line
      16 + // section label area
      14 + // issue row
      14 + // due row
      14 + // terms row
      Math.max(14, brandLines.length * 11) + // brands row
      14; // bottom pad

    const leftPanelHeight = 142;
    const panelHeight = Math.max(leftPanelHeight, rightPanelHeight);

    ensureSpace(panelHeight + 16);

    drawRect(leftX, panelTop - panelHeight, panelWidth, panelHeight, {
      fill: COLORS.panelBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });
    drawRect(rightX, panelTop - panelHeight, panelWidth, panelHeight, {
      fill: COLORS.panelBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    sectionLabel("From", leftX + 12, panelTop - 14);
    drawWrappedTextBlock({
      lines: senderLines,
      x: leftX + 12,
      yTop: panelTop - 30,
      width: panelWidth - 24,
      fontSize: BODY_SMALL_SIZE,
      color: COLORS.textSoft,
      lineHeight: 12,
    });

    sectionLabel("Bill To", leftX + 12, panelTop - 84);
    drawText(clientLines[0], {
      x: leftX + 12,
      y: panelTop - 100,
      size: BODY_SIZE,
      bold: true,
      color: COLORS.text,
    });
    drawText(clientLines[1], {
      x: leftX + 12,
      y: panelTop - 113,
      size: BODY_SMALL_SIZE,
      color: COLORS.textSoft,
    });
    drawText(clientLines[2], {
      x: leftX + 12,
      y: panelTop - 125,
      size: BODY_SMALL_SIZE,
      color: COLORS.textMuted,
    });

    sectionLabel("Invoice Details", rightX + 12, panelTop - 14);
    const valueX = rightX + panelWidth - 12;
    let rowY = panelTop - 30;
    const rowGap = 13;

    drawText("Issue Date", {
      x: rightX + 12,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.textMuted,
    });
    drawText(issueDateLabel, {
      x: valueX,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.text,
      align: "right",
    });
    rowY -= rowGap;

    drawText("Due Date", {
      x: rightX + 12,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.textMuted,
    });
    drawText(dueDateLabel, {
      x: valueX,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.text,
      align: "right",
    });
    rowY -= rowGap;

    drawText(detailRows[0][0], {
      x: rightX + 12,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.textMuted,
    });
    drawText(detailRows[0][1], {
      x: valueX,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.text,
      align: "right",
    });
    rowY -= rowGap;

    drawText("Brands", {
      x: rightX + 12,
      y: rowY,
      size: BODY_SMALL_SIZE,
      color: COLORS.textMuted,
    });
    brandLines.forEach((line, index) => {
      drawText(line, {
        x: valueX,
        y: rowY - index * 11,
        size: BODY_SMALL_SIZE,
        color: COLORS.text,
        align: "right",
      });
    });

    advance(panelHeight + 16);
  };

  let tableHeaderRenderedOnCurrentPage = false;
  const tableX = CONTENT_X;
  const tableWidth = CONTENT_WIDTH;
  const tableHeaderHeight = 24;

  const drawTableHeader = () => {
    ensurePage();
    const yTop = cursorY;
    drawRect(tableX, yTop - tableHeaderHeight, tableWidth, tableHeaderHeight, {
      fill: COLORS.panelAltBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    let x = tableX + 10;
    TABLE_COLUMNS.forEach((col) => {
      const textX =
        col.align === "right"
          ? x + col.width - 6
          : col.align === "center"
            ? x + col.width / 2
            : x;
      drawText(col.label.toUpperCase(), {
        x: textX,
        y: yTop - 16,
        size: LABEL_SIZE,
        bold: true,
        color: COLORS.textFaint,
        align: col.align === "right" ? "right" : col.align === "center" ? "center" : "left",
      });
      x += col.width;
    });

    advance(tableHeaderHeight);
    tableHeaderRenderedOnCurrentPage = true;
  };

  const ensureTableHeader = () => {
    if (!tableHeaderRenderedOnCurrentPage) {
      ensureSpace(tableHeaderHeight + 8);
      drawTableHeader();
    }
  };

  const drawBrandPill = (brand: string, x: number, y: number) => {
    const color = brandColor(brand);
    const label = sanitizeText(brand);
    const fontSize = 7;
    const textWidth = estimateTextWidth(label, fontSize, true);
    const pillWidth = textWidth + 12;
    const pillHeight = 14;

    drawRect(x, y - 3, pillWidth, pillHeight, {
      fill: COLORS.panelBg,
      stroke: color,
      lineWidth: 0.7,
    });
    drawText(label, {
      x: x + pillWidth / 2,
      y,
      size: fontSize,
      bold: true,
      color,
      align: "center",
    });

    return pillWidth;
  };

  const drawLineItemsTable = () => {
    ensureTableHeader();

    for (const item of input.lineItems) {
      const appliedUnitCents = item.customPriceCents ?? item.unitPriceCents;
      const lineTotalCents = appliedUnitCents * item.quantity;
      const unitLabel = formatCurrencyFromCents(appliedUnitCents);
      const totalLabel = formatCurrencyFromCents(lineTotalCents);

      const itemColWidth = TABLE_COLUMNS[0].width - 18;
      const descLines = clampLines(
        wrapTextToWidth(item.description || "No description provided.", itemColWidth, BODY_SMALL_SIZE),
        2,
      );

      const metaPieces = [
        sanitizeText(item.category || "uncategorized"),
        item.isCustomItem ? "Custom item" : "Catalog service",
      ];
      const metaLine = metaPieces.join(" • ");

      const overrideLine =
        item.customPriceCents !== undefined
          ? `Custom unit price applied (catalog ${formatCurrencyFromCents(item.unitPriceCents)})`
          : null;
      const overrideLines = overrideLine
        ? clampLines(wrapTextToWidth(overrideLine, itemColWidth, 8), 1)
        : [];

      const baseHeight =
        10 + // top pad
        12 + // item name
        descLines.length * 11 +
        14 + // brand/category line
        (overrideLines.length > 0 ? 10 : 0) +
        8; // bottom pad
      const rowHeight = Math.max(52, baseHeight);

      ensureSpace(rowHeight, () => {
        tableHeaderRenderedOnCurrentPage = false;
        ensureTableHeader();
      });
      ensureTableHeader();

      const rowTop = cursorY;
      const rowBottom = rowTop - rowHeight;

      drawRect(tableX, rowBottom, tableWidth, rowHeight, {
        fill: COLORS.sheetBg,
        stroke: COLORS.border,
        lineWidth: 0.8,
      });

      let colCursorX = tableX + 10;

      drawText(item.name, {
        x: colCursorX,
        y: rowTop - 14,
        size: BODY_SIZE,
        bold: true,
        color: COLORS.text,
      });

      descLines.forEach((line, index) => {
        drawText(line, {
          x: colCursorX,
          y: rowTop - 27 - index * 11,
          size: BODY_SMALL_SIZE,
          color: COLORS.textMuted,
        });
      });

      const pillY = rowTop - 27 - descLines.length * 11 - 2;
      const pillWidth = drawBrandPill(item.brand, colCursorX, pillY);
      drawText(metaLine, {
        x: colCursorX + pillWidth + 8,
        y: pillY,
        size: 8,
        color: COLORS.textFaint,
      });

      if (overrideLines.length > 0) {
        drawText(overrideLines[0], {
          x: colCursorX,
          y: pillY - 11,
          size: 8,
          color: COLORS.info,
        });
      }

      colCursorX += TABLE_COLUMNS[0].width;
      drawText(String(item.quantity), {
        x: colCursorX + TABLE_COLUMNS[1].width / 2,
        y: rowTop - 18,
        size: BODY_SMALL_SIZE,
        color: COLORS.text,
        align: "center",
      });

      colCursorX += TABLE_COLUMNS[1].width;
      drawText(unitLabel, {
        x: colCursorX + TABLE_COLUMNS[2].width - 6,
        y: rowTop - 18,
        size: BODY_SMALL_SIZE,
        color: COLORS.textSoft,
        align: "right",
      });

      colCursorX += TABLE_COLUMNS[2].width;
      drawText(totalLabel, {
        x: colCursorX + TABLE_COLUMNS[3].width - 6,
        y: rowTop - 18,
        size: BODY_SMALL_SIZE,
        bold: true,
        color: COLORS.text,
        align: "right",
      });

      advance(rowHeight);
    }

    advance(12);
  };

  const drawTotalsBox = () => {
    const boxWidth = 222;
    const boxHeight = 92;
    ensureSpace(boxHeight + 12);

    const x = CONTENT_RIGHT - boxWidth;
    const yTop = cursorY;
    drawRect(x, yTop - boxHeight, boxWidth, boxHeight, {
      fill: COLORS.panelBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    sectionLabel("Totals", x + 12, yTop - 14);

    const rowLabelX = x + 12;
    const rowValueX = x + boxWidth - 12;

    let rowY = yTop - 31;
    const rowSpacing = 15;
    const totalsRows = [
      ["Subtotal", formatCurrencyFromCents(subtotalCents), false],
      ["Tax", formatCurrencyFromCents(0), false],
      ["Total Due", formatCurrencyFromCents(totalCents), true],
    ] as const;

    totalsRows.forEach(([label, value, emph], index) => {
      if (index === 2) {
        drawLine(x + 12, rowY + 5, x + boxWidth - 12, rowY + 5, {
          color: COLORS.border,
          lineWidth: 1,
        });
        rowY -= 6;
      }

      drawText(label, {
        x: rowLabelX,
        y: rowY,
        size: emph ? 10 : BODY_SMALL_SIZE,
        bold: emph,
        color: emph ? COLORS.text : COLORS.textMuted,
      });
      drawText(value, {
        x: rowValueX,
        y: rowY,
        size: emph ? 10 : BODY_SMALL_SIZE,
        bold: true,
        color: COLORS.text,
        align: "right",
      });
      rowY -= rowSpacing;
    });

    advance(boxHeight + 12);
  };

  const drawNotes = () => {
    const notesText = input.notes?.trim() || "No notes provided.";
    const wrapped = clampLines(
      wrapTextToWidth(notesText, CONTENT_WIDTH - 24, BODY_SMALL_SIZE),
      8,
    );
    const boxHeight = 34 + wrapped.length * 11 + 12;

    ensureSpace(boxHeight + 12);

    const x = CONTENT_X;
    const yTop = cursorY;
    drawRect(x, yTop - boxHeight, CONTENT_WIDTH, boxHeight, {
      fill: COLORS.panelBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    sectionLabel("Notes", x + 12, yTop - 14);
    wrapped.forEach((line, index) => {
      drawText(line, {
        x: x + 12,
        y: yTop - 31 - index * 11,
        size: BODY_SMALL_SIZE,
        color: notesText === "No notes provided." ? COLORS.textFaint : COLORS.textSoft,
      });
    });

    advance(boxHeight + 12);
  };

  const drawMultiBrandPills = () => {
    if (participatingBrands.length <= 1) return;

    const boxHeight = 34;
    ensureSpace(boxHeight + 12);

    const x = CONTENT_X;
    const yTop = cursorY;
    drawRect(x, yTop - boxHeight, CONTENT_WIDTH, boxHeight, {
      fill: COLORS.panelBg,
      stroke: COLORS.border,
      lineWidth: 1,
    });

    sectionLabel("Services Provided By", x + 12, yTop - 14);
    let pillX = x + 140;
    const pillY = yTop - 17;
    participatingBrands.forEach((brand) => {
      if (pillX > CONTENT_RIGHT - 90) return;
      const width = drawBrandPill(brand, pillX, pillY);
      pillX += width + 6;
    });

    advance(boxHeight + 12);
  };

  const drawFooter = () => {
    ensureSpace(40);
    drawLine(CONTENT_X, cursorY - 4, CONTENT_RIGHT, cursorY - 4, {
      color: COLORS.border,
      lineWidth: 1,
    });
    drawText("Thank you for your business", {
      x: CONTENT_X,
      y: cursorY - 20,
      size: BODY_SMALL_SIZE,
      color: COLORS.textFaint,
    });
    drawText("GFAM Agency", {
      x: CONTENT_RIGHT,
      y: cursorY - 20,
      size: BODY_SMALL_SIZE,
      bold: true,
      color: COLORS.textSoft,
      align: "right",
    });
    advance(40);
  };

  drawHeader();
  drawInfoPanels();

  tableHeaderRenderedOnCurrentPage = false;
  drawLineItemsTable();

  drawTotalsBox();
  drawNotes();
  drawMultiBrandPills();
  drawFooter();

  const totalPages = pageCommands.length;
  totalPagesLaterMarkers.forEach((marker) => {
    const pageCmds = pageCommands[marker.page];
    pageCmds.push(
      [
        "q",
        `${rgbToPdf(COLORS.textFaint)} rg`,
        "BT",
        `/${FONT_REGULAR} 8 Tf`,
        `${marker.x - estimateTextWidth(`Page ${marker.page + 1} of ${totalPages}`, 8)} ${marker.y} Td`,
        `(${escapePdfText(`Page ${marker.page + 1} of ${totalPages}`)}) Tj`,
        "ET",
        "Q",
      ].join(" "),
    );
  });

  const streams = pageCommands.map((commands) => commands.join("\n"));
  return buildPdfDocumentFromPageStreams(streams);
}
