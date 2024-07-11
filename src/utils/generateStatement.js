import moment from 'moment'
import groupBy from 'lodash/groupBy'
import uniq from 'lodash/uniq'
import {v4 as uuidv4} from 'uuid'
import conversionRates from '@/../usd_inr_rates.json'
import {handleStockSplits} from './stockSplit.js'
import {getTickerChangeHistory} from './tickerChange.js'
import {fetchStockPrice} from './stockPrice.js'
import {fetchCompanyDetails} from './companyDetails.js'
import {generateExcelFromJson} from './writeXls.js'

const assignUniqueIds = (transactions) => {
    return transactions.map(transaction => ({
        ...transaction,
        id: uuidv4()
    }));
};

const createStockHoldingsMap = (transactions, startDate, endDate) => {
    const stockHoldingsMap = {};

    const transactionsGroupedByStock = groupBy(transactions, 'Stock');
    Object.keys(transactionsGroupedByStock).forEach(Stock => {
        const transactions = transactionsGroupedByStock[Stock];
        const buyTransactions = transactions
            .filter(transaction => transaction.Action === 'BUY')
            .map(transaction => ({ ...transaction, availableUnits: parseFloat(transaction.Unit) }));
        let totalUnits = 0;
        let currentBuyTransactionIndexForSell = 0;
        let lastEntryDateString;

        transactions.forEach(transaction => {
            const { Action, Date, Stock, Unit, id } = transaction;
            const date = moment(Date);
            const dateString = date.format('YYYY-MM-DD');

            if (!stockHoldingsMap[Stock]) {
                stockHoldingsMap[Stock] = {};
            }

            if (!stockHoldingsMap[Stock][dateString]) {
                stockHoldingsMap[Stock][dateString] = { totalUnitsHeld: 0, unitsHeldByTransactionId: {} };
            }

            if (Action === 'BUY') {
                totalUnits += parseFloat(Unit);
                stockHoldingsMap[Stock][dateString].totalUnitsHeld = totalUnits;

                let previousData = { ...(stockHoldingsMap[Stock][lastEntryDateString]?.unitsHeldByTransactionId || {}) };
                previousData = { ...previousData, [id]: parseFloat(Unit) };

                stockHoldingsMap[Stock][dateString].unitsHeldByTransactionId = previousData;
                lastEntryDateString = dateString;
            } else if (Action === 'SELL') {
                let unitsToSell = parseFloat(Unit);

                totalUnits -= parseFloat(Unit);
                stockHoldingsMap[Stock][dateString].totalUnitsHeld = totalUnits;
                while (unitsToSell > 0) {
                    const currentBuyTransaction = buyTransactions[currentBuyTransactionIndexForSell];
                    let { availableUnits, id } = currentBuyTransaction;
                    const unitsAvailable = Math.min(availableUnits, unitsToSell);
                    currentBuyTransaction.availableUnits -= unitsAvailable;
                    unitsToSell -= unitsAvailable;

                    let previousData = { ...(stockHoldingsMap[Stock][lastEntryDateString]?.unitsHeldByTransactionId || {}) };
                    previousData = { ...previousData, [id]: previousData[id] - unitsAvailable };
                    stockHoldingsMap[Stock][dateString].unitsHeldByTransactionId = previousData;

                    if (currentBuyTransaction.availableUnits === 0) {
                        currentBuyTransactionIndexForSell++;
                    }

                    lastEntryDateString = dateString;
                }
            }
        });
    });

    const minStartDate = moment(startDate);
    const maxEndDate = moment(endDate);
    for (const stock in stockHoldingsMap) {
        const dates = Object.keys(stockHoldingsMap[stock]).sort();
        let startDate = moment(dates[0]);
        let endDate = moment(dates[dates.length - 1]);

        if (minStartDate < startDate) {
            startDate = minStartDate;
        }

        if (maxEndDate > endDate) {
            endDate = maxEndDate;
        }

        let cumulativeUnits = 0;
        let cumulativeUnitsByTransactionId = {};

        let currentDate = startDate;

        while (currentDate.isSameOrBefore(endDate)) {
            const dateString = currentDate.format('YYYY-MM-DD');

            if (stockHoldingsMap[stock][dateString]) {
                cumulativeUnits = stockHoldingsMap[stock][dateString].totalUnitsHeld;
                cumulativeUnitsByTransactionId = { ...stockHoldingsMap[stock][dateString].unitsHeldByTransactionId };
            } else {
                stockHoldingsMap[stock][dateString] = { totalUnitsHeld: cumulativeUnits, unitsHeldByTransactionId: { ...cumulativeUnitsByTransactionId } };
            }

            currentDate.add(1, 'day');
        }
    }

    const newMap = {};
    for (const stock in stockHoldingsMap) {
        newMap[stock] = {};
        Object.keys(stockHoldingsMap[stock]).sort().forEach(date => {
            newMap[stock][date] = stockHoldingsMap[stock][date];
        });
    }

    return stockHoldingsMap;
};

