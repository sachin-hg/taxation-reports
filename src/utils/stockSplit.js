import yf from 'yahoo-finance2'
import merge from 'lodash/merge'
// Function to get stock split history for a single ticker
const getStockSplitHistoryForTicker = async (ticker) => {
    try {
        // Fetch historical data with splits
        const historicalData = await yf.historical(ticker, { period1: '1900-01-01', period2: new Date().toISOString().split('T')[0], events: 'split' });
        // Filter for stock split events and create the result object
        const stockSplits = historicalData.filter(event => event.stockSplits);
        const splitHistory = {};

        stockSplits.forEach(event => {
            const date = event.date.toISOString().split('T')[0];
            const [numerator, denominator] = event.stockSplits.split(':').map(Number);
            splitHistory[date] = numerator / denominator;
        });

        return splitHistory;
    } catch (error) {
        console.error(`Error fetching stock split history for ${ticker}:`, error.message);
        return {};
    }
};

// Function to get stock split history for a list of tickers
const getStockSplitHistory = async (tickers) => {
    const result = {};
    for (const ticker of tickers) {
        const splitHistory = await getStockSplitHistoryForTicker(ticker);
        result[ticker] = splitHistory;
    }
    return result;
};

// // Example usage
// const tickers = ['AAPL', 'MSFT', 'TSM']; // Replace with the list of tickers you want to check
// getStockSplitHistory(tickers).then(result => {
//     console.log(result);
// });

const moment = require('moment');

// Example of async getStockSplitHistory function
// async function getStockSplitHistory(tickers) {
//     return {
//         'AAPL': {
//             '2020-08-31': 4,
//             '2014-06-09': 7
//         },
//         'GOOGL': {
//             '2015-04-27': 2
//         }
//     };
// }

export const handleStockSplits = async (transactions, stockSplitMap = {}) => {
    // Extract unique tickers from transactions
    const tickers = [...new Set(transactions.map(transaction => transaction.Stock))];

    // Fetch stock split history for the tickers
    let splitHistory = await getStockSplitHistory(tickers);

    splitHistory = merge(splitHistory, stockSplitMap)


    return transactions.map(transaction => {
        const { Stock, Date, Unit } = transaction;
        const splitDates = splitHistory[Stock];

        if (splitDates) {
            let adjustedQuantity = Unit;
            for (const splitDate in splitDates) {
                if (moment(Date).isBefore(splitDate)) {
                    adjustedQuantity *= splitDates[splitDate];
                }
            }
            return { ...transaction, Unit: adjustedQuantity.toPrecision ? adjustedQuantity.toPrecision(9) : adjustedQuantity };
        } else {
            return transaction;
        }
    });
};
