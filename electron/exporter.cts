import ExcelJS from "exceljs";
import path from "node:path";

interface ProjectExportRow {
  parentLabel: string;
  depth: number;
  elementType: string;
  partNumber: string;
  descriptionSlug: string;
  conceptCode: string;
  versionLabel: string;
  releaseState: string;
  fileName: string;
  filePath: string;
  createdAt: string;
}

interface ProductExportSheet {
  productId: string;
  productCode: string;
  productName: string;
  rows: ProjectExportRow[];
}

interface ProjectExportPayload {
  projectId: string;
  projectCode: string;
  projectName: string;
  generatedAt: string;
  sheets: ProductExportSheet[];
}

const sanitizeSheetName = (value: string): string =>
  value.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet";

const headerFill = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FF101920" }
};

const headerFont = {
  color: { argb: "FFF8F4E8" },
  bold: true
};

const headerAlignment = {
  vertical: "middle" as const,
  horizontal: "center" as const
};

const styleHeaderRow = (worksheet: ExcelJS.Worksheet) => {
  const header = worksheet.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = headerAlignment;
    cell.border = {
      top: { style: "thin", color: { argb: "FFD7CFBA" } },
      left: { style: "thin", color: { argb: "FFD7CFBA" } },
      bottom: { style: "thin", color: { argb: "FFD7CFBA" } },
      right: { style: "thin", color: { argb: "FFD7CFBA" } }
    };
  });
};

export const writeProjectExportWorkbook = async (
  payload: ProjectExportPayload,
  targetPath: string
): Promise<void> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rommel en doe wat";
  workbook.created = new Date(payload.generatedAt);
  workbook.modified = new Date();
  workbook.subject = `Project export ${payload.projectCode} ${payload.projectName}`;
  workbook.title = `PDM export ${payload.projectCode} ${payload.projectName}`;

  const overview = workbook.addWorksheet("Overview");
  overview.columns = [
    { header: "Project Code", key: "projectCode", width: 14 },
    { header: "Project Name", key: "projectName", width: 28 },
    { header: "Product Code", key: "productCode", width: 14 },
    { header: "Product Name", key: "productName", width: 28 },
    { header: "Rows", key: "rowCount", width: 10 },
    { header: "Exported At", key: "generatedAt", width: 24 }
  ];
  styleHeaderRow(overview);
  overview.autoFilter = "A1:F1";
  overview.views = [{ state: "frozen", ySplit: 1 }];

  for (const sheet of payload.sheets) {
    overview.addRow({
      projectCode: payload.projectCode,
      projectName: payload.projectName,
      productCode: sheet.productCode,
      productName: sheet.productName,
      rowCount: sheet.rows.length,
      generatedAt: payload.generatedAt
    });
  }

  for (const sheet of payload.sheets) {
    const worksheet = workbook.addWorksheet(
      sanitizeSheetName(`${sheet.productCode}-${sheet.productName}`)
    );

    worksheet.columns = [
      { header: "Parent", key: "parentLabel", width: 24 },
      { header: "Depth", key: "depth", width: 8 },
      { header: "Type", key: "elementType", width: 8 },
      { header: "Part", key: "partNumber", width: 8 },
      { header: "Description", key: "descriptionSlug", width: 24 },
      { header: "Concept", key: "conceptCode", width: 10 },
      { header: "Version", key: "versionLabel", width: 12 },
      { header: "State", key: "releaseState", width: 10 },
      { header: "Filename", key: "fileName", width: 52 },
      { header: "Suggested Path", key: "filePath", width: 72 },
      { header: "Created At", key: "createdAt", width: 24 }
    ];
    styleHeaderRow(worksheet);
    worksheet.autoFilter = "A1:K1";
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }

    worksheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm";
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const createdAtCell = row.getCell("createdAt");
      const createdAtValue = createdAtCell.value;
      if (typeof createdAtValue === "string" || typeof createdAtValue === "number") {
        createdAtCell.value = new Date(createdAtValue);
      }
      row.getCell("depth").alignment = { horizontal: "center" };
    });
  }

  await workbook.xlsx.writeFile(path.normalize(targetPath));
};
