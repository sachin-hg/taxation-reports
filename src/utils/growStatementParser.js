import {generateExcelFromJson} from './writeXls.js'
import PDFParser from 'pdf2json'
import moment from 'moment'
import momentT from 'moment-timezone'
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

const parseETradeFinalXlsFile = (filePath) => {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    const accountNumber = '499 339908'; // Assuming 'ACCT_NUM' is in the third row, second column
    const transactions = [];

    jsonData.slice(1).forEach(row => { // Assuming transactions start from the 1st row
        if (row.length > 0) { // Skip empty rows
            const [date, action, amount] = row;
            transactions.push({
                date: xlsx.SSF.format('yyyy-mm-dd', date), // Removing time and trimming spaces
                action, // Format action
                amount
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
const parsePdfFile = (filePath, tableExtracter = extractTableContent) => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
        pdfParser.on('pdfParser_dataReady', pdfData => {
            const tableContent = tableExtracter(pdfData);
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

 const drivewealthPDFParser = (pdfData) => {
    const rows = [];
    pdfData.Pages.forEach(page => {
        
        let rowKey = 0;
        let row = []
        page.Texts.forEach((text, index) => {
            const diff = text.y - rowKey
            if (diff.toFixed(3) >= 1) {
                rowKey = text.y;
                rows.push(row)
                row = []
            }
            row.push(text.R.map(run => decodeText(run.T)).join(''));
            if (index === page.Texts.length - 1) {
                rows.push(row)
            }
        });
    })
    if (rows.length === 0) {
        return rows
    } 

    const map = {}
    const finalRows = []

    rows.forEach(row => {  
        const [date, action, amount, balance, ...rest] = row
        const key = `${date}${action}${amount}${balance}`
        const existingItem = map[key]
        if (!existingItem) {
            map[key] = row
            finalRows.push(row)
        } else {
            const {groups: {description = ''} = {}} = (rest.join(' ') || '').match(/(?<orderNo>[A-Z]{4}\d{6})?(?<description>.{0,})/) || {}
            existingItem.push(description)
            // duplicate row spotted
        }
    }) 
    return finalRows;
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

/*
2024-07-10	WITHDRAW	292.58
2024-07-18	DIV	44.1
2024-07-18	DIVTAX	11.03
2024-07-22	FEE	75
2024-07-26	ADD_MONEY	41.93
2024-10-18	DIV	22.88
2024-10-18	DIVTAX	5.72
2024-10-21	WITHDRAW	17.16
*/

const parseMSClientStat = (item, tableContent, i, file, dividends, transactions, account) => {
    const {date, action, amount} = item
    switch (action) {
        case 'ADD_MONEY':
            account.push({
                Date: date,
                Action: action,
                Amount: amount,
                Account: '499 339908'
            })
            break
        case 'WITHDRAW':
        case 'FEE':
            account.push({
                Date: date,
                Action: 'WITHDRAW',
                Amount: amount,
                Account: '499 339908'
            })
            break
        case 'DIV':
            // console.log(units, stock)
            dividends.push({
                Date: date,
                Stock: 'INTU',
                Dividend: amount,
                Tax: 0,
                Account: '499 339908'
            })
            break
        case 'DIVTAX':
            // console.log(units, stock)
            dividends.push({
                Date: date,
                Stock: 'INTU',
                Dividend: 0,
                Tax: amount,
                Account: '499 339908'
            })
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
    const {groups: g1} = description.match(/(SELL|BUY)\s(?<units>[\d\.]+)\sshares\sof\s(?<stock>\w+)\sat\s\$(?<amount>[\d\.]+)/) || {}
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

const parseDWLedger = (item, tableContent, i, file, dividends, transactions, account, getAccount, brokerage) => {

    let [date, action, amount, balance, ...rest] = item
    const {groups: {orderNo, description = ''} = {}} = (rest.join(' ') || '').match(/(?<orderNo>[A-Z]{4}\d{6})?(?<description>.{0,})/) || {}
    const accountNumber = getAccount({date})
    const validActions = [
        'COMM',
        'CSR',
        'STCK',
        'FEE',
        'ACATS_CASH',
        'INT',
        'SPUR',
        'SSAL',
        'DIV',
        'DIVTAX'

    ]
    if (!action || !validActions.includes(action)) {
        return
    }
    // console.log(date, action, amount, balance, orderNo, description, '\n\n')
    let isNegative = false
    if (amount.includes('(')) {
        isNegative = true
    }
    try {
        amount = amount.replaceAll(/[\$\s\,\(\)]/g, '')
        balance = balance.replaceAll(/[\$\s\,\(\)]/g, '')
    } catch (e) {
        // console.log(item, action, 'sdfsdfsd')
        throw e
    }
    date = momentT.utc(date).tz('America/New_York').format('YYYY-MM-DD')
    // BUY 2.0 shares of MSFT at $270.69
    // AAPL dividend, $0.25/share
    // AAPL tax, 25% withheld
    // Sell 5 shares of TEAM at 166.595 PART fill
    // Sell 0.25626247 shares of TEAM at 166.6 FULL fill
    // Buy 8 shares of NVDA at 124.81 PART fill
    // WIRE DEPOSIT IND Money

    const {groups: g1} = description.match(/(Buy|Sell)\s(?<units>[\d+\.]+)\sshares\sof\s(?<stock>[\w\.]+)\sat\s[\$\s]?(?<amount>[\d\.]+)/) || {}
    // const {groups: g1} = description.match(/(SELL|BUY)\s(?<units>\d+\.\d+)\sshares\sof\s(?<stock>\w+)\sat\s\$(?<amount>\d+\.\d+)/) || {}
    
    const {groups: g2} = description.match(/(?<stock>[\w\.]+)\sdividend\s?, \$(?<dividendPerShare>[\d\.]+)\/share/) || {}
    const {groups: g3} = description.match(/(?<stock>[\w\.]+)\stax,\s(?<tax>[\d\.]+)%\swithheld/) || {}
    const {groups: g5} = description.match(/base\=(?<baseBrokerage>[\d\.]+)/) || {}
    const {units, stock, amount: amountPerShare} = g1 || {}
    const {stock: dividendStock, dividendPerShare} = g2 || {}
    const {stock: dividendTaxStock, tax: dividendTax} = g3 || {}
    const {baseBrokerage} = g5 || {}

    if (action === 'DIV' && description.includes('XTRF Transfer Cash To Account')) {
        action = 'WITHDRAW'
    }

    switch (action) {
        case 'COMM':
            const fee = (amount - baseBrokerage).toFixed(2)
            if (parseFloat(fee) !== 0) {
                account.push({
                    Date: date,
                    Action: 'WITHDRAW',
                    Amount: fee,
                    Account: accountNumber
                })
                
            }
            brokerage[orderNo] = {amount, baseBrokerage}
            break
        case 'CSR':
        case 'STCK':
        case 'FEE':
            if (parseFloat(amount) !== 0) {
                account.push({
                    Date: date,
                    Action: 'ADD_MONEY',
                    Amount: amount,
                    Account: accountNumber
                })
                
            }
            break
        case 'WITHDRAW':
        case 'ACATS_CASH':
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
                Amount: isNegative ? `-${amount}` : amount,
                Account: accountNumber
            })
            break
        case 'SPUR':
            // console.log(units, stock)
            transactions.push({
                Date: date,
                Action: 'BUY',
                Unit: parseFloat(units).toFixed(9),
                Stock: stock,
                TotalAmount: amount,
                OrderNo: orderNo,
                Account: accountNumber
            })
            break
        case 'SSAL':
            // console.log(units, stock)
            transactions.push({
                Date: date,
                Action: 'SELL',
                Unit: parseFloat(units).toFixed(9),
                Stock: stock,
                TotalAmount: amount,
                OrderNo: orderNo,
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
                DividendPerShare: dividendPerShare,
                Account: accountNumber
            })
            break
        case 'DIVTAX':
            // console.log(units, stock)
            dividends.push({
                Date: date,
                Stock: dividendTaxStock,
                Dividend: 0,
                Tax: amount,
                TaxPercentage: dividendTax,
                Account: accountNumber
            })
            break
    }
}
/*

Date	Action	Amount
2024-07-10	WITHDRAW	292.58
2024-07-18	DIV	44.1
2024-07-18	DIVTAX	11.03
2024-07-22	FEE	75
2024-07-26	ADD_MONEY	41.93
2024-10-18	DIV	22.88
2024-10-18	DIVTAX	5.72
2024-10-21	WITHDRAW	17.16
*/
const supportedRegexes = [
    {
        regex: /.*(?<fileType>(ACCOUNT_STATEMENT|XXXX|MS_Client|ClientStat|INTU_TRADE)).*\.(?<ext>(pdf))$/,
    },
    {
        regex: /.*(?<fileType>ETRADE_LAST_TXNS).*\.(?<ext>(xlsx))$/,
        customParser: parseETradeFinalXlsFile
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
    },
    {
        regex: /.*(?<fileType>(DRIVEW)).*\.(?<ext>(pdf))$/,
        tableExtracter: drivewealthPDFParser,
        getAccount: ({date}) => {
            const timestamp = moment(date)
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
        const brokerage = {}

        await Promise.all(input.map(async ({filePath, fileName}) => {
            const file = `${filePath}${fileName}`
            const {regex: reg, getAccount, tableExtracter, customParser} = supportedRegexes.find(({regex}) => fileName.match(regex)) || {}
            if (!reg) {
                return
            }
            const {groups: {fileType, ext}} = fileName.match(reg)
            const parser = customParser || parserMap[ext]
            const {tableContent} = await parser(filePath, tableExtracter);

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
                    case "ETRADE_LAST_TXNS":
                        parseMSClientStat(item, tableContent, i, file, dividends, transactions, account)
                        break
                    case 'INTU_TRADE':
                        parseINTU(item, tableContent, i, file, dividends, transactions, account)
                        break
                    case 'IND-LEDGER':
                        parseINDLedger(item, tableContent, i, file, dividends, transactions, account, getAccount, brokerage)
                        break
                    case 'DRIVEW':
                        parseDWLedger(item, tableContent, i, file, dividends, transactions, account, getAccount, brokerage)
                    break
                }
            }
        }))

        const map = {}
        const finalTransactions = []
        
        /*
        Date: date,
                Action: 'SELL',
                Unit: parseFloat(units).toPrecision(9),
                Stock: stock,
                TotalAmount: amount,
                OrderNo: orderNo,
                Account: accountNumber
        */

                transactions.forEach(txn => {
                    
                    if (txn.OrderNo) {
                        const t = map[txn.OrderNo]
                        if (!t) {
                            map[txn.OrderNo] = txn
                            const {amount = 0, baseBrokerage = 0} = brokerage[txn.OrderNo] || {}
                            if (baseBrokerage) {
                                txn.TotalAmount = (parseFloat(txn.TotalAmount) + parseFloat(baseBrokerage) * (txn.Action === 'SELL' ? -1 : 1)).toFixed(2)
                            }
                            // txn.Fee = (amount - baseBrokerage).toFixed(2)
                            
                            // txn.BaseBrokerage = baseBrokerage
                            finalTransactions.push(txn)
                        } else {
                            t.Unit = (parseFloat(txn.Unit) + parseFloat(t.Unit)).toFixed(9)
                            t.TotalAmount = (parseFloat(txn.TotalAmount) + parseFloat(t.TotalAmount)).toFixed(2)
                        }
                        
                    } else {
                        finalTransactions.push(txn)
                    }
                })

        const jsonData = [
            {
                sheetName: 'Stock Transactions',
                content: [{ data: finalTransactions.sort((a, b) => new Date(a.Date) - new Date(b.Date))
                        .map(txn => ({
                            Action: txn.Action,
                            Date: txn.Date,
                            Stock: txn.Stock,
                            Unit: txn.Unit,
                            TotalAmount: txn.TotalAmount,
                            OrderNo: txn.OrderNo,
                            Account: txn.Account,
                            type: txn.type
                        })), headers: ['Action', 'Date', 'Stock', 'Unit', 'TotalAmount', 'Account', 'type'] }]
                        // })), headers: ['Action', 'Date', 'Stock', 'Unit', 'TotalAmount', 'Account', 'type',  'OrderNo', 'Fee', 'BaseBrokerage',] }]
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