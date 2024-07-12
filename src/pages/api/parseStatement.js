import { parseStatements } from '@/utils/growStatementParser'; // Adjust the import path as needed
import { IncomingForm } from 'formidable';

export const config = {
    api: {
        bodyParser: false,
        sizeLimit: '30mb'
    },
};

const handler = async (req, res) => {
    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.status(500).json({ error: 'Error parsing the form' });
            return;
        }

        try {
            files = files.files.map(file => ({ filePath: file.filepath, fileName: file.originalFilename }));

            const workbook = await parseStatements(files);
            const buffer = await workbook.writeBuffer();

            res.setHeader('Content-Disposition', 'attachment; filename=parsed_statements.xlsx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

            res.send(buffer);
        } catch (error) {
            console.error('Error generating holding statement:', error);
            res.status(500).json({ error: 'Error generating holding statement' });
        }
    });
};

export default handler;
