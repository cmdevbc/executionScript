var shell = require('shelljs');
const config = require('./config.js');
require('dotenv').config()
const {sleep, checkPredictionContract, getPredictionContract } = require("./libTRON.js");

const network = "TRON";

const runOnStart = async () => {
    try{
        shell.exec('pm2 restart priceSaver');
    }
    catch(err){
        console.log('error restarting priceSaver');
    }

    for (let i = 0; i < config.predictions.length; i++) {
        if(config.predictions[i].network == network){
            if(config.predictions[i].keepPaused){
                const predictionContract = getPredictionContract(i);
                const isPaused = await predictionContract.methods.paused().call();
                if(!isPaused) pause(i);
            }
            else{
                checkPredictionContract(i);
            }
            await sleep(2000);
        }
    }
};

const restartInterval = () => {
  shell.exec('pm2 restart executeTRON');
} 

runOnStart();
if(config.restart){
  setInterval(restartInterval, config.restartTimer);
}