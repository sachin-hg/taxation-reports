import React, { useState } from 'react';
import { Container, Typography, Button, TextField, FormControlLabel, Checkbox, Grid, CircularProgress, IconButton, Modal, Box } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';

const Home = () => {
    const [year, setYear] = useState(new Date().getFullYear());
    const [handleStockSplit, setHandleStockSplit] = useState(false);
    const [cacheOnlyForTickerChange, setCacheOnlyForTickerChange] = useState(false);
    const [file, setFile] = useState(null);
    const [parseFiles, setParseFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [parseLoading, setParseLoading] = useState(false);
    const [openStockSplitModal, setOpenStockSplitModal] = useState(false);
    const [openTickerChangeModal, setOpenTickerChangeModal] = useState(false);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };


    const handleParseFileChange = (e) => {
        const newFiles = Array.from(e.target.files);
        const allFiles = [...parseFiles, ...newFiles];
        setParseFiles(allFiles);
    };

    const handleRemoveFile = (index) => {
        setParseFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
    };

    const handleParseSubmit = async () => {
        if (parseFiles.length === 0) {
            alert('Please select files to parse.');
            return;
        }

        const formData = new FormData();
        parseFiles.forEach(file => {
            formData.append('files', file);
        });

        setParseLoading(true);

        try {
            const response = await axios.post('/api/parseStatement', formData, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'parsed_statements.xlsx');
            document.body.appendChild(link);
            link.click();
        } catch (error) {
            console.error('Error parsing files:', error);
            alert('Error parsing files. Please try again.');
        } finally {
            setParseLoading(false);
        }
    };

    const handleDownloadSample = async () => {
        try {
            const response = await axios.get('/api/downloadSample', {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'sampleExcel.xlsx');
            document.body.appendChild(link);
            link.click();
        } catch (error) {
            console.error('Error downloading sample file:', error);
            alert('Error downloading sample file. Please try again.');
        }
    };



    const handleSubmit = async () => {
        if (!file) {
            alert('Please select an Excel file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('year', year);
        formData.append('handleStockSplit', handleStockSplit);
        formData.append('cacheOnlyForTickerChange', cacheOnlyForTickerChange);

        setLoading(true);

        try {
            const response = await axios.post('/api/generate', formData, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'holding_statements.zip');
            document.body.appendChild(link);
            link.click();
        } catch (error) {
            console.error('Error generating holding statement:', error);
            alert('Error generating holding statement. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const fileNames = parseFiles.map(file => file.name);
    const uniqueFileNames = new Set(fileNames);
    const isDuplicate = uniqueFileNames.size !== fileNames.length

    return (
        <Container sx={{ backgroundColor: 'white', padding: 4, borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginTop: '100px', display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
            <Box sx={{ width: '45%' }}>
                <Typography variant="h4" gutterBottom sx={{ marginBottom: 3, color: '#333', fontWeight: 'bold' }}>
                    Foreign Assets Calculator
                </Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <TextField
                            label="Year"
                            type="number"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            fullWidth
                            InputLabelProps={{
                                sx: { color: '#333' },
                            }}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={<Checkbox checked={handleStockSplit} onChange={(e) => setHandleStockSplit(e.target.checked)} />}
                            label="Handle Stock Split"
                            sx={{ color: '#333' }}
                        />
                        <IconButton onClick={() => setOpenStockSplitModal(true)}>
                            <InfoIcon sx={{ color: '#333' }} />
                        </IconButton>
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={<Checkbox checked={cacheOnlyForTickerChange} onChange={(e) => setCacheOnlyForTickerChange(e.target.checked)} />}
                            label="Cache Only For Ticker Change"
                            sx={{ color: '#333' }}
                        />
                        <IconButton onClick={() => setOpenTickerChangeModal(true)}>
                            <InfoIcon sx={{ color: '#333' }} />
                        </IconButton>
                    </Grid>
                    <Grid item xs={12} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Button variant="contained" component="label" sx={{ backgroundColor: '#1976d2', color: 'white', '&:hover': { backgroundColor: '#115293' } }}>
                            Select Excel File
                            <input type="file" hidden accept=".xlsx,.xls" onChange={handleFileChange} />
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleDownloadSample}
                            sx={{ backgroundColor: '#1976d2', color: 'white', '&:hover': { backgroundColor: '#115293' }, marginLeft: 2 }}
                        >
                            Download Sample File
                        </Button>
                        {file && <Typography sx={{ marginTop: 1, marginLeft: 2 }}>{file.name}</Typography>}
                    </Grid>

                    <Grid item xs={12}>
                        <Button variant="contained" color="primary" onClick={handleSubmit} disabled={loading} sx={{ backgroundColor: '#1976d2', color: 'white', '&:hover': { backgroundColor: '#115293' } }}>
                            {loading ? <CircularProgress size={24} sx={{ marginLeft: 1 }} /> : 'Submit'}
                        </Button>
                    </Grid>
                </Grid>
            </Box>
            <Box sx={{ width: '45%' }}>
                <Typography variant="h5" gutterBottom sx={{ marginBottom: 3, color: '#333', fontWeight: 'bold' }}>
                    Parse Account Statements/Ledger
                </Typography>


                <Grid item xs={12}>
                    <Button variant="contained" component="label" sx={{ backgroundColor: '#1976d2', color: 'white', '&:hover': { backgroundColor: '#115293' }, marginBottom: 3 }}>
                        Select Files
                        <input type="file" hidden accept=".pdf,.xlsx,.xls" multiple onChange={handleParseFileChange} />
                    </Button>
                    {isDuplicate && (
                        <Typography sx={{ color: '#d32f2f', marginBottom: 3 }}>
                            Multiple files with the same name found. Please ensure these aren't duplicate files. It might lead to duplicate transactions in the output.
                        </Typography>
                    )}
                    {parseFiles.length > 0 && (
                        <Box sx={{ marginBottom: 3 }}>
                            <Typography sx={{ color: '#333' }}>Selected files:</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                {parseFiles.map((file, index) => (
                                    <Box key={index} sx={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #ccc', padding: '4px 8px', borderRadius: 1, fontSize: 14 }}>
                                        <Typography sx={{ color: '#333', marginRight: 1 }}>{file.name}</Typography>
                                        <IconButton onClick={() => handleRemoveFile(index)} sx={{ color: '#d32f2f', padding: 0 }}>
                                            <CloseIcon />
                                        </IconButton>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    )}
                </Grid>
                <Grid item xs={12}>
                    <Button variant="contained" color="primary" onClick={handleParseSubmit} disabled={parseLoading} sx={{ backgroundColor: '#1976d2', color: 'white', '&:hover': { backgroundColor: '#115293' } }}>
                        {parseLoading ? <CircularProgress size={24} sx={{ marginLeft: 1 }} /> : 'Generate Statement'}
                    </Button>
                </Grid>
                <Box sx={{ backgroundColor: '#fff9c4', padding: 2, borderRadius: 1, marginTop: 3 }}>
                    <Box sx={{ color: '#d32f2f', fontSize: 14, paddingLeft: 2 }}>
                        <ul>
                            <li>This tool will attempt to parse account statements generated from INDMoney/Groww/Etrade.</li>
                            <li>This tool was generated while keeping in mind the limited use cases that I encountered.</li>
                            <li>You might want to create your own parser.</li>
                            <li>Don't trust this tool, or at least verify the output.</li>
                            <li>You also need to append "Broker Account Details" sheet and optionally "Stock Split History", "Ticker Change History" Sheets manually to the output of this tool, before using it as an input in "Foreign Assets Calculator".</li>
                            <li>For INDMoney the "Running Balance Report" since inception needs to be downloaded. It's received on your email. Filename starts with: "IND-LEDGERING_REPORT". Dont Change the filename before uploading.</li>
                            <li>For Groww. Account statements for each month need to be downloaded since inception. The default filenames of the downloaded files are like "ACOUNT_STATEMENT_YYYY_MONTH.pdf". Dont change the default filename.</li>
                            <li>For Etrade/Morgan Stanley. Brokerage Account Statements need to be downloaded since inception. Default filenames are "Brokerage Statement - XXXXX9908 - YYYYMM.pdf" or "MS_ClientStatements_ACCT_NUM_YYYYMM.pdf". Dont change the filenames before uploading.</li>
                            <li>For Intuit's Employees using Etrade/Morgan Stanley. In case of RSU/ESPP purchases Trade Confirmation reports since inception also need to be downloaded. Save the filename in the following format: "INTU_TRADE_YYYYMMDD.pdf" format before uploading.</li>
                        </ul>
                    </Box>
                </Box>
            </Box>

            <Modal
                open={openStockSplitModal}
                onClose={() => setOpenStockSplitModal(false)}
                aria-labelledby="stock-split-modal-title"
                aria-describedby="stock-split-modal-description"
            >
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, backgroundColor: 'white', padding: 4, boxShadow: 24, borderRadius: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography id="stock-split-modal-title" variant="h6" component="h2" sx={{ color: '#333', marginBottom: 2 }}>
                            Handle Stock Split Information
                        </Typography>
                        <IconButton onClick={() => setOpenStockSplitModal(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    <Typography id="stock-split-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        This ensures that stock splits that happened for any stock from the purchase date to the sell/closing date are automatically accounted for.
                    </Typography>
                    <Typography id="stock-split-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        It assumes that your input doesn't already account for stock splits.
                    </Typography>
                    <Typography id="stock-split-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        Example:
                        <ul>
                            <li>AAPL was split on 2020-04-10 in a 1:10 ratio.</li>
                            <li>If you bought 2 stocks of AAPL on 2020-02-02, your input transaction would show "AAPL 2020-02-02 BUY 2 240".</li>
                            <li>This program will adjust that to 20 units after the split.</li>
                            <li>If your input has a sell transaction "AAPL 2020-05-05 SELL 1.5 200", this program will adjust that to 15 units sold on 2020-05-05.</li>
                            <li>If this option is unchecked, it will assume 1.5 units were sold.</li>
                        </ul>
                    </Typography>
                    <Typography id="stock-split-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        The same adjustments will apply to dividends received per share.
                    </Typography>
                    <Typography id="stock-split-modal-description" sx={{ color: '#333' }}>
                        The closing statement will be generated accordingly.
                    </Typography>
                </Box>
            </Modal>

            <Modal
                open={openTickerChangeModal}
                onClose={() => setOpenTickerChangeModal(false)}
                aria-labelledby="ticker-change-modal-title"
                aria-describedby="ticker-change-modal-description"
            >
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, backgroundColor: 'white', padding: 4, boxShadow: 24, borderRadius: 2 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography id="ticker-change-modal-title" variant="h6" component="h2" sx={{ color: '#333', marginBottom: 2 }}>
                            Cache Only For Ticker Change Information
                        </Typography>
                        <IconButton onClick={() => setOpenTickerChangeModal(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    <Typography id="ticker-change-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        Companies sometimes change their stock symbol (e.g., FB to META, GOOGL to GOOG). Your input statement might be missing this information. The program has several ways to handle it:
                    </Typography>
                    <Typography id="ticker-change-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        1. The input Excel file can have a sheet named "Ticker Change History", which is a mapping of "Old Ticker" to "New Ticker" provided manually by you for your relevant stocks.
                    </Typography>
                    <Typography id="ticker-change-modal-description" sx={{ color: '#333', marginBottom: 2 }}>
                        2. The program can automatically get this information from Yahoo Finance/SEC data. However, this can slow down the result generation. If you know there were no ticker changes or you can provide this information in "Ticker Change History", the response can be faster. Select this option if you can provide this information yourself.
                    </Typography>
                </Box>
            </Modal>
        </Container>
    )
};

export default Home
