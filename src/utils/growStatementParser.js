import {generateExcelFromJson} from './writeXls.js'
import PDFParser from 'pdf2json'
import moment from 'moment'
import xlsx from 'xlsx'
// const directoryPath = '/Users/sachinagrawal/Desktop/tax 23-24/sachin/Groww reports 2023-24/'; // Replace with your directory path
// const directoryPath = '/Users/sachinagrawal/Desktop/tax 23-24/sachin/US Stock - IndMoney Account Statement/'
// const directoryPath = '/Users/sachinagrawal/Desktop/tax 23-24/sachin/ETrade/'
// const regex = /.*(?<fileType>(ACCOUNT_STATEMENT|XXXX|MS_Client|INTU_TRADE|INDW|ISFC)).*\.(?<ext>(xls|pdf))$/; // Regex to filter PDF files
// const regex = /.*(?<fileType>(ACCOUNT_STATEMENT|INTU_TRADE)).*\.(?<ext>(xls|pdf))$/; // Regex to filter PDF files
// const regex = /.*(?<fileType>(IND-LEDGER)).*\.(?<ext>(xls))$/; // Regex to filter PDF files
// 50386723: 2021-02-10
// 499 339908: 2023-09-01
// INZU000216: 2021-06-26
// WREV000009: 2024-04-29
// 6CA68772: 2021-09-09


// Function to read and parse XLS file

const parseXlsFile = (filePath) => {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    const accountNumber = jsonData[2][1]; // Assuming 'ACCT_NUM' is in the third row, second column
    const transactions = [];

    jsonData.slice(11).forEach(row => { // Assuming transactions start from the 11th row
        if (row.length > 0) { // Skip empty rows
            const [date, action, description, moneyMovement, amount, updatedBalance] = row;
            transactions.push({
                date, // Removing time and trimming spaces
                description,
                moneyMovement,
                action, // Format action
                amount,
                updatedBalance: updatedBalance
            });
        }
    });
    // console.log(accountNumber, transactions)

    return {
        accountNumber,
        tableContent: transactions
    };
};



// Function to parse PDF file
const parsePdfFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
        pdfParser.on('pdfParser_dataReady', pdfData => {
            const tableContent = extractTableContent(pdfData);
            resolve({tableContent})
        });


        pdfParser.loadPDF(filePath);
    });
};

// Function to decode percent-encoded text
const decodeText = (text) => decodeURIComponent(text.replace(/%20/g, " "));

// Function to extract table content from parsed PDF JSON
const extractTableContent = (pdfData) => {
    const tableContent = [];
    pdfData.Pages.forEach(page => {
        const rows = {};
        page.Texts.forEach(text => {
            const rowKey = Math.floor(text.y);
            if (!rows[rowKey]) {
                rows[rowKey] = [];
            }
            const cellContent = text.R.map(run => decodeText(run.T)).join('');
            rows[rowKey].push({ x: text.x, content: cellContent });
        });
        // Sort rows based on x coordinate to maintain column order
        for (const rowKey in rows) {
            rows[rowKey].sort((a, b) => a.x - b.x);
            tableContent.push(rows[rowKey].map(cell => cell.content));
        }
    });
    return tableContent;
};

const tickerMap = {
    "ATLASSIAN CORPORATION CLASS A": "TEAM",
    "NVIDIA CORP": "NVDA",
    "NETFLIX INC": "NFLX",
    "NIKE INC": "NKE",
    "SHOPIFY INC": "SHOP",
    "STARBUCKS CORP": "SBUX",
    "UIPATH INC": "PATH",
    "VICTORIA S SECRET & CO": "VSCO",
    "APPLE INC": "AAPL",
    "IROBOT CORP": "IRBT",
    "ALPHABET INC": "GOOGL",
    "MICROSOFT CORP": "MSFT",
    "VICTORY CAPITAL HOLDINGS INC": "VCTR",
    "ATLASSIAN CORPORATION PLC": "TEAM",
    "NETAPP INC": "NTAP",
    "SPRINKLR INC": "CXM",
    "META PLATFORMS INC": "META",
    "QUALCOMM INC": "QCOM"
}