const calculateSharesHeldOnDate = (stockHoldingsMap, date, stock) => {
    const dateString = date.format('YYYY-MM-DD');
    return stockHoldingsMap[stock][dateString]?.totalUnitsHeld || 0;
};

const calculateSharesHeldOnDateByTransactionId = (stockHoldingsMap, date, stock, transactionId) => {
    const dateString = date.format('YYYY-MM-DD');
    return stockHoldingsMap[stock][dateString]?.unitsHeldByTransactionId[transactionId] || 0;
};

const calculateDividends = (holdings, stockHoldingsMap, dividends, startDate, endDate) => {
    for (const dividend of dividends) {
        const dividendDate = moment(dividend.Date);
        if (dividendDate.isBetween(startDate, endDate, null, '[]')) {
            const sharesHeldOnDividendDate = calculateSharesHeldOnDate(stockHoldingsMap, dividendDate, dividend.Stock);
            if (sharesHeldOnDividendDate > 0) {
                const dividendPerUnit = parseFloat(dividend.Dividend) / sharesHeldOnDividendDate;

                for (const holding of holdings) {
                    if (holding.stock === dividend.Stock && moment(holding.buyDate).isSameOrBefore(dividendDate)) {
                        const holdingUnits = calculateSharesHeldOnDateByTransactionId(stockHoldingsMap, dividendDate, dividend.Stock, holding.id);
                        const holdingDividend = dividendPerUnit * holdingUnits;
                        holding.dividend = (parseFloat(holding.dividend || 0) + holdingDividend).toFixed(10);
                    }
                }
            }
        }
    }

    return holdings;
};

const processTransactions = (transactions, startDate, endDate) => {
    const holdings = [];
    const sales = {};

    transactions.forEach(transaction => {
        const { Action, Date, Stock, Unit, TotalAmount, id } = transaction;
        const date = moment(Date);

        if (date.isAfter(endDate)) {
            return;
        }

        if (Action === 'BUY') {
            holdings.push({
                stock: Stock,
                buyDate: Date,
                quantity: parseFloat(Unit),
                initialValue: parseFloat(TotalAmount),
                openingUnits: parseFloat(Unit),
                closingUnits: parseFloat(Unit),
                amountReceivedFromSelling: 0,
                salesAttributed: [],
                id: id
            });
        } else if (Action === 'SELL') {
            const unitsToSell = parseFloat(Unit);
            sales[Stock] = sales[Stock] || [];
            sales[Stock].push({ date, unitsToSell, amount: parseFloat(TotalAmount), id });
        }
    });

    for (const stock in sales) {
        const stockSales = sales[stock].sort((a, b) => a.date - b.date);

        for (const sale of stockSales) {
            let unitsToSell = sale.unitsToSell;

            for (const holding of holdings) {
                if (holding.stock === stock && unitsToSell > 0) {
                    const unitsAvailable = Math.min(holding.closingUnits, unitsToSell);
                    const saleDate = sale.date;

                    if (saleDate.isBetween(startDate, endDate, null, '[]') && unitsAvailable > 0) {
                        holding.amountReceivedFromSelling += unitsAvailable * (sale.amount / sale.unitsToSell);
                        holding.salesAttributed.push({ date: saleDate.format('YYYY-MM-DD'), unitsSold: unitsAvailable, saleId: sale.id });
                    }

                    if (saleDate.isBefore(startDate) && unitsAvailable > 0) {
                        const unitPrice = holding.initialValue / holding.openingUnits;
                        holding.initialValue -= unitPrice * unitsAvailable;
                        holding.openingUnits -= unitsAvailable;
                    }

                    holding.closingUnits -= unitsAvailable;
                    unitsToSell -= unitsAvailable;

                    if (unitsToSell <= 0) {
                        break;
                    }
                }
            }
        }
    }

    return holdings.filter(holding => holding.closingUnits > 0 || holding.openingUnits > 0);
};

const findRateRecursively = (date) => {
    const formattedDate = moment(date).format('YYYY-MM-DD');

    if (conversionRates[formattedDate]?.buyRate) {
        return conversionRates[formattedDate].buyRate;
    } else {
        console.log('conversion rate not available for ', formattedDate);
        const previousDate = moment(formattedDate).subtract(1, 'days');

        if (previousDate.isBefore(moment('2020-12-31'))) { // assuming this is the earliest date you have data for
            console.error('No conversion rate available for any prior dates');
            return null;
        }

        return findRateRecursively(previousDate);
    }
};

const convertToINR = (usdValue, conversionDate) => {
    const buyRate = findRateRecursively(conversionDate);

    if (buyRate) {
        return buyRate * usdValue;
    } else {
        return null;
    }
};


const calculatePeakValues = async (holdings, stockHoldingsMap, startDate, endDate, currency) => {
    const startUnix = startDate.unix();
    const endUnix = endDate.unix();

    for (const holding of holdings) {
        const { stock, id } = holding;
        const stockData = await fetchStockPrice(stock, startUnix, endUnix);

        let maxPrice = 0;
        let peakDate = null;

        for (const data of stockData) {
            const date = moment(data.Date);
            const price = parseFloat(data.Close);

            const unitsHeld = calculateSharesHeldOnDateByTransactionId(stockHoldingsMap, date, stock, id);
            const value = unitsHeld * price;

            if (value > maxPrice) {
                maxPrice = value;
                peakDate = data.Date;
            }
        }

        holding.peakValue = maxPrice.toFixed(2);
        if (currency === 'INR') {
            holding.peakValue = convertToINR(holding.peakValue, peakDate);
        }
        holding.peakDate = peakDate;
    }

    return holdings;
};

const calculateClosingBalance = async (holdings, stockHoldingsMap, endDate, currency) => {
    const endUnix = endDate.unix();
    const startUnix = endDate.subtract(7, 'days').unix(); // Start from 7 days before endDate to account for market closure

    for (const holding of holdings) {
        const { stock, closingUnits } = holding;
        let stockData = await fetchStockPrice(stock, startUnix, endUnix);
        const data = stockData.sort((a, b) => moment(b.Date) - moment(a.Date))[0] || {};

        const closingPrice = parseFloat(data.Close);
        const closingDate = data.Date;

        holding.closingBalance = (closingPrice * closingUnits).toFixed(2);
        if (currency === 'INR') {
            holding.closingBalance = convertToINR(holding.closingBalance, closingDate);
        }
    }
    return holdings;
};

const addInrToData = (array, usdFieldName, dateFieldName, inrFieldName = usdFieldName) => {
    return array.map(item => {
        const {[usdFieldName]: usdValue, [dateFieldName]: date} = item;
        return {...item, [inrFieldName]: convertToINR(usdValue, date)};
    });
};

const createDividendStatement = (dividends, startDate, endDate) => {
    const divs = []
    const taxes = []
    addInrToData(addInrToData(dividends, 'Dividend', 'Date', 'DividendINR'), 'Tax', 'Date', 'TaxINR')
        .map(item => {
            const {Dividend, DividendINR, Stock, Date, Tax, TaxINR} = item
            const date = moment(Date)
            if (date >= startDate && date <= endDate) {
                if (Dividend > 0) {
                    divs.push({
                        Security: Stock,
                        Date: date.format('YYYY-MM-DD'),
                        'Amount($)': Dividend,
                        'Amount(INR)': DividendINR,
                        Description: `Dividend provided by ${Stock}`
                    })
                }

                if (Tax > 0) {
                    taxes.push(
                        {
                            Security: Stock,
                            Date: date.format('YYYY-MM-DD'),
                            'Amount($)': -Tax,
                            'Amount(INR)': -TaxINR,
                            Description: `Tax recovered on Dividend provided by ${Stock}`
                        }
                    )
                }
            }
        })

    return [{
        title: 'Dividend Income',
        headers: ['Security', 'Date', 'Amount($)', 'Amount(INR)', 'Description'],
        data: [...divs, ...taxes]
    }]
}

const generatePAndL = (holdings, transactions, bankStatements, startDate, endDate) => {
    const transactionsMap = groupBy(transactions, 'id')
    const shortTerm = []
    const longTerm = []
    const interest = []
    bankStatements.forEach(txn => {
        const {Date, Action, Amount} = txn
        const date = moment(Date)
        if (Action === 'INTEREST' && date.isBetween(startDate, endDate, null, '[]')) {
            interest.push({
                Date,
                'Amount($)': Amount,
                'Amount(INR)': convertToINR(Amount, Date)
            })
        }
    })
    holdings.forEach(holding => {
        let {stock, buyDate, initialValue, openingUnits, salesAttributed = []} = holding
        buyDate = moment(buyDate)
        const cutoffDate = moment(buyDate).add(2, 'years')
        salesAttributed.forEach(sale => {
            let {date: saleDate, unitsSold, saleId} = sale
            saleDate = moment(saleDate)
            let pushToArray = shortTerm
            if (saleDate >= cutoffDate) {
                pushToArray = longTerm
            }
            const buyValue = unitsSold * initialValue / openingUnits
            const sellValue = unitsSold * transactionsMap[saleId][0].TotalAmount / transactionsMap[saleId][0].Unit
            const gain = sellValue - buyValue
            // Security	Sale date	Sold Unit(s)	Sell Value($)	Buy Value($)	Gain/Loss($)	Gain/Loss(INR)	Buy Date(s)	Buy Qty
            pushToArray.push({
                Security: stock,
                'Sale Date': saleDate.format('YYYY-MM-DD'),
                'Sold Unit(s)': unitsSold,
                'Sell Value($)': sellValue,
                'Buy Value($)': buyValue,
                'Gain/Loss($)': gain,
                'Gain/Loss(INR)': convertToINR(gain, saleDate),
                'Buy Date': buyDate.format('YYYY-MM-DD'),
                'Buy Qty': unitsSold,
                'Buy Amount($)': buyValue
            })
        })
    })
    let res = []
    res.push({
        title: 'Short Term Capital Gains (Holding Period<24 months)',
        data: shortTerm,
        headers: ['Security', 'Sale Date', 'Sold Unit(s)', 'Sell Value($)', 'Buy Value($)', 'Gain/Loss($)', 'Gain/Loss(INR)', 'Buy Date', 'Buy Qty', 'Buy Amount($)']
    })
    res.push({
        title: 'Long Term Capital Gains (Holding Period>24 months)',
        data: longTerm,
        headers: ['Security', 'Sale Date', 'Sold Unit(s)', 'Sell Value($)', 'Buy Value($)', 'Gain/Loss($)', 'Gain/Loss(INR)', 'Buy Date', 'Buy Qty', 'Buy Amount($)']
    })
    res.push({
        title: 'Interest',
        data: interest,
        headers: ['Date', 'Amount($)', 'Amount(INR)']
    })

    return res
}


const generateFA = async (holdings) => {
    // stock	buyDate	quantity	initialValue	openingUnits	closingUnits	amountReceivedFromSelling	salesAttributed	id	dividend	peakValue	peakDate	closingBalance

    let tickers = []
    holdings.forEach(x => {
        tickers.push(x.stock)
    })
    tickers = uniq(tickers)
    const companyDetails = await fetchCompanyDetails(tickers)
    const data = holdings.map(holding => {
        const {stock, buyDate, initialValue, amountReceivedFromSelling, dividend, peakValue, closingBalance} = holding
        const {name, address, zipCode} = companyDetails[stock]
        // console.log(companyName, '\n\n\n')
        return {
            'Country Name': 'United States Of America',
            'Country Code': 2,
            'Name of entity': `${name} (${stock})`,
            'Address of entity': address,
            'zip code': zipCode,
            'Nature of entity': 'Company',
            'Date of acquiring interest/ stake': moment(buyDate).format('YYYY-MM-DD'),
            'Initial value of investment': initialValue,
            'Peak value of investment': peakValue,
            'Closing Balance': closingBalance,
            'Total gross amount paid/credited with respect to the holding during the period': dividend,
            'Total gross proceeds from sale or redemption of investment during the period': amountReceivedFromSelling
        }
    })

    return [
        {
            data,
            headers: [
                'Country Name',
                'Country Code',
                'Name of entity',
                'Address of entity',
                'zip code',
                'Nature of entity',
                'Date of acquiring interest/ stake',
                'Initial value of investment',
                'Peak value of investment',
                'Closing Balance',
                'Total gross amount paid/credited with respect to the holding during the period',
                'Total gross proceeds from sale or redemption of investment during the period'
            ]
        }
    ]
}

const modifyTickers = async (transactions, dividends, tickerChangeMap, cacheOnly = true) => {
    let tickers = transactions.map(transaction => transaction.Stock)
    tickers = tickers.concat(dividends.map(dividend => dividend.Stock))
    tickers = uniq(tickers)
    let map = await getTickerChangeHistory(tickers, cacheOnly)
    map = {...map, ...tickerChangeMap}
    transactions.forEach(transaction => {
        const {Stock} = transaction
        transaction.Stock = map[Stock] || Stock
    })
    dividends.forEach(dividend => {
        const {Stock} = dividend
        dividend.Stock = map[Stock] || Stock
    })

}

// given a function async getStockSplitHistory. which returns a map of stock split in following format {stock: {date: multiplicationFactor}}
// this specifies the dates when a given stock was split by a certain multiplicationFactor
// and array "transactions" in this format: [{Stock, Date, Quantity}]
// write a function which changes the "Quantity" field in transactions, using multiplicationFactor according if the transaction "Date" is from before the split happened
const createAccountStatement = (transactions, dividends, bankStatements, startDate, endDate, accounts) => {
    const txns = [
        ...bankStatements,
        ...transactions,
        ...dividends.map(x => ({...x, Action: 'DIVIDEND', Amount: x.Dividend - x.Tax}))
    ].map(a => ({...a, DateObj: moment(a.Date)})).sort((a, b) => a.DateObj - b.DateObj)

    const groupedByAccount = groupBy(txns, 'Account')
    const validAccounts = []
    const dta = Object.keys(groupedByAccount).filter(accountNum => {
        const {[accountNum]: {openingDate}} = accounts
        return moment(openingDate).isSameOrBefore(endDate)
    }).map(accountNum => {
        const txns = groupedByAccount[accountNum]

        let peak = 0
        let balance = 0
        let closingBalance = 0
        let amountPaid = 0
        let peakDate = null
        txns.forEach(txn => {
            const {Action, DateObj, Date, TotalAmount, Amount, type} = txn
            let amount = Amount || TotalAmount || 0
            switch (Action) {
                case 'ADD_MONEY':
                case 'INTEREST':
                case 'SELL':
                case 'DIVIDEND':
                    balance += parseFloat(amount)
                    if (DateObj.isBetween(startDate, endDate, null, '[]')) {
                        if (peak < balance) {
                            peak = balance
                            peakDate = DateObj
                        }
                        closingBalance = balance
                        if (Action !== 'ADD_MONEY') {
                            amountPaid += convertToINR(amount, Date)
                        }
                    }
                    break

                case 'WITHDRAW':
                    balance -= Amount
                    if (DateObj.isBetween(startDate, endDate, null, '[]')) {
                        closingBalance = balance
                    }
                    break

                case 'BUY':
                    if (type !== 'RSU') {
                        balance -= amount
                        if (DateObj.isBetween(startDate, endDate, null, '[]')) {
                            closingBalance = balance
                        }
                    }
                    break


            }
        })
        const {[accountNum]: {name, address, zip, openingDate}} = accounts
        validAccounts.push({
            'Broker A/C No': accountNum,
            Broker: name
        })
        return {
            "Country Name": "United States of America",
            "Country Code":'2',
            "Name of Financial Institution":name,
            "Address of entity":address,
            "zip code":zip,
            "Account Number":accountNum,
            "Type of Account":'Foreign Custodial Account',
            "Status":'Beneficial Owner',
            "Account opening date": openingDate,
            'Peak value during the period': peakDate ? convertToINR(peak, peakDate) : 0,
            'Closing Balance': convertToINR(closingBalance, endDate),
            'Total gross amount paid/credited with respect to the holding during the period': amountPaid,
        }
    })
    const a2 = [{
        data: dta,
        headers: [
            "Country Name",
            "Country Code",
            "Name of Financial Institution",
            "Address of entity",
            "zip code",
            "Account Number",
            "Type of Account",
            "Status",
            "Account opening date",
            'Peak value during the period',
            'Closing Balance',
            'Total gross amount paid/credited with respect to the holding during the period'
        ]
    }]
    const acct = [{
        data: validAccounts,
        title: 'Account Details',
        headers: ['Broker A/C No', 'Broker'],
        type: 'HORIZONTAL_TABLE'
    }]
    return {acct, a2}

}
export const generateHoldingStatement = async ({
                                            stockTransactions: transactions,
                                            dividends,
                                            brokerageAccountTransactions: bankStatements,
                                            type,
                                            year,
                                            brokerageAccountDetails: accounts,
                                            handleStockSplit = true,
                                            stockSplitMap = {},
                                            tickerChangeMap = {},
                                            cacheOnlyForTickerChange = true
                                        } = {}) => {

    let startDate
    let endDate
    let currency = 'USD'

    switch (type) {
        case 'PNL':
            startDate = `${year}-04-01`
            endDate = `${parseInt(year) + 1}-03-31`
            break
        case 'FA':
            startDate = `${year}-01-01`
            endDate = `${year}-12-31`
            currency = 'INR'
            break
    }

    let startMoment = moment(startDate);
    let endMoment = moment(endDate);

    const todayDate = moment()
    if (todayDate < endMoment) {
        endDate = todayDate.format('YYYY-MM-DD')
        endMoment = todayDate
    }

    // let transactions = readCSV(transactionPath);
    // let dividends = readCSV(dividendPath);
    // let bankStatements = readCSV(bankPath);

    await modifyTickers(transactions, dividends, tickerChangeMap, cacheOnlyForTickerChange)
    if (handleStockSplit) {
        transactions = await handleStockSplits(transactions, stockSplitMap)
    }

    // Assign unique IDs to transactions
    transactions = assignUniqueIds(transactions);

    // Sort transactions and dividends by date
    transactions = transactions.sort((a, b) => moment(a.Date) - moment(b.Date));
    dividends = dividends.sort((a, b) => moment(a.Date) - moment(b.Date));
    bankStatements = bankStatements.sort((a, b) => moment(a.Date) - moment(b.Date));



    const dividendStatement = createDividendStatement(dividends, startMoment, endMoment)

    const {acct, a2} = createAccountStatement(transactions, dividends, bankStatements, startMoment, endMoment, accounts)
    if (currency === 'INR') {
        transactions = addInrToData(transactions, 'TotalAmount', 'Date');
        dividends = addInrToData(addInrToData(dividends, 'Dividend', 'Date'), 'Tax', 'Date');
    }

    const allHoldings = processTransactions(transactions, startMoment, endMoment);

    // Create stock holdings map
    const stockHoldingsMap = createStockHoldingsMap(transactions, startMoment, endMoment);

    const holdingsWithDividends = calculateDividends(allHoldings, stockHoldingsMap, dividends, startMoment, endMoment);
    const holdingsWithPeakValues = await calculatePeakValues(holdingsWithDividends, stockHoldingsMap, startMoment, endMoment, currency);
    const finalHoldings = await calculateClosingBalance(holdingsWithPeakValues, stockHoldingsMap, endMoment, currency);
    const pAndL = generatePAndL(finalHoldings, transactions, bankStatements, startMoment, endMoment)

    const pAndLContent = [
        {
            "content": [
                ...acct, ...pAndL, ...dividendStatement
            ]
        }
    ]

    const faContent = [
        {
            sheetName: 'A3',
            content: await generateFA(finalHoldings)
        },
        {
            sheetName: 'A2',
            content: a2
        }
    ]

    switch (type) {
        case 'PNL':
            return await generateExcelFromJson(pAndLContent)
        case 'FA':
            return await generateExcelFromJson(faContent);

    }
};


// const pAndLOutputPath = './US_CG_SACHIN_2023.xls'
// const transactionPath = './sachin_txns.csv';
// const dividendPath = './sachin_dividends.csv';
// const bankPath = './sachin_account.csv';
// const startDate = '2022-04-01';
// const endDate = '2023-03-31';
// const outputPath = './SCHEDULE_FA_SACHIN_2023.xls';

// const pAndLOutputPath = './US_CG_ROHAN_2023.xls'
// const transactionPath = './rohan_txns.csv';
// const dividendPath = './rohan_dividends.csv';
// const bankPath = './rohan_account.csv';
// const startDate = '2022-04-01';
// const endDate = '2023-03-31';
// const outputPath = './SCHEDULE_FA_ROHAN_2023.xls';
// generateHoldingStatement(transactionPath, dividendPath, bankPath, '2023-04-01', '2024-03-31', null, pAndLOutputPath, 'USD', accounts)
//     .then(() => {
//         console.log(`Holdings statement from ${startDate} to ${endDate} has been generated successfully.`);
//     })
//     .catch(error => {
//         console.error(`Error generating holdings statement: ${error.message}`, error.stack);
//     });
//
// generateHoldingStatement(transactionPath, dividendPath, bankPath, '2023-01-01', '2023-12-31', outputPath, null, 'INR', accounts)
//     .then(() => {
//         console.log(`Holdings statement from ${startDate} to ${endDate} has been generated successfully.`);
//     })
//     .catch(error => {
//         console.error(`Error generating holdings statement: ${error.message}`, error.stack);
//     });

// generateStatement({stockTransactions, dividends, brokerageAccountTransactions, type, year, brokerageAccountDetails}) => {}