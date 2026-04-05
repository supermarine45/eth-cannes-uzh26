const DEFAULT_INTERVAL_MS = 60_000;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

async function createWalletConnectPaymentLink({ amountUSD, referenceId }) {
  const merchantId = getRequiredEnv('WALLETCONNECT_MERCHANT_ID');
  const customerApiKey = getRequiredEnv('WALLETCONNECT_CUSTOMER_API_KEY');
  const apiUrl = getRequiredEnv('WALLETCONNECT_API_URL');

  const amountCents = Math.round(Number(amountUSD) * 100).toString();
  const response = await fetch(`${apiUrl}/v1/merchant/payment`, {
    method: 'POST',
    headers: {
      'Api-Key': customerApiKey,
      'Merchant-Id': merchantId,
      'Content-Type': 'application/json',
      'Sdk-Name': 'OmniCheckout',
      'Sdk-Version': '1.0.0',
      'Sdk-Platform': 'web',
    },
    body: JSON.stringify({
      referenceId,
      amount: { value: amountCents, unit: 'iso4217/USD' },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage = data?.error || data?.message || `WalletConnect payment creation failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return data;
}

async function processDueSubscription(subscriptionStore, subscription, invoiceRegistry) {
  const claimedSubscription = await subscriptionStore.markProcessing(subscription.subscriptionId);
  if (!claimedSubscription) {
    return;
  }

  try {
    const payment = await createWalletConnectPaymentLink({
      amountUSD: claimedSubscription.amountUSD,
      referenceId: `sub-${claimedSubscription.subscriptionId}-${claimedSubscription.executionAttempts}`,
    });

    const updatedSubscription = await subscriptionStore.recordExecutionSuccess({
      subscription: claimedSubscription,
      paymentId: payment.paymentId,
      gatewayUrl: payment.gatewayUrl,
    });

    // Write the generated payment to InvoiceRegistry on Coston2 so it appears
    // in the subscriber's Bills tab — same mechanism as one-time invoices.
    if (invoiceRegistry && claimedSubscription.merchant && claimedSubscription.subscriber) {
      try {
        await invoiceRegistry.createInvoice({
          merchant: claimedSubscription.merchant,
          recipient: claimedSubscription.subscriber,
          paymentId: payment.paymentId,
          gatewayUrl: payment.gatewayUrl,
          description: `${claimedSubscription.description || 'Subscription'} (${claimedSubscription.frequency})`,
          amountUSD: claimedSubscription.amountUSD,
          dueDate: null,
        });
      } catch (chainErr) {
        // Non-critical — payment link still works, just won't appear in Bills tab automatically
        console.error(`[subscriptions] on-chain invoice write failed for ${claimedSubscription.subscriptionId}: ${chainErr.message}`);
      }
    }

    console.log(
      `[subscriptions] executed ${updatedSubscription.subscriptionId} -> ${payment.paymentId} (${updatedSubscription.status})`,
    );
  } catch (error) {
    await subscriptionStore.recordExecutionFailure({
      subscription: claimedSubscription,
      errorMessage: error.message,
    });

    console.error(`[subscriptions] execution failed for ${claimedSubscription.subscriptionId}: ${error.message}`);
  }
}

function startSubscriptionExecutionLoop(subscriptionStore, invoiceRegistry = null) {
  if (!subscriptionStore) {
    return null;
  }

  if (process.env.SUBSCRIPTION_EXECUTOR_ENABLED === 'false') {
    console.log('[subscriptions] executor disabled via SUBSCRIPTION_EXECUTOR_ENABLED=false');
    return null;
  }

  if (!isNonEmptyString(process.env.WALLETCONNECT_MERCHANT_ID) || !isNonEmptyString(process.env.WALLETCONNECT_CUSTOMER_API_KEY) || !isNonEmptyString(process.env.WALLETCONNECT_API_URL)) {
    console.log('[subscriptions] executor disabled because WalletConnect merchant credentials are missing');
    return null;
  }

  const intervalMs = Number.parseInt(process.env.SUBSCRIPTION_EXECUTOR_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`, 10);
  let isRunning = false;

  async function runOnce() {
    if (isRunning) {
      return;
    }

    isRunning = true;
    try {
      const dueSubscriptions = await subscriptionStore.getDueSubscriptions(20);
      for (const subscription of dueSubscriptions) {
        await processDueSubscription(subscriptionStore, subscription, invoiceRegistry);
      }
    } catch (error) {
      console.error(`[subscriptions] scheduler error: ${error.message}`);
    } finally {
      isRunning = false;
    }
  }

  const timer = setInterval(() => {
    void runOnce();
  }, Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS);

  void runOnce();

  return () => clearInterval(timer);
}

module.exports = { startSubscriptionExecutionLoop };