const parseGrow = (item, tableContent, i, file, dividends, transactions, account) => {
    const typeIndex = item.findIndex(x => ['BOUGHT', 'SOLD', 'WIRE', 'WITHDRAW', 'DIVIDEND', 'JOURNAL'].includes(x))
    const it = [...item].splice(typeIndex)
    let [type, item1, item2, item3] = it
    const nextItem = tableContent[i + 1]
    let dividendIndex = [...item, ...nextItem].findIndex(x => x === 'WH')
    let dividendTax = 0
    if (dividendIndex !== -1) {
        dividendIndex += 1
        dividendTax = [...item, ...nextItem][dividendIndex].replaceAll(',', '')
    }

    const [iN1, , iN3, ] = [...item].reverse()

    switch (type) {
        case "DIVIDEND":
            dividends.push({
                Date: moment(item1, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Stock: tickerMap[item3.trim()],
                Dividend: iN1.replace('$', '').replaceAll(',', ''),
                Tax: dividendTax,
                Account: '6CA68772'
            })
            break
        case "BOUGHT":
            if (moment(item2, 'MM/DD/YYYY').isValid() || isNaN(iN3)) {
                break
            }
            transactions.push({
                Action: 'BUY',
                Date: moment(item1, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Stock: tickerMap[item3.trim()],
                Unit: iN3,
                TotalAmount: iN1.replace('$', '').replaceAll(',', ''),
                Account: '6CA68772'
            })
            break
        case "SOLD":
            if (moment(item2, 'MM/DD/YYYY').isValid()) {
                break
            }
            transactions.push({
                Action: 'SELL',
                Date: moment(item1, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Stock: tickerMap[item3.trim()],
                Unit: iN3,
                TotalAmount: iN1.replace('$', '').replaceAll(',', ''),
                Account: '6CA68772'
            })
            break
        case "WIRE":
        case 'JOURNAL':
            account.push({
                Date: moment(item1, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Action: 'ADD_MONEY',
                Amount: iN1.replace('$', '').replaceAll(',', ''),
                Account: '6CA68772'
            })
            break
        case "WITHDRAW":
            account.push({
                Date: moment(item1, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Action: 'WITHDRAW',
                Amount: iN1.replace('$', '').replaceAll(',', ''),
                Account: '6CA68772'
            })
            break
    }
}

const parseEtrade = (item, tableContent, i, file, dividends, transactions, account) => {
    const typeIndex = item.findIndex(x => ['Dividend', 'Conversion'].includes(x))
    if (typeIndex < 0) {
        return
    }
    const type = item[typeIndex]
    let [item0, _, item2] = item

    const [rev0, rev1] = [...item].reverse()

    switch (type) {
        case "Dividend":
            dividends.push({
                Date: moment(item0, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Stock: 'INTU',
                Account: '50386723',
                Dividend: rev0,
                Tax: rev1
            })
            break
        case "Conversion":

            if (item2.includes('TFR TO MSSB')) {
                account.push({
                    Action: 'WITHDRAW',
                    Amount: rev0.replace('-', ''),
                    Account: '50386723',
                    Date: moment(item0, 'MM/DD/YYYY').format('YYYY-MM-DD')
                })
            }

            break
    }
}

const parseINTU = (item, tableContent, i, file, dividends, transactions) => {
    const typeIndex = item.findIndex(x => ['Shares Released', 'Market Value', 'Release Date', 'Shares Issued', 'Total Value', 'Shares Purchased', 'Purchase Date'].includes(x))
    if (typeIndex < 0) {
        return
    }
    let transaction = transactions.find(t => t.file === file)
    if (!transaction) {
        transaction = {file, Stock: 'INTU', type: 'RSU', Account: '50386723', Action: 'BUY'}
        transactions.push(transaction)
    }
    const [type, item1, item2] = [...item].splice(typeIndex)

    switch (type) {
        case "Total Value":
            transaction.TotalAmount = parseFloat(item1.replaceAll(/[\$\,]/g, ''))
            break
        case 'Market Value':
            transaction.MarketValue = parseFloat(item1.replaceAll(/[\$\,]/g, ''))
            if (transaction.TotalShares !== undefined) {
                transaction.AmountPerShare = transaction.MarketValue / transaction.TotalShares
            }
            if (transaction.AmountPerShare !== undefined && transaction.Unit !== undefined) {
                transaction.TotalAmount = transaction.AmountPerShare * transaction.Unit
            }
            break
        case "Shares Released":
            transaction.TotalShares = parseFloat(item1.replaceAll('$', ''))
            if (transaction.MarketValue !== undefined) {
                transaction.AmountPerShare = transaction.MarketValue / transaction.TotalShares
            }
            if (transaction.AmountPerShare !== undefined && transaction.Unit !== undefined) {
                transaction.TotalAmount = transaction.AmountPerShare * transaction.Unit
            }
            break
        case "Shares Purchased":
            transaction.Unit = parseFloat(item2.replaceAll('$', ''))
            break
        case "Shares Issued":
            transaction.Unit = parseFloat(item1.replaceAll('$', ''))
            if (transaction.AmountPerShare !== undefined) {
                transaction.TotalAmount = transaction.AmountPerShare * transaction.Unit
            }
            break
        case "Purchase Date":
            transaction.Date = moment(item2, 'MM/DD/YYYY').format('YYYY-MM-DD')
            break
        case 'Release Date':
            transaction.Date = moment(item1, 'MM/DD/YYYY').format('YYYY-MM-DD')
            break

    }
}

const parseMS = (item, tableContent, i, file, dividends, transactions, account) => {
    const {groups: {year}} = file.match(/.*_(?<year>[\d]{4})(?<month>[\d]{2}).*\.pdf/)
    const typeIndex = item.findIndex(x => ['Qualified Dividend', 'Interest Income', 'Other Credits'].includes(x))
    if (typeIndex < 0) {
        return
    }
    const type = item[typeIndex]
    const subType = item[typeIndex + 1]
    let [item0] = item

    let [rev0, rev1] = [...item].reverse()
    const date = item0 + '/' + year
    switch (type) {
        case "Qualified Dividend":
            rev0 = parseFloat(rev0.replaceAll(/[\$\(\)]/g, ''))
            rev1 = parseFloat(rev1.replaceAll(/[\$\(\)]/g, ''))
            const dividend = Math.max(rev0, rev1)
            const tax = Math.min(rev0, rev1)
            dividends.push({
                Date: moment(date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Stock: 'INTU',
                Account: '499 339908',
                Dividend: dividend,
                Tax: tax
            })
            break
        case "Interest Income":
            account.push({
                Account: '499 339908',
                Date: moment(date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                Amount: rev0.replaceAll(/[\$\(\)]/g, ''),
                Action: 'INTEREST'
            })
            break
        case "Other Credits":
            if (subType === 'BANK DEPOSIT PROGRAM') {
                account.push({
                    Account: '499 339908',
                    Date: moment(date, 'MM/DD/YYYY').format('YYYY-MM-DD'),
                    Amount: rev0.replaceAll(/[\$\(\\ )]/g, ''),
                    Action: 'ADD_MONEY'
                })
            }
            break
    }
}

const parserMap = {
    xls: parseXlsFile,
    pdf: parsePdfFile
}
const parseINDLedger = (item, tableContent, i, file, dividends, transactions, account, getAccount) => {

    let {date, description, amount, action} = item
    const accountNumber = getAccount({date})
    if (!action || action === 'XTRF') {
        return
    }
    date = date.split(",")[0].trim()
    date = moment(date, 'DD MMM YYYY').format('YYYY-MM-DD')
    // BUY 2.0 shares of MSFT at $270.69
    const {groups: g1} = description.match(/(SELL|BUY)\s(?<units>\d+\.\d+)\sshares\sof\s(?<stock>\w+)\sat\s\$(?<amount>\d+\.\d+)/) || {}
    const {groups: g2} = description.match(/(?:DIV|DIVTAX)\sof\s\$\-?\d+\.\d+\sagainst\s(?<stock>\w+)/) || {}
    const {units, stock} = g1 || {}
    const {stock: dividendStock} = g2 || {}

    switch (action) {
        case 'DEPOSIT':
            account.push({
                Date: date,
                Action: 'ADD_MONEY',
                Amount: amount,
                Account: accountNumber
            })
            break
        case 'WITHDRAW':
            account.push({
                Date: date,
                Action: 'WITHDRAW',
                Amount: amount,
                Account: accountNumber
            })
            break
        case 'INT':
            account.push({
                Date: date,
                Action: 'INTEREST',
                Amount: amount,
                Account: accountNumber
            })
            break
        case 'BUY':
            // console.log(units, stock)
            transactions.push({
                Date: date,
                Action: action,
                Unit: parseFloat(units).toPrecision(9),
                Stock: stock,
                TotalAmount: amount,
                Account: accountNumber
            })
            break
        case 'SELL':
            // console.log(units, stock)
            transactions.push({
                Date: date,
                Action: action,
                Unit: parseFloat(units).toPrecision(9),
                Stock: stock,
                TotalAmount: amount,
                Account: accountNumber
            })
            break
        case 'DIV':
            // console.log(units, stock)
            dividends.push({
                Date: date,
                Stock: dividendStock,
                Dividend: amount,
                Tax: 0,
                Account: accountNumber
            })
            break
        case 'DIVTAX':
            // console.log(units, stock)
            dividends.push({
                Date: date,
                Stock: dividendStock,
                Dividend: 0,
                Tax: amount,
                Account: accountNumber
            })
            break
    }
}
const supportedRegexes = [
    {
        regex: /.*(?<fileType>(ACCOUNT_STATEMENT|XXXX|MS_Client|INTU_TRADE)).*\.(?<ext>(pdf))$/,
    },
    {
        regex:  /.*(?<fileType>(IND-LEDGER)).*\.(?<ext>(xls))$/,
        getAccount: ({date}) => {
            const timestamp = moment(date, 'DD MMM YYYY, hh:mm A')
            const cutOff = moment('29 Apr 2024, 10:02 AM', 'DD MMM YYYY, hh:mm A')
            if (timestamp < cutOff) {
                return 'INDW001INZU000216'
            }
            return 'WREV000009'
        }
    }
]
// const input = [
//     {
//         config: [
//             {
//                 directoryPath: '/Users/sachinagrawal/Desktop/tax 23-24/rohan/Groww reports 2023-24/',
//                 regex: /.*(?<fileType>(ACCOUNT_STATEMENT)).*\.(?<ext>(pdf))$/
//             }
//         ],
//         outputAccount: './rohan_account.csv',
//         outputTxns: './rohan_txns.csv',
//         outputDividends: './rohan_dividends.csv'
//     },
//     {
//         config: [
//             {
//                 // directoryPath: '/Users/sachinagrawal/Desktop/tax 23-24/sachin/US Stock - IndMoney Account Statement/',
//                 directoryPath: '/Users/sachinagrawal/Desktop/tax 23-24/sachin/',
//                 regex:  /.*(?<fileType>(IND-LEDGER)).*\.(?<ext>(xls))$/,
//                 getAccount: ({date}) => {
//                     const timestamp = moment(date, 'DD MMM YYYY, hh:mm A')
//                     const cutOff = moment('29 Apr 2024, 10:02 AM', 'DD MMM YYYY, hh:mm A')
//                     if (timestamp < cutOff) {
//                         return 'INDW001INZU000216'
//                     }
//                     return 'WREV000009'
//                 }
//             },
//             {
//                 directoryPath: '/Users/sachinagrawal/Desktop/tax 23-24/sachin/ETrade/',
//                 regex:  /.*(?<fileType>(XXXX|MS_Client|INTU_TRADE)).*\.(?<ext>(pdf))$/,
//                 // regex:  /.*(?<fileType>(INTU_TRADE)).*\.(?<ext>(pdf))$/
//                 // account will have just interest, div, divInt, sell [no buy] => to be output 2 files for ETrade/MS respectively
//             }
//         ],
//         outputTxns: './sachin_txns.csv',
//         outputDividends: './sachin_dividends.csv',
//         outputAccount: './sachin_account.csv'
//     }
// ]
export const parseStatements = async (input) => {
    try {
        const dividends = []
        const transactions = []
        const account = []

        await Promise.all(input.map(async ({filePath, fileName}) => {
            const file = `${filePath}${fileName}`
            const {regex: reg, getAccount} = supportedRegexes.find(({regex}) => fileName.match(regex)) || {}
            if (!reg) {
                return
            }
            const {groups: {fileType, ext}} = fileName.match(reg)
            const parser = parserMap[ext]
            const {tableContent} = await parser(filePath);

            for (let i = 0; i < tableContent.length - 1 ; i++) {
                const item = tableContent[i]

                switch (fileType) {
                    case "ACCOUNT_STATEMENT":
                        parseGrow(item, tableContent, i, file, dividends, transactions, account)
                        break
                    case "XXXX":
                        parseEtrade(item, tableContent, i, file, dividends, transactions, account)
                        break
                    case "MS_Client":
                        parseMS(item, tableContent, i, file, dividends, transactions, account)
                        break
                    case 'INTU_TRADE':
                        parseINTU(item, tableContent, i, file, dividends, transactions, account)
                        break
                    case 'IND-LEDGER':
                        parseINDLedger(item, tableContent, i, file, dividends, transactions, account, getAccount)
                        break
                }
            }
        }))

        const jsonData = [
            {
                sheetName: 'Stock Transactions',
                content: [{ data: transactions.sort((a, b) => new Date(a.Date) - new Date(b.Date))
                        .map(txn => ({
                            Action: txn.Action,
                            Date: txn.Date,
                            Stock: txn.Stock,
                            Unit: txn.Unit,
                            TotalAmount: txn.TotalAmount,
                            Account: txn.Account,
                            type: txn.type
                        })), headers: ['Action', 'Date', 'Stock', 'Unit', 'TotalAmount', 'Account', 'type'] }]
            },
            {
                sheetName: 'Dividends',
                content: [{ data: dividends.sort((a, b) => new Date(a.Date) - new Date(b.Date))
                        .map(txn => ({
                            Date: txn.Date,
                            Stock: txn.Stock,
                            Account: txn.Account,
                            Dividend: txn.Dividend,
                            Tax: txn.Tax
                        })), headers: ["Date", "Stock", "Account", "Dividend", "Tax"] }]
            },
            {
                sheetName: 'Broker Account Transactions',
                content: [{ data: account.sort((a, b) => new Date(a.Date) - new Date(b.Date))
                        .map(txn => ({
                            Date: txn.Date,
                            Action: txn.Action,
                            Amount: txn.Amount,
                            Account: txn.Account
                        })), headers: ["Date", "Action", "Amount", "Account"] }]
            },
            {
                sheetName: 'Ticker Change History',
                content: [{ data: [{ 'Old Ticker': 'FB', 'New Ticker': 'META' }, { 'Old Ticker': 'GOOGL', 'New Ticker': 'GOOG' }] }]
            },
            {
                sheetName: 'Stock Split History',
                content: [{ data: [], headers: ['Stock', 'Date', 'Multiplication Factor'] }]
            },
            {
                sheetName: 'Broker Account Details',
                content: [{ data: [], headers: ['num', 'address', 'zip', 'openingDate', 'name'] }]
            }
        ];

        return await generateExcelFromJson(jsonData);
        // await workbook.writeFile('./parsed_statements.xlsx');


    } catch (error) {
        console.error('Error:', error);
    }
};

// parseStatements();

// modify the above code to output a single .xlsx file instead of 3 csv. the output xlsx file must have 6 sheets. first sheetname "Stock Transactions" which should have the content of txns.csv. second sheet name is "Dividends" and must have content of dividends.csv. third sheet name must be "Broker Account Transactions" and have content of acounts.csv
// 4th sheet name must be "Ticker Change History" with following table:
// Old Ticker	New Ticker
// FB	META
// GOOGL	GOOG
//
// 5th sheet name must be "Stock Split History" with following content:
// Stock	Date	Multiplication Factor
//
// 6th sheet name must be "Broker Account Details" with following content:
// num	address	zip	openingDate	name