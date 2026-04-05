const { createWalletConnectPayClient } = require("./walletconnect-pay");

const client = createWalletConnectPayClient();

module.exports = {
  client,
  createWalletConnectPayClient,
};