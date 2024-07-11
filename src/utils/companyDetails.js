// Ensure you have a valid user agent and contact information
const headers = {
    'User-Agent': 'YourAppName/1.0 (yourname@example.com)'
};

let secCompanyTickersCache = null; // In-memory cache

// Fetch the SEC company tickers JSON directly
const fetchSecCompanyTickers = async () => {
    if (secCompanyTickersCache) {
        return secCompanyTickersCache;
    }

    const url = 'https://www.sec.gov/files/company_tickers.json';
    try {
        const response = await fetch(url);
        secCompanyTickersCache = await response.json();
        return secCompanyTickersCache;
    } catch (error) {
        console.error('Error fetching SEC company tickers:', error.message);
        return null;
    }
};

// Get the CIK for a given ticker
const getCikFromTicker = (ticker, tickersData) => {
    for (const key in tickersData) {
        if (tickersData[key].ticker === ticker) {
            return tickersData[key].cik_str.toString().padStart(10, '0'); // Ensure CIK is 10 digits long
        }
    }
    return null;
};

// Get the company address from the SEC EDGAR API
const getSecCompanyAddress = async (cik, ticker) => {
    const apiUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    try {
        const response = await fetch(apiUrl, { headers });
        const data = await response.json();

        const { name, addresses: {mailing, business} = {} } = data;
        let address = business || mailing;
        const {street1, street2, city, stateOrCountry, zipCode} = address

        address = [street1, street2, city, stateOrCountry].filter(x => x !== null && x !== undefined).join(', ')
        return {address, name, ticker, zipCode}

    } catch (error) {
        console.error(`Error fetching data for CIK ${cik}:`, error.message);
        return 'Error fetching address';
    }
};

// Fetch company details for a list of tickers
export const fetchCompanyDetails = async (tickers) => {
    const tickersData = await fetchSecCompanyTickers();
    if (!tickersData) {
        console.error('Failed to fetch tickers data.');
        return;
    }

    return Promise.all(
        tickers.map(ticker => {
            const cik = getCikFromTicker(ticker, tickersData);
            return getSecCompanyAddress(cik, ticker)
        })
    ).then(data => data.reduce((res, item) => {
        res[item.ticker] = item
        return res
    }, {}))
};