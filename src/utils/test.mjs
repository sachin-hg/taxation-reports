import yf from 'yahoo-finance2';
import moment from 'moment';
import momentT from 'moment-timezone';
export const getDividendsForTickers = async (tickerDatesMap) => {
  const result = {};

  // Process each ticker once
  for (const ticker of Object.keys(tickerDatesMap)) {
    const transactionDates = tickerDatesMap[ticker];

    // Sort the transaction dates (assumes 'YYYY-MM-DD' format)
    const sortedTxnDates = transactionDates.sort((a, b) => new Date(a) - new Date(b));
    const minTxnDate = sortedTxnDates[0];
    const maxTxnDate = sortedTxnDates[sortedTxnDates.length - 1];

    // Define the query period:
    //   period1 is 20 days before the earliest transaction date
    //   period2 is the latest transaction date
    const period1 = moment(minTxnDate).subtract(90, 'days').format('YYYY-MM-DD');
    const period2 = moment(maxTxnDate).format('YYYY-MM-DD');

    try {
      // Query dividend events once for the ticker over the period
      const historicalData = await yf.historical(ticker, {
        period1,
        period2,
        events: 'dividends'
      });
      console.log(historicalData)

      // Sort the fetched dividend events by date in ascending order.
      const sortedDividends = historicalData.sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      result[ticker] = {};

      // For each transaction date, find the nearest previous dividend event.
      sortedTxnDates.forEach((txnDate) => {
        const txnDateObj = new Date(txnDate);
        // Filter dividend events to only those on or before the transaction date.
        const validEvents = sortedDividends.filter(
          (event) => new Date(event.date) <= txnDateObj
        );

        if (validEvents.length > 0) {
          // The last event in validEvents is the most recent dividend before txnDate.
          const nearestEvent = validEvents[validEvents.length - 1];
          const eventDateStr = momentT(nearestEvent.date).tz('America/New_York').subtract(1, 'days').format('YYYY-MM-DD');

          result[ticker][txnDate] = {
            date: eventDateStr,               // Dividend declaration date
            perShare: nearestEvent.dividends  // Dividend amount per share
          };
        } else {
          // No dividend event found before this transaction date.
          result[ticker][txnDate] = null;
        }
      });
    } catch (error) {
      console.error(`Error fetching dividend history for ${ticker}:`, error.message);
      result[ticker] = {};
    }
  }

  return result;
};

// Example usage:
const tickerDatesMap = {
  LLY: ['2024-01-01', '2024-12-31']
};

getDividendsForTickers(tickerDatesMap)
  .then((data) => console.log('Dividend Data:', data))
  .catch((err) => console.error(err));
