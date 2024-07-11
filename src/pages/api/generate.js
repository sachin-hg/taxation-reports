import { generateHoldingStatement } from '@/utils/generateStatement'; // Adjust the import path as needed
import { IncomingForm } from 'formidable';
import XLSX from 'xlsx';
import archiver from 'archiver';

export const config = {
    api: {
        bodyParser: false,
    },
};

const parseSheetToJSON = (workbook, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    json.forEach(row => {
        if (row.Date && typeof row.Date === 'number') {
            row.Date = XLSX.SSF.format('yyyy-mm-dd', row.Date);
        }
        if (row.date && typeof row.date === 'number') {
            row.date = XLSX.SSF.format('yyyy-mm-dd', row.date);
        }
        if (row.openingDate && typeof row.openingDate === 'number') {
            row.openingDate = XLSX.SSF.format('yyyy-mm-dd', row.openingDate);
        }
    });
    return json
};

const handler = async (req, res) => {
    const form = new IncomingForm();

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.status(500).json({ error: 'Error parsing the form' });
            return;
        }

        try {
            const file = files.file[0].filepath;
            const workbook = XLSX.readFile(file);

            const stockTransactions = parseSheetToJSON(workbook, 'Stock Transactions');
            const dividends = parseSheetToJSON(workbook, 'Dividends');
            const brokerageAccountTransactions = parseSheetToJSON(workbook, 'Broker Account Transactions');
            const brokerageAccountDetails = parseSheetToJSON(workbook, 'Broker Account Details').reduce((res, item) => {
                res[item.num] = item
                return res
            }, {})

            let stockSplitMap = {};
            let tickerChangeMap = {};

            if (workbook.SheetNames.includes('Stock Split History')) {
                const stockSplitData = parseSheetToJSON(workbook, 'Stock Split History');
                stockSplitData.forEach(({ Stock, Date, 'Multiplication Factor': factor }) => {
                    if (!stockSplitMap[Stock]) stockSplitMap[Stock] = {};
                    stockSplitMap[Stock][Date] = factor;
                });
            }

            if (workbook.SheetNames.includes('Ticker Change History')) {
                const tickerChangeData = parseSheetToJSON(workbook, 'Ticker Change History');
                tickerChangeData.forEach(({ 'Old Ticker': oldTicker, 'New Ticker': newTicker }) => {
                    tickerChangeMap[oldTicker] = newTicker;
                });
            }

            const year = fields.year[0];
            const handleStockSplit = fields.handleStockSplit[0] === 'true';
            const cacheOnlyForTickerChange = fields.cacheOnlyForTickerChange[0] === 'true';

            const options = {
                stockTransactions,
                dividends,
                brokerageAccountTransactions,
                type: 'PNL',
                year,
                brokerageAccountDetails,
                handleStockSplit,
                stockSplitMap,
                tickerChangeMap,
                cacheOnlyForTickerChange,
            };

            const workbookPNL = await generateHoldingStatement(options);

            options.type = 'FA';
            const workbookFA = await generateHoldingStatement(options);

            const bufferPNL = await workbookPNL.writeBuffer();
            const bufferFA = await workbookFA.writeBuffer();

            const archive = archiver('zip');
            archive.on('error', (err) => {
                throw err;
            });

            res.setHeader('Content-Disposition', 'attachment; filename=holding_statements.zip');
            res.setHeader('Content-Type', 'application/zip');

            archive.pipe(res);
            archive.append(bufferPNL, { name: 'PNL.xlsx' });
            archive.append(bufferFA, { name: 'FA.xlsx' });

            // const archive = archiver('zip');
            // archive.on('error', (err) => {
            //     throw err;
            // });
            //
            // res.setHeader('Content-Disposition', 'attachment; filename=holding_statements.zip');
            // res.setHeader('Content-Type', 'application/zip');
            //
            // archive.pipe(res);
            // archive.append(workbookFNL.writeBuffer(), { name: 'holding_statement_FNL.xlsx' });
            // archive.append(workbookFA.writeBuffer(), { name: 'holding_statement_FA.xlsx' });

            await archive.finalize();
        } catch (error) {
            console.error('Error generating holding statement:', error);
            res.status(500).json({ error: 'Error generating holding statement' });
        }
    });
};

export default handler;
