const { ethers } = require("ethers");

const FREQUENCY_OPTIONS = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const SUBSCRIPTION_STATUSES = ["scheduled", "processing", "active", "paused", "completed", "failed", "cancelled"];

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function buildSupabaseBaseUrl() {
  return trimTrailingSlash(getRequiredEnv("SUPABASE_URL"));
}

function buildRestUrl(path) {
  return `${buildSupabaseBaseUrl()}/rest/v1/${path.replace(/^\//, "")}`;
}

async function supabaseRestRequest(path, { method = "GET", body } = {}) {
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Prefer = "return=representation";
  }

  const response = await fetch(buildRestUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.details || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function normalizeAddress(value) {
  return ethers.getAddress(String(value || "").trim());
}

function parseSubscriptionDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Subscription dates must be YYYY-MM-DD strings");
  }

  const parsed = new Date(`${value.trim()}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid subscription date: ${value}`);
  }

  return parsed;
}

function computeNextExecutionAt(anchorDate, frequency) {
  const next = new Date(anchorDate.getTime());

  switch (frequency) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case "yearly":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    default:
      throw new Error(`Invalid frequency. Must be one of: ${FREQUENCY_OPTIONS.join(", ")}`);
  }

  return next;
}

function formatSubscription(row) {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    merchant: row.merchant_wallet,
    subscriber: row.subscriber_wallet,
    description: row.description,
    amountUSD: Number(row.amount_usd),
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    nextExecutionAt: row.next_execution_at,
    lastExecutedAt: row.last_executed_at,
    lastPaymentId: row.last_payment_id,
    lastGatewayUrl: row.last_gateway_url,
    executionAttempts: Number(row.execution_attempts || 0),
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createSubscriptionRegistry() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  async function insertExecutionRow({ subscriptionId, runNumber, scheduledFor, status = "pending", paymentId = null, gatewayUrl = null, error = null }) {
    await supabaseRestRequest("merchant_subscription_executions", {
      method: "POST",
      body: {
        subscription_id: subscriptionId,
        run_number: runNumber,
        scheduled_for: scheduledFor,
        status,
        payment_id: paymentId,
        gateway_url: gatewayUrl,
        error,
      },
    });
  }

  async function updateExecutionRow({ subscriptionId, runNumber, status, paymentId = null, gatewayUrl = null, error = null, executedAt = null }) {
    await supabaseRestRequest(
      `merchant_subscription_executions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&run_number=eq.${runNumber}`,
      {
        method: "PATCH",
        body: {
          status,
          payment_id: paymentId,
          gateway_url: gatewayUrl,
          error,
          executed_at: executedAt,
        },
      },
    );
  }

  async function updateSubscriptionRow(subscriptionId, patch) {
    const rows = await supabaseRestRequest(`merchant_subscriptions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*`, {
      method: "PATCH",
      body: patch,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    return formatSubscription(rows[0]);
  }

  return {
    async createSubscription({ merchant, subscriber, subscriptionId, description, amountUSD, frequency, startDate, endDate }) {
      if (!FREQUENCY_OPTIONS.includes(frequency)) {
        throw new Error(`Invalid frequency. Must be one of: ${FREQUENCY_OPTIONS.join(", ")}`);
      }

      if (typeof subscriptionId !== "string" || subscriptionId.trim() === "") {
        throw new Error("subscriptionId is required");
      }

      const numericAmount = Number(amountUSD);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("amountUSD must be a positive number");
      }

      const merchantWallet = normalizeAddress(merchant);
      const subscriberWallet = normalizeAddress(subscriber);
      const startDateValue = parseSubscriptionDate(startDate);
      const endDateValue = endDate ? parseSubscriptionDate(endDate) : null;

      if (endDateValue && endDateValue.getTime() < startDateValue.getTime()) {
        throw new Error("endDate must be on or after startDate");
      }

      const rows = await supabaseRestRequest("merchant_subscriptions", {
        method: "POST",
        body: {
          subscription_id: subscriptionId,
          merchant_wallet: merchantWallet,
          subscriber_wallet: subscriberWallet,
          description: description || "",
          amount_usd: numericAmount.toFixed(2),
          frequency,
          start_date: startDateValue.toISOString().slice(0, 10),
          end_date: endDateValue ? endDateValue.toISOString().slice(0, 10) : null,
          next_execution_at: startDateValue.toISOString(),
          status: "scheduled",
        },
      });

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) {
        throw new Error("Failed to create subscription record");
      }

      await insertExecutionRow({
        subscriptionId: row.id,
        runNumber: 1,
        scheduledFor: row.next_execution_at,
        status: "pending",
      });

      return formatSubscription(row);
    },

    async getSubscription(subscriptionId) {
      const rows = await supabaseRestRequest(`merchant_subscriptions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*`);
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return formatSubscription(rows[0]);
    },

    async getByMerchant(merchantAddress) {
      const rows = await supabaseRestRequest(
        `merchant_subscriptions?merchant_wallet=eq.${encodeURIComponent(normalizeAddress(merchantAddress))}&order=created_at.desc&select=*`,
      );
      return Array.isArray(rows) ? rows.map(formatSubscription) : [];
    },

    async getBySubscriber(subscriberAddress) {
      const rows = await supabaseRestRequest(
        `merchant_subscriptions?subscriber_wallet=eq.${encodeURIComponent(normalizeAddress(subscriberAddress))}&order=created_at.desc&select=*`,
      );
      return Array.isArray(rows) ? rows.map(formatSubscription) : [];
    },

    async updateSubscriptionStatus(subscriptionId, isActive) {
      return updateSubscriptionRow(subscriptionId, {
        status: isActive ? "active" : "paused",
      });
    },

    async subscriptionExists(subscriptionId) {
      const rows = await supabaseRestRequest(`merchant_subscriptions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=id`);
      return Array.isArray(rows) && rows.length > 0;
    },

    async getDueSubscriptions(limit = 20) {
      const nowIso = new Date().toISOString();
      const rows = await supabaseRestRequest(
        `merchant_subscriptions?status=in.(scheduled,active)&next_execution_at=lte.${encodeURIComponent(nowIso)}&order=next_execution_at.asc&limit=${limit}&select=*`,
      );
      return Array.isArray(rows) ? rows.map(formatSubscription) : [];
    },

    async markProcessing(subscriptionId) {
      const currentRows = await supabaseRestRequest(`merchant_subscriptions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*`);
      if (!Array.isArray(currentRows) || currentRows.length === 0) {
        return null;
      }

      const currentRow = currentRows[0];
      const nextExecutionAttempt = Number(currentRow.execution_attempts || 0) + 1;

      const rows = await supabaseRestRequest(`merchant_subscriptions?subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=*`, {
        method: "PATCH",
        body: {
          status: "processing",
          execution_attempts: nextExecutionAttempt,
        },
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      const row = rows[0];
      return {
        ...formatSubscription(row),
        currentRunNumber: nextExecutionAttempt,
      };
    },

    async recordExecutionSuccess({ subscription, paymentId, gatewayUrl }) {
      const currentRunNumber = subscription.currentRunNumber || subscription.executionAttempts || 1;
      const executedAt = new Date().toISOString();
      const baseSchedule = subscription.nextExecutionAt ? new Date(subscription.nextExecutionAt) : parseSubscriptionDate(subscription.startDate);
      const nextExecutionAt = computeNextExecutionAt(baseSchedule, subscription.frequency);
      const endDateLimit = subscription.endDate ? parseSubscriptionDate(subscription.endDate) : null;
      const hasMoreRuns = !endDateLimit || nextExecutionAt.getTime() <= endDateLimit.getTime();

      await updateExecutionRow({
        subscriptionId: subscription.id,
        runNumber: currentRunNumber,
        status: "executed",
        paymentId,
        gatewayUrl,
        executedAt,
      });

      const patch = {
        status: hasMoreRuns ? "active" : "completed",
        last_executed_at: executedAt,
        last_payment_id: paymentId,
        last_gateway_url: gatewayUrl,
        last_error: null,
        next_execution_at: hasMoreRuns ? nextExecutionAt.toISOString() : null,
      };

      const updated = await updateSubscriptionRow(subscription.subscriptionId, patch);

      if (hasMoreRuns) {
        await insertExecutionRow({
          subscriptionId: updated.id,
          runNumber: currentRunNumber + 1,
          scheduledFor: nextExecutionAt.toISOString(),
          status: "pending",
        });
      }

      return updated;
    },

    async recordExecutionFailure({ subscription, errorMessage }) {
      const currentRunNumber = subscription.currentRunNumber || subscription.executionAttempts || 1;
      const failedAt = new Date().toISOString();

      await updateExecutionRow({
        subscriptionId: subscription.id,
        runNumber: currentRunNumber,
        status: "failed",
        error: errorMessage,
        executedAt: failedAt,
      });

      return updateSubscriptionRow(subscription.subscriptionId, {
        status: "failed",
        last_executed_at: failedAt,
        last_error: errorMessage,
      });
    },
  };
}

module.exports = { createSubscriptionRegistry, FREQUENCY_OPTIONS, SUBSCRIPTION_STATUSES, computeNextExecutionAt };
