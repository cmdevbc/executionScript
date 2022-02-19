//tesla ftx code:TSLA/USD

//log colors:
//black,red,green,yellow,blue,magenta,cyan,white,gray,grey,brightRed,brightGreen,brightYellow,brightBlue,brightMagenta,brightCyan,brightWhite

//gasLevel: SafeGasPrice, ProposeGasPrice, FastGasPrice
//gasOffset: in wei 

const config = {
    predictions: [
        {title:'BNB', keepPaused:false, color:'yellow', network:'BSCTEST', interval: 300, apicode: 'BNBUSDT', apitype:'BINANCE', address:'0x56153951F2d3EBff6987e7aD648CeF1A2dCcF9Fe', isStock:false},
        {title:'MATIC', keepPaused:false, color:'blue', network:'POLYGONTEST', interval: 300, apicode: 'MATICUSDT', apitype:'BINANCE', address:'0xc25922DAB8a2f14DddE0D094280691bE0f665D7F', isStock:false},
    ],
    networkSettings: {
        BSC: {
            gasLevel:'SafeGasPrice',
            gasOffset:0.1,
            updatingRpc: false,
            currentRpc: 'https://bsc-dataseed3.defibit.io',
            rpcOptions: ["https://bsc-dataseed3.defibit.io", 'https://bsc-dataseed.binance.org', 'https://bsc-dataseed4.binance.org'],
            checkGas: true,
            gasApi: "https://gbsc.blockscan.com/gasapi.ashx?apikey=key&method=gasoracle",
            gasPrice: '5100000000'
        },
        POLYGON: {
            gasLevel:'ProposeGasPrice',
            gasOffset:10,
            updatingRpc: false,
            currentRpc: 'https://polygon-rpc.com/',
            rpcOptions: ["https://polygon-rpc.com/"],
            checkGas: false,
            gasApi: "https://gpoly.blockscan.com/gasapi.ashx?apikey=key&method=gasoracle",
            gasPrice: '100000000000'
        },
        BSCTEST: {
            gasLevel:'SafeGasPrice',
            gasOffset:1,
            updatingRpc: false,
            currentRpc: 'https://speedy-nodes-nyc.moralis.io/1d0a9164468a9049fed45295/bsc/testnet',
            rpcOptions: ["https://speedy-nodes-nyc.moralis.io/1d0a9164468a9049fed45295/bsc/testnet", 'https://data-seed-prebsc-1-s1.binance.org:8545/'],
            checkGas: false,
            gasApi: "https://gbsc.blockscan.com/gasapi.ashx?apikey=key&method=gasoracle",
            gasPrice: '5100000000'
        },
        POLYGONTEST: {
            gasLevel:'ProposeGasPrice',
            gasOffset:10,
            updatingRpc: false,
            currentRpc: 'https://matic-mumbai.chainstacklabs.com',
            rpcOptions: ["https://matic-mumbai.chainstacklabs.com"],
            checkGas: false,
            gasApi: "https://gpoly.blockscan.com/gasapi.ashx?apikey=key&method=gasoracle",
            gasPrice: '100000000000'
        },
    },
    stockHours: {
        startHour:13,
        startMin:30,
        endHour:20
    },
    moralis: {
        serverUrl: "https://kp9ua1g8zbd9.usemoralis.com:2053/server",
        appId: "BPgkCPegZMSEeoLwhpjxECOyD2Fg34ERQG34OOsB"
    }
}

module.exports = config