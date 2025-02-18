import {promises as fs} from 'fs'
import path from 'path'
const POLYGON_API_KEY = 'q1iUvcpID4C5IpxXbgfZOehxYH99V_G1'; // Replace with your Polygon.io API key

const CACHE_FILE = path.resolve(__dirname, 'ticker_changes_cache.json');
// https://api.polygon.io/vX/reference/tickers/V/events?types=ticker_change&apiKey=q1iUvcpID4C5IpxXbgfZOehxYH99V_G1
// Function to fetch ticker changes for a given symbol
const fetchTickerChanges = async (symbol) => {
    const url = `https://api.polygon.io/vX/reference/tickers/${symbol}/events?types=ticker_change&apiKey=${POLYGON_API_KEY}`;
    try {
        const response = await fetch(url);
        if (response.status === 429) {
            console.log(`Rate limit exceeded for ${symbol}. Retrying in 1 minute...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            return await fetchTickerChanges(symbol);
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.results || {};
    } catch (error) {
        console.error('Error fetching ticker changes:', error.message);
        return {};
    }
};

// Function to load cached data from JSON file
const loadCache = async () => {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {}; // File not found, return empty cache
        }
        throw error;
    }
};

// Function to save data to cache JSON file
const saveCache = async (cache) => {
    try {
        await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } catch (error) {
        console.error('Error saving cache:', error.message);
    }
};

// Main function to get ticker change history
export const getTickerChangeHistory = async (tickers, cacheOnly = false) => {
    const cache = await loadCache();
    const result = {};

    for (const ticker of tickers) {
        if (cache[ticker]) {
            result[ticker] = cache[ticker];
        } else if (!cacheOnly) {
            const data = await fetchTickerChanges(ticker);
            let events = data.events || [];

            // Sort events by date to find the latest ticker
            events = events.sort((a, b) => new Date(b.date) - new Date(a.date));

            let currentTicker = events[0]?.ticker_change.ticker || ticker;

            if (ticker !== currentTicker) {
                result[ticker] = currentTicker;
                cache[ticker] = currentTicker; // Cache the result
            }

            events.forEach(event => {
                const t = event.ticker_change.ticker;
                if (t !== currentTicker) {
                    result[t] = currentTicker;
                    cache[t] = currentTicker; // Cache the result
                }
            });
        }
    }

    // await saveCache(cache); // Save the cache to the file

    return result;
};


// // Example usage
// const tickers = ['META', 'GOOGL', 'FB']; // Replace with the list of tickers you want to check
// getTickerChangeHistory(tickers, true).then(result => {
//     console.log(JSON.stringify(result, null, 2));
// });
