import axios from 'axios';
import fs from 'fs';
import path from 'path';
import PDFParser from 'pdf2json';

const jsonOutputFile = path.join(path.resolve(), 'usd_inr_rates.json');
const baseUrl = 'https://raw.githubusercontent.com/sachin-hg/taxation-reports/sbi-rates/main/';

const getUrl = (year, month, date, time) => {
    if (!time) {
        return `${baseUrl}${year}/${month}/${year}-${month}-${date}.pdf`
    }
    return `${baseUrl}${year}/${month}/${year}-${month}-${date}-${time}.pdf`
};

async function downloadPDF(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        return null;
    }
}

async function extractRatesFromPDF(pdfBuffer, fileName, date) {
    return new Promise((resolve, reject) => {
        try {
            const pdfParser = new PDFParser();
            const tableTitle = "CARD RATES FOR TRANSACTIONS BELOW Rs. 10 LACS";
            pdfParser.on('pdfParser_dataError', errData => {
                console.log(errData, fileName, date);
                resolve(null);
            });
            pdfParser.on('pdfParser_dataReady', pdfData => {
                const page = pdfData.Pages.find(page => page.Texts.find(x => decodeURIComponent(x.R[0].T) === tableTitle));

                try {
                    const index = page.Texts.findIndex(x => !isNaN(x.R[0].T));
                    const buyRate = parseFloat(page.Texts[index].R[0].T);
                    const sellRate = parseFloat(page.Texts[index + 1].R[0].T);

                    console.log(buyRate, sellRate, date);
                    resolve({ date, buyRate, sellRate });
                } catch (e) {
                    console.log(e, page, pdfData);
                    resolve(null);
                }
            });
            pdfParser.on('error', errData => {
                console.log(errData, fileName, date);
                resolve(null);
            });
            pdfParser.parseBuffer(pdfBuffer);
        } catch (e) {
            console.log(fileName, date);
            resolve(null);
        }
    });
}

async function writeDataToJson(data) {
    fs.writeFileSync(jsonOutputFile, JSON.stringify(data, null, 2));
    console.log(`Data written to ${jsonOutputFile}`);
}

export async function populateUsdToInrRates({startDate: startDateInput, endDate: endDateInput} = {}) {
    const defaultStartDate = new Date('2021-01-01');
    const defaultEndDate = new Date();

    const startDate = startDateInput ? new Date(startDateInput) : defaultStartDate;
    const endDate = endDateInput ? new Date(endDateInput) : defaultEndDate;

    if (isNaN(startDate) || isNaN(endDate) || startDate > endDate) {
        console.error('Invalid date range. Please enter valid start and end dates.');
        return;
    }

    let existingRates = {};
    if (fs.existsSync(jsonOutputFile)) {
        existingRates = JSON.parse(fs.readFileSync(jsonOutputFile, 'utf8'));
    }

    let lastAvailableRates = null;

    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d).toISOString().split('T')[0]);
    }

    for (const date of dates) {
        if (existingRates[date]) {
            lastAvailableRates = existingRates[date];
            continue;
        }

        const [year, month, day] = date.split('-');
        const fileUrls = [
            getUrl(year, month, day),
            getUrl(year, month, day, '19:15'),
            getUrl(year, month, day, '14:15')
        ];

        let pdfBuffer = null;
        let fileName = null;
        let rates = null;

        for (const url of fileUrls) {
            fileName = path.basename(url);
            pdfBuffer = await downloadPDF(url);
            if (pdfBuffer) {
                rates = await extractRatesFromPDF(pdfBuffer, fileName, date);
                if (rates) {
                    break;
                }
            }
        }

        if (pdfBuffer && rates && rates.buyRate > 0) {
            lastAvailableRates = rates;
            existingRates[date] = rates;
        } else if (lastAvailableRates) {
            existingRates[date] = { ...lastAvailableRates, date };
        } else {
            console.warn(`No data available for ${date} and no previous data to fallback on.`);
        }
    }

    await writeDataToJson(existingRates);
}

// Example usage (uncomment to run)
// populateUsdToInrRates('2023-01-01', '2023-12-31')
//     .then(() => console.log('Done'))
//     .catch(err => console.error('Error:', err));
