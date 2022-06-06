const TronWeb = require("tronweb");
const config = require('./config.js');
require('dotenv').config()
const abi = require("./abi.json");
const fs = require('fs');
var shell = require("shelljs");
const globalConfig = require("./globalConfig.js");
var colors = require("colors/safe");
const Moralis = require("moralis/node");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const privateKeyTron = process.env.PRIVATE_KEY_TRON;

const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
  headers: { "TRON-PRO-API-KEY": "19f694f6-87b8-4a97-be03-8cbba4805be9" },
  privateKey: privateKeyTron
});

const predictions = config.predictions;
const contracts = {};
const signers = {};
const web3s = {};
const priceCache = {};
const rpcCache = {};
const timerSyncCache = {};
const nonces = {};

const priceData = {};
let assigningNonce = false;

Moralis.start({
  serverUrl: globalConfig.moralis.serverUrl,
  appId: globalConfig.moralis.appId,
});

const getPredictionContract = (pid) => {
    if (contracts[pid]) return contracts[pid];
    const predictionData = predictions[pid];
  
    const contract = tronWeb.contract(abi, predictionData.address);
    contracts[pid] = contract;
    return contract;
  };

const coloredLog = (pid, ...txt) => {
  const title = predictions[pid].title ? predictions[pid].title : pid;
  console.log(colors[predictions[pid].color](title + " : " + txt.join(" ")));
};

const getPrice = (pid) => {
  const predictionData = predictions[pid];
  return getPriceBINANCE(predictionData.apicode);
};

const getPriceBINANCE = async (code) => {
    const data = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=" + code
    );
    const dataJson = await data.json();
    const price = dataJson.price;
    const priceTemp = Math.round(parseFloat(price) * 100000000);
    return priceTemp;
  };
  

