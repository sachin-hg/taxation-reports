import ExcelJS from 'exceljs'

// Function to create a worksheet from the content
const createWorksheet = (workbook, content, sheetName) => {
    const worksheet = workbook.addWorksheet(sheetName);

    content.forEach(table => {
        const title = table.title || ''; // Default to empty title if not present
        const type = table.type || 'VERTICAL_TABLE'; // Default to HORIZONTAL_TABLE if not present
        const data = table.data;
        const headers = table.headers || Object.keys(data[0])

        if (title) {
            const titleRow = worksheet.addRow([title]);
            titleRow.font = { bold: true };
        }

        if (type === 'HORIZONTAL_TABLE') {
            headers.forEach((header) => {
                const row = worksheet.addRow([header, ...data.map(d => d[header])])
                const cell = row.getCell(1)
                cell.font = { bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD3D3D3' }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF000000' } },
                    left: { style: 'thin', color: { argb: 'FF000000' } },
                    bottom: { style: 'thin', color: { argb: 'FF000000' } },
                    right: { style: 'thin', color: { argb: 'FF000000' } }
                };
            })
        } else if (type === 'VERTICAL_TABLE') {
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell(cell => {
                cell.font = { bold: true };
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD3D3D3' }
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FF000000' } },
                    left: { style: 'thin', color: { argb: 'FF000000' } },
                    bottom: { style: 'thin', color: { argb: 'FF000000' } },
                    right: { style: 'thin', color: { argb: 'FF000000' } }
                };
            });

            data.forEach(obj => {
                const row = Object.values(obj);
                worksheet.addRow(row);
            });
        }

        worksheet.addRows([[], []]); // Blank row after each table
    });

    return worksheet;
};

// Function to generate Excel file from JSON data
export const generateExcelFromJson = async (jsonData) => {
    const workbook = new ExcelJS.Workbook();

    jsonData.forEach(sheet => {
        createWorksheet(workbook, sheet.content, sheet.sheetName);
    });

    return workbook.xlsx
};
