var shell = require('shelljs');
const config = require('./config.js');
require('dotenv').config()
const { sleep, checkPredictionContract, pause, getPredictionContract, chooseRpc } = require("./lib.js");

const runOnStart = async () => {

  shell.exec('pm2 restart priceSaver');

    for (let i = 0; i < config.predictions.length; i++) {

      if(config.predictions[i].keepPaused){
        await chooseRpc(config.predictions[i].network);
        const predictionContract = getPredictionContract(i);
        const isPaused = await predictionContract.methods.paused().call();
        if(!isPaused) pause(i);
      }
      else{
        checkPredictionContract(i);
      }
      await sleep(2000);
    }
};

const restartInterval = () => {
  shell.exec('pm2 restart execute');
} 

runOnStart();
if(config.restart){
  setInterval(restartInterval, config.restartTimer);
}