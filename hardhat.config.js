require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.9",
  networks: {
    optimism: {
      url: process.env.OPTIMISM_GOERLI_API_URL,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
