import path from 'path';
import { promises as fs } from 'fs';

export default async function handler(req, res) {
    const filePath = path.join(process.cwd(), 'src/utils/sampleExcel.xlsx');
    const fileBuffer = await fs.readFile(filePath);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sampleExcel.xlsx');
    res.send(fileBuffer);
}
