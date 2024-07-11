import axios from 'axios'
import {parse} from 'csv-parse/sync'
const stockDataCache = new Map();
export const fetchStockPrice = async (stock, startDate, endDate) => {
    const cacheKey = `${stock}_${startDate}_${endDate}`;
    if (stockDataCache.has(cacheKey)) {
        return stockDataCache.get(cacheKey);
    }

    const apiUrl = `https://query1.finance.yahoo.com/v7/finance/download/${stock}?period1=${startDate}&period2=${endDate}&interval=1d&events=history`;
    try {
        const response = await axios.get(apiUrl);
        console.log(parse)
        const stockData = parse(response.data, { columns: true });
        stockDataCache.set(cacheKey, stockData);
        return stockData;
    } catch (error) {
        throw new Error(`Error fetching stock price for ${stock}: ${error.message}`, error);
    }
};