const getPriceKUCOIN = async (code) => {
  try {
    const data = await fetch(
      `https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${code}`
    );
    const dataJson = await data.json();
    if (!dataJson || !dataJson.data) return 0;
    const price = dataJson.data.price;
    const priceTemp = Math.round(parseFloat(price) * 100000000);
    return priceTemp;
  } catch (err) {
    //console.log(err);
    return 0;
  }
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const pause = async (pid) => {
  coloredLog(pid, "pausing step 1 ...");
  const predictionContract = getPredictionContract(pid);
  try {
    await predictionContract.pause().send();

    coloredLog(pid, "paused");
    return;
  } catch (err) {
    coloredLog(pid, "error on pausing");
    coloredLog(pid, err.message);
    return;
  }
};

const unpause = async (pid) => {
  coloredLog(pid, "unpausing step 1...");
  const predictionContract = getPredictionContract(pid);
  try {
    await predictionContract.unpause().send();

    coloredLog(pid, "unpaused");

    return checkPredictionContract(pid);
  } catch (err) {
    coloredLog(pid, "error on unpausing");
    coloredLog(pid, err.error);

    return checkPredictionContract(pid);
  }
};

const saveErrorData = async (pid, error, currentRoundNo, errorFunction) => {
  try {
    const ExecutionError = Moralis.Object.extend("ExecutionError");
    const executionError = new ExecutionError();
    executionError.set("errorFunction", errorFunction);
    executionError.set("prediction", predictions[pid].title);
    executionError.set("epoch", currentRoundNo.toString());
    executionError.set("network", predictions[pid].network);
    executionError.set("message", error.error);
    executionError.set("timestamp", Date.now());
    executionError.save();
  } catch (err) {
    coloredLog(pid, "Couldnt save error information to Moralis");
  }
};

const updatePriceCache = async (pid) => {
    const predictionContract = getPredictionContract(pid);
    const currentRoundNo = await predictionContract.currentEpoch().call();
    if (priceCache[pid] && priceCache[pid][currentRoundNo]) return;
  
    let price;
    let priceTimestamp;
  
    coloredLog(pid, "getting price for round:" + currentRoundNo);
    price = await getPrice(pid);
    priceTimestamp = Date.now();
    if (!priceCache[pid]) priceCache[pid] = {};
    priceCache[pid][currentRoundNo] = price;
    priceCache[pid]["timestamp" + currentRoundNo] = priceTimestamp;
    savePriceDataToFile(pid, currentRoundNo, price, priceTimestamp);
  
    coloredLog(
      pid,
      "got price " +
        price.toString() +
        " @ timestamp: " +
        priceTimestamp +
        " from api: " +
        predictions[pid].apitype
    );
  }

const startExecuteRound = async (pid) => {
  const date = new Date(Date.now()).toLocaleString();

  const predictionContract = getPredictionContract(pid);
  const currentRoundNo = await predictionContract.currentEpoch().call();

  let price = await getPrice(pid);
  let priceTimestamp;
  let diffTimestamp;

  const timestampData = await predictionContract.timestamps(currentRoundNo - 1).call();
  const closeTimestamp = parseInt(timestampData.closeTimestamp) * 1000;

  if(!predictions[pid].skipSavePrice){

    coloredLog(pid, "prediction closeTimestamp  " + closeTimestamp);

    getPriceDataFromFile(pid);

    const prices = priceData[predictions[pid].title];
    let diff;

    //scenarios:
    
    //price array is empty, or the price is old, get currentPrice, [restart priceSaver for future rounds] 
    if(prices.length === 0 || prices[0].timestamp <= closeTimestamp){
      price = await getPrice(pid);
      priceTimestamp = Date.now();
      diffTimestamp = closeTimestamp - priceTimestamp;
      shell.exec('pm2 restart priceSaver');
    }
    //if the round executes late, use the earliest price available
    else if(prices[prices.length - 1].timestamp >= closeTimestamp) {
      price = prices[prices.length - 1].price;
      priceTimestamp = prices[prices.length - 1].timestamp;
      diffTimestamp = closeTimestamp - priceTimestamp;
      console.log('cem TS DIFF', diffTimestamp);
    }
    //loop through price data to get the price closest to the closingTimestamp
    else {
      for(let i = 0; i < prices.length; i++){
        diff = closeTimestamp - prices[i].timestamp;
        if(prices[i].timestamp <= closeTimestamp){
          let targetIndex = i;
          if(i > 0) {
            const diffTemp = prices[i-1].timestamp - closeTimestamp;
            console.log('diff , diffAfterCT :', diff, diffTemp);
            if(diffTemp < diff){
              targetIndex--;
              console.log('cem previous TS is closer @ index: '+i);
            }
          }
          price = prices[targetIndex].price;
          priceTimestamp = prices[targetIndex].timestamp;
          diffTimestamp = closeTimestamp - priceTimestamp;
          console.log('cem FOUND price to use @ index: '+i, prices[targetIndex]);
          console.log('cem TS DIFF', closeTimestamp - prices[targetIndex].timestamp);
          break;
        }
      }
    }
  }
  else{
    await updatePriceCache(pid);

    if (!priceCache[pid] || !priceCache[pid][currentRoundNo]){
      await updatePriceCache(pid);
    }

    price = priceCache[pid][currentRoundNo];
    priceTimestamp = priceCache[pid]["timestamp" + currentRoundNo];
    diffTimestamp = closeTimestamp - priceTimestamp;
  }

  //restart if still couldnt get the price
  if (!price) {
    return checkPredictionContract(pid);
  }

  coloredLog(
    pid,
    "round: " +
    currentRoundNo +
    " , got price FROM CACHE " +
      price +
      " @ timestamp: " +
      priceTimestamp +
      " from api: " +
      predictions[pid].apitype
  );

  coloredLog(pid, "calling executeRound @  " + date);

  try {
    const receipt = await predictionContract
      .executeRound(price.toString())
      .send();

    if (receipt) {
      coloredLog(pid, `Transaction hash: ${receipt}`);
      return successExecuteRound(pid);
    }
  } catch (error) {
    coloredLog(pid, "ERROR REVERT:");
    coloredLog(pid, error.error);

    saveErrorData(pid, error, currentRoundNo, "executeRound");

    if (error.error.includes(">buffer")) {
      coloredLog(pid, "round ending timer passed, need to pause/unpause..");
      await pause(pid);
      await sleep(2000);
      return checkPredictionContract(pid);
    } else {
      coloredLog(pid, "" + error.error);
      return checkPredictionContract(pid);
    }
  }
};

const successExecuteRound = async (pid) => {
  await sleep(predictions[pid].interval * 1000);
  startExecuteRound(pid);
};

const savePriceDataToFile = (pid, currentRoundNo, price, timestamp) => {
  const dataToSave = { round: currentRoundNo, price, timestamp };
  const fileName =
    "./roundData/" +
    predictions[pid].network +
    "_" +
    predictions[pid].title +
    ".json";
  fs.writeFileSync(fileName, JSON.stringify(dataToSave));
};

const loadPriceDataToCache = (pid, currentRoundNo) => {
  const fileName =
    "./roundData/" +
    predictions[pid].network +
    "_" +
    predictions[pid].title +
    ".json";
  if (!fs.existsSync(fileName)) {
    fs.writeFileSync(
      fileName,
      JSON.stringify({ round: 0, price: 0, timestamp: 0 })
    );
  } else {
    let rawdata = fs.readFileSync(fileName);
    let roundPriceData = JSON.parse(rawdata);
    if (roundPriceData.round == currentRoundNo) {
      if (!priceCache[pid]) priceCache[pid] = {};
      priceCache[pid][currentRoundNo] = roundPriceData.price;
      priceCache[pid]["timestamp" + currentRoundNo] = roundPriceData.timestamp;
    }
  }
};

const getPriceDataFromFile = (pid) => {
  const prediction = predictions[pid];
  const fileName =
    "./roundData/" +
    prediction.network +
    "_" +
    prediction.title +
    "_prices.json";
  if (!fs.existsSync(fileName)) {
    fs.writeFileSync(fileName, JSON.stringify([]));
    priceData[prediction.title] = [];
  } else {
    let rawdata = fs.readFileSync(fileName);
    rawdata = rawdata.length > 0 ? rawdata : "[]";
    priceData[prediction.title] = JSON.parse(rawdata);
  }
};

const checkPredictionContract = async (pid) => {

  const predictionContract = getPredictionContract(pid);

  coloredLog(pid, "Prediction check started...");

  const currentRoundNo = await predictionContract.currentEpoch().call();
  loadPriceDataToCache(pid, currentRoundNo);

  const isPaused = await predictionContract.paused().call();

  if (isPaused) {
    coloredLog(pid, "Prediction is paused so unpausing...");
    return unpause(pid);
  }

  const genesisStartOnce = await predictionContract.genesisStartOnce().call();

  //its already running. get seconds left and run
  if (genesisStartOnce) {
    const roundData = await predictionContract
      .timestamps(currentRoundNo)
      .call();

    const block = await tronWeb.trx.getCurrentBlock();
    let timestamp = block ? block.block_header.raw_data.timestamp : Date.now();
    const msecondsLeft = 1000 * roundData.lockTimestamp - timestamp;

    coloredLog(
      pid,
      "contract is already active so running after ms: " + msecondsLeft
    );

    if (msecondsLeft <= predictions[pid].interval * -1000) {
      coloredLog(pid, "round ending timer passed, need to pause/unpause..");
      await pause(pid);
      await sleep(2000);
      return checkPredictionContract(pid);
    }

    if (msecondsLeft > 0) await sleep(msecondsLeft);

    return startExecuteRound(pid);
  } //its not started after unpaused, so run them in turns
  else {
    coloredLog(pid, "Running Genesis StartOnce...");

    try {
      const receipt = await predictionContract.genesisStartRound().send();

      if (receipt) {
        coloredLog(
          pid,
          "GenesisStartOnce is complete, waiting for interval seconds"
        );
        coloredLog(pid, `Transaction hash: ${receipt}`);
        await sleep(
          predictions[pid].interval * 1000 + globalConfig.executeTimerOffset
        );

        return startExecuteRound(pid);
      } else {
        coloredLog(pid, "GenesisStartOnce is FAILED");
      }
    } catch (error) {
      coloredLog(pid, error.error);
      coloredLog(pid, "could not start genesis, will retry");

      //saveErrorData(pid, error, currentRoundNo, "genesisStart");

      await sleep(5000);
      return checkPredictionContract(pid);
    }
  }
};

module.exports = {
  sleep,
  pause,
  unpause,
  getPredictionContract,
  checkPredictionContract,
};
