const config = require("./config.js");
require("dotenv").config();
const { getWeb3, chooseRpc, sleep } = require("./lib.js");
const fs = require("fs");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const priceData = {};
let binanceTimeSync = 0;

const getFileName = (prediction) => {
  return (
    "./roundData/" +
    prediction.network +
    "_" +
    prediction.title +
    "_prices.json"
  );
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
    return { timestamp: dataJson.data.time, price: priceTemp };
  } catch (err) {
    return null;
  }
};

const getPriceHUOBI = async (code) => {
  try {
    const data = await fetch(
      `https://api.huobi.pro/market/trade?symbol=${code}`
    );
    const dataJson = await data.json();
    if (!dataJson || !dataJson.tick) return 0;
    const price = dataJson.tick.data[0].price;
    const timestamp = Math.round(dataJson.tick.data[0].ts / 1000);
    const result =  { timestamp, price };
    return result;
  } catch (err) {
    return null;
  }
};

const getPriceBINANCE = async (code) => {
  try {
    const data = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=" + code
    );
    const dataJson = await data.json();
    const price = dataJson.price;
    const priceTemp = Math.round(parseFloat(price) * 100000000);

    const timestamp = Math.round(Date.now() / 1000) + binanceTimeSync;

    const result = { timestamp, price: priceTemp };
    console.log("cem binance result", result);
    return result;
  } catch (err) {
    return null;
  }
};

const loadPriceDataToCache = (prediction) => {
  const fileName = getFileName(prediction);
  if (!fs.existsSync(fileName)) {
    fs.writeFileSync(fileName, JSON.stringify([]));
    priceData[prediction.title] = [];
  } else {
    let rawdata = fs.readFileSync(fileName);
    rawdata = rawdata.length > 0 ? rawdata : "[]";
    priceData[prediction.title] = JSON.parse(rawdata);
  }
};

const savePrice = async (prediction, priceArrLength) => {
  if (!priceData[prediction.title]) {
    loadPriceDataToCache(prediction);
  }

  if (!prediction.keepPaused) {
    let data;

    if (prediction.apitype == "KUCOIN")
      data = await getPriceKUCOIN(prediction.apicode);
    else if (prediction.apitype == "BINANCE")
      data = await getPriceBINANCE(prediction.apicode);
    else if (prediction.apitype == "HUOBI")
      data = await getPriceHUOBI(prediction.apicode);

    if (data) {
      const fileName = getFileName(prediction);

      priceData[prediction.title].unshift(data);
      if (priceData[prediction.title].length > priceArrLength)
        priceData[prediction.title].pop();

      fs.writeFileSync(fileName, JSON.stringify(priceData[prediction.title]));

      //console.log("saving price for ", prediction.title, data);
    }
  }
};

const checkPredictions = async () => {
  for (let i = 0; i < config.predictions.length; i++) {
    const prediction = config.predictions[i];
    if (!prediction.skipSavePrice) {
      if (prediction.apitype == "BINANCE") {
        const timeData = await fetch("https://api.binance.com/api/v3/time");
        const timeDataJson = await timeData.json();
        binanceTimeSync =
          Math.round(timeDataJson.serverTime / 1000) -
          Math.round(Date.now() / 1000);
        console.log("BINANCE time sync is", binanceTimeSync);
      }

      const saveInterval = prediction.saveInterval || 500;
      const priceArrLength = 10 + (prediction.interval * 1000) / saveInterval;
      setInterval(
        () => savePrice(prediction, priceArrLength),
        prediction.saveInterval
      );
    }
  }
};

checkPredictions();
