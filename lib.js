const Web3 = require("web3");
const Provider = require("@truffle/hdwallet-provider");
const globalConfig = require("./globalConfig.js");
const config = require("./config.js");
const abi = require("./abi.json");
var colors = require("colors/safe");
const Moralis = require("moralis/node");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const predictions = config.predictions;

const privateKey = process.env.PRIVATE_KEY;
let tempweb3 = new Web3("https://bsc-dataseed.binance.org");
const operator = tempweb3.eth.accounts.privateKeyToAccount(
  process.env.PRIVATE_KEY
);
const operatorAddress = operator.address;
const contracts = {};
const web3s = {};
const priceCache = {};

Moralis.start({
  serverUrl: globalConfig.moralis.serverUrl,
  appId: globalConfig.moralis.appId,
});

const coloredLog = (pid, ...txt) => {
  const title = predictions[pid].title ? predictions[pid].title : pid;
  console.log(colors[predictions[pid].color](title + " : " + txt.join(" ")));
};

const checkTime = () => {
  const date = new Date();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const day = date.getDay();
  if (day == 0 || day == 6) return false;
  if (
    hour < globalConfig.stockHours.startHour ||
    hour >= globalConfig.stockHours.endHour
  )
    return false;
  if (
    hour == globalConfig.stockHours.startHour &&
    minute < globalConfig.stockHours.startMin
  )
    return false;
  return true;
};

const getPrice = (pid) => {
  const predictionData = predictions[pid];

  if (predictionData.apitype == "FTX")
    return getPriceFTX(predictionData.apicode);
  else if (predictionData.apitype == "BINANCE")
    return getPriceBINANCE(predictionData.apicode);
  else if (predictionData.apitype == "KUCOIN")
    return getPriceKUCOIN(predictionData.apicode);
};

const getPriceFTX = async (code) => {
  const data = await fetch("https://ftx.com/api/markets/" + code);
  const dataJson = await data.json();
  const price = dataJson.result.price;
  const priceTemp = Math.round(parseFloat(price) * 100000000);
  return priceTemp;
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

const getWeb3 = (pid) => {
  const predictionData = predictions[pid];
  let web3;
  if (web3s[predictionData.network]) web3 = web3s[predictionData.network];
  else {
    web3 = new Web3(
      globalConfig.networkSettings[predictionData.network].currentRpc
    );
    web3s[predictionData.network] = web3;
  }
  return web3;
};

const getGasPrice = async (pid) => {
  const predictionData = predictions[pid];
  const networkConfig = globalConfig.networkSettings[predictionData.network];
  const fallbackGas = networkConfig.gasPrice;
  if (networkConfig.checkGas) {
    try {
      const data = await fetch(networkConfig.gasApi);
      const dataJson = await data.json();
      const gasLevel = networkConfig.gasLevel
        ? networkConfig.gasLevel
        : "FastGasPrice";
      const gas = dataJson.result[gasLevel];
      const gasOffset = networkConfig.gasOffset ? networkConfig.gasOffset : 0;
      const gasPriceWei = getWeb3(pid).utils.toWei(
        (parseFloat(gas) + gasOffset).toString(),
        "gwei"
      );
      return gasPriceWei.toString();
    } catch (err) {
      return fallbackGas;
    }
  } else return fallbackGas;
};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const pause = async (pid) => {
  coloredLog(pid, "pausing step 1 ...");
  const gasPrice = await getGasPrice(pid);
  const predictionContract = getPredictionContract(pid);
  coloredLog(pid, "pausing with gas price: " + gasPrice);
  try {
    await predictionContract.methods
      .pause()
      .send({ from: operatorAddress, gasPrice });

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
  const gasPrice = await getGasPrice(pid);
  const predictionContract = getPredictionContract(pid);
  coloredLog(pid, "unpausing gas price: " + gasPrice);
  try {
    await predictionContract.methods
      .unpause()
      .send({ from: operatorAddress, gasPrice });

    coloredLog(pid, "unpaused");

    return checkPredictionContract(pid);
  } catch (err) {
    coloredLog(pid, "error on unpausing");
    coloredLog(pid, err.message);

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
    executionError.set("message", error.message);
    executionError.set("timestamp", Date.now());
    executionError.save();
  } catch (err) {
    coloredLog(pid, "Couldnt save error information to Moralis");
  }
};

const startExecuteRound = async (pid, data) => {
  const date = new Date(Date.now()).toLocaleString();

  if (predictions[pid].isStock && !checkTime()) {
    coloredLog(pid, "(exrnd) stock time is over so pausing @  " + date);
    await pause(pid);
    return restartOnMorning(pid, data);
  }

  coloredLog(pid, "calling executeRound @  " + date);
  const gasPrice = await getGasPrice(pid);
  coloredLog(pid, "using gasPrice: " + gasPrice);

  const predictionContract = getPredictionContract(pid);

  const currentRoundNo = await predictionContract.methods.currentEpoch().call();

  let price;
  let priceTimestamp;

  if (priceCache[pid] && priceCache[pid][currentRoundNo]) {
    coloredLog(pid, "getting price from CACHE for round:" + currentRoundNo);
    price = priceCache[pid][currentRoundNo];
    priceTimestamp = priceCache[pid]["timestamp" + currentRoundNo];
  } else {
    coloredLog(pid, "getting price for round:" + currentRoundNo);
    price = await getPrice(pid);
    priceTimestamp = Date.now();
    if (!priceCache[pid]) priceCache[pid] = {};
    priceCache[pid][currentRoundNo] = price;
    priceCache[pid]["timestamp" + currentRoundNo] = priceTimestamp;
  }

  coloredLog(
    pid,
    "got price " +
      price.toString() +
      " @ timestamp: " +
      priceTimestamp +
      " from api: " +
      predictions[pid].apitype
  );

  try {
    const nonce = await getWeb3(pid).eth.getTransactionCount(operatorAddress);
    const receipt = await predictionContract.methods
      .executeRound(price.toString())
      .send({ from: operatorAddress, gasPrice, nonce });

    if (receipt) {
      coloredLog(pid, `: Transaction hash: ${receipt.transactionHash}`);

      try {
        const ExecutionPrice = Moralis.Object.extend("ExecutionPrice");
        const executionPrice = new ExecutionPrice();
        executionPrice.set("prediction", predictions[pid].title);
        executionPrice.set("epoch", currentRoundNo.toString());
        executionPrice.set("network", predictions[pid].network);
        executionPrice.set("price", price.toString());
        executionPrice.set("timestamp", priceTimestamp);
        executionPrice.set("api", predictions[pid].apitype);
        executionPrice.save();
      } catch (err) {
        coloredLog(pid, "Couldnt save price information to Moralis");
      }

      return successExecuteRound(pid);
    }
  } catch (error) {
    coloredLog(pid, "ERROR REVERT:");
    coloredLog(pid, "" + error.message);

    saveErrorData(pid, error, currentRoundNo, "executeRound");

    if (error.message.includes(">buffer")) {
      await pause(pid);
      return checkPredictionContract(pid);
    } else {
      return checkPredictionContract(pid);
    }
  }
};

const retryFailedExecuteRound = async (pid) => {
  await sleep(5000);
  coloredLog(pid, "retrying... ");
  startExecuteRound(pid);
};

const successExecuteRound = async (pid) => {
  await sleep(predictions[pid].interval * 1000 + 2000);
  startExecuteRound(pid);
};

const restartOnMorning = async (pid) => {
  const date = new Date();
  const day = date.getDay();
  const hour = date.getHours();
  const minute = date.getMinutes();

  var now = new Date();

  if (day > 0 && day < 5) {
    if (hour > globalConfig.stockHours.endHour - 1)
      now.setDate(now.getDate() + 1);
  } else if (day == 5 && hour > globalConfig.stockHours.endHour - 1)
    now.setDate(now.getDate() + 3);
  else if (day == 6) now.setDate(now.getDate() + 2);
  else if (day == 0) now.setDate(now.getDate() + 1);

  now.setHours(globalConfig.stockHours.startHour);
  now.setMinutes(globalConfig.stockHours.startMin);
  now.setMilliseconds(0);

  const mSecondsLeft = now.getTime() - Date.now();

  coloredLog(
    pid,
    "Prediction will restart on morning - ms left: " + mSecondsLeft
  );
  await sleep(mSecondsLeft);
  checkPredictionContract(pid);
};

const tryRpc = async (data, i) => {
  return new Promise(async (resolve, reject) => {
    let rpcToUse = data.rpcOptions[i];
    let web3;

    console.log("trying RPC", rpcToUse);
    web3 = new Web3(rpcToUse);

    web3.eth.net
      .isListening()
      .then(() => {
        resolve(true);
      })
      .catch(() => {
        reject(false);
      });

    setTimeout(resolve, 2000, false);
  });
};

const chooseRpc = async (data) => {
  if (!data.rpcOptions || data.rpcOptions.length == 0) return;
  data.updatingRpc = true;
  let rpcNum = 0;
  await tryRpc(data, 0).then(async (result) => {
    if (result) rpcNum = 0;
    else {
      await tryRpc(data, 1).then(async (result) => {
        if (result) rpcNum = 1;
        else {
          await tryRpc(data, 2).then(async (result) => {
            if (result) rpcNum = 2;
          });
        }
      });
    }
  });

  const rpcToUse = data.rpcOptions[rpcNum];
  console.log("selected rpc", data.rpcOptions[rpcNum]);

  if (data.currentRpc != rpcToUse) {
    data.currentRpc = rpcToUse;
    const provider = new Provider(data.privateKey, rpcToUse);
    const web3 = new Web3(provider);

    for (let i = 0; i < data.predictions.length; i++) {
      const pid = data.predictions[i];

      const predictionContract = new web3.eth.Contract(abi, predictionAddress);
      data.predictionData[pid] = {
        contract: predictionContract,
        address: predictionAddress,
      };
    }
  } else console.log("same rpc - no update", rpcToUse);

  data.updatingRpc = false;
};

const getPredictionContract = (pid) => {
  if (contracts[pid]) return contracts[pid];
  const predictionData = predictions[pid];
  const provider = new Provider(
    privateKey,
    globalConfig.networkSettings[predictionData.network].currentRpc
  );
  const web3 = new Web3(provider);
  const predictionContract = new web3.eth.Contract(abi, predictionData.address);
  contracts[pid] = predictionContract;
  return predictionContract;
};

const checkPredictionContract = async (pid) => {
  //const network =  predictions[pid].network;
  //if(!globalConfig.networkSettings[network].updatingRpc) await chooseRpc(pid);

  const predictionContract = getPredictionContract(pid);

  coloredLog(pid, "Prediction check started...");
  const isPaused = await predictionContract.methods.paused().call();

  if (predictions[pid].isStock && !checkTime()) {
    coloredLog(pid, "market is off, so wait for morning");
    if (!isPaused) {
      coloredLog(pid, " pausing...");
      await pause(pid);
      await sleep(2000);
    }
    restartOnMorning(pid);
    return;
  }

  if (isPaused) {
    coloredLog(pid, "Prediction is paused so unpausing...");
    return unpause(pid);
  }

  const genesisStartOnce = await predictionContract.methods
    .genesisStartOnce()
    .call();

  //its already running. get seconds left and run
  if (genesisStartOnce) {
    const currentRoundNo = await predictionContract.methods
      .currentEpoch()
      .call();
    const roundData = await predictionContract.methods
      .timestamps(currentRoundNo)
      .call();

    const blockNumber = await getWeb3(pid).eth.getBlockNumber();
    const block = await getWeb3(pid).eth.getBlock(blockNumber);
    let timestamp;

    if (block) timestamp = block.timestamp * 1000;
    else timestamp = Date.now();

    const msecondsLeft = 1000 * roundData.lockTimestamp - timestamp;

    coloredLog(
      pid,
      "contract is already active so running after ms: " + msecondsLeft
    );

    if (msecondsLeft > 0) await sleep(msecondsLeft + 2000);

    return startExecuteRound(pid);
  } //its not started after unpaused, so run them in turns
  else {
    coloredLog(pid, "Running Genesis StartOnce...");
    const gasPrice = await getGasPrice(pid);

    try {
      const nonce = await getWeb3(pid).eth.getTransactionCount(operatorAddress);
      await contracts[pid].methods
        .genesisStartRound()
        .send({ from: operatorAddress, gasPrice, nonce });

      coloredLog(
        pid,
        "GenesisStartOnce is complete, waiting for interval seconds"
      );

      await sleep(predictions[pid].interval * 1000 + 2000);

      startExecuteRound(pid);
    } catch (err) {
      coloredLog(pid, error.message);
      coloredLog(pid, "could not start genesis, will retry");

      saveErrorData(pid, error, currentRoundNo, "genesisStart");

      await sleep(5000);
      return checkPredictionContract(pid);
    }
  }
};

module.exports = {
  chooseRpc,
  checkTime,
  getPrice,
  getGasPrice,
  sleep,
  pause,
  unpause,
  startExecuteRound,
  retryFailedExecuteRound,
  successExecuteRound,
  restartOnMorning,
  checkPredictionContract,
  getPredictionContract,
};
