//log colors:
//black,red,green,yellow,blue,magenta,cyan,white,gray,grey,brightRed,brightGreen,brightYellow,brightBlue,brightMagenta,brightCyan,brightWhite

const config = {
    restart: true,
    restartTimer: 600000,
    predictions: [
        {title:'BNB', keepPaused:false, color:'yellow', network:'BSCTEST', interval: 300, apicode: 'BNB-USDT', apitype:'KUCOIN', address:'0x56153951F2d3EBff6987e7aD648CeF1A2dCcF9Fe', isStock:false},
        {title:'ETH', keepPaused:false, color:'gray', network:'BSCTEST', interval: 300, apicode: 'ETHUSDT', apitype:'BINANCE', address:'0x01485B7B79DCE29E6531F6c17b5A9652eB2C819f', isStock:false},
        {title:'MATIC', keepPaused:false, color:'blue', network:'POLYGONTEST', interval: 300, apicode: 'MATICUSDT', apitype:'BINANCE', address:'0xc25922DAB8a2f14DddE0D094280691bE0f665D7F', isStock:false},
        {title:'TESLA', keepPaused:false, color:'red', network:'POLYGONTEST', interval: 300, apicode: 'TSLA/USD', apitype:'FTX', address:'0x1b3fcDf7199F6F0515f4A2221f0b4762a0B51771', isStock:true},
    ]
}

module.exports = config