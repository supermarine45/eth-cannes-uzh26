// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract WalletConnectPaymentRegistry {
    struct Payment {
        string paymentId;
        address payer;
        address payee;
        uint256 amountWei;
        string currency;
        uint64 createdAt;
        bytes32 metadataHash;
        bool exists;
    }

    struct Subscription {
        string subscriptionId;
        address merchant;
        address subscriber;
        uint256 amountWei;
        string currency;
        string frequency; // "daily", "weekly", "monthly", "quarterly", "yearly"
        uint64 startDate;
        uint64 endDate; // 0 if no end date
        bool isActive;
        uint64 createdAt;
        bytes32 metadataHash;
        bool exists;
    }

    address public owner;
    mapping(bytes32 => Payment) private payments;
    mapping(bytes32 => Subscription) private subscriptions;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event PaymentRecorded(
        string indexed paymentId,
        address indexed payer,
        address indexed payee,
        uint256 amountWei,
        string currency,
        bytes32 metadataHash
    );
    event SubscriptionRecorded(
        string indexed subscriptionId,
        address indexed merchant,
        address indexed subscriber,
        uint256 amountWei,
        string currency,
        string frequency,
        uint64 startDate,
        uint64 endDate,
        bytes32 metadataHash
    );
    event SubscriptionUpdated(
        string indexed subscriptionId,
        bool isActive,
        uint64 updatedAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Owner is zero address");
        owner = initialOwner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Owner is zero address");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerTransferred(previousOwner, newOwner);
    }

    function recordPayment(
        string calldata paymentId,
        address payer,
        address payee,
        uint256 amountWei,
        string calldata currency,
        bytes32 metadataHash
    ) external onlyOwner {
        require(bytes(paymentId).length > 0, "paymentId required");
        require(payer != address(0), "payer is zero address");
        require(payee != address(0), "payee is zero address");
        require(amountWei > 0, "amountWei must be > 0");

        bytes32 key = _paymentKey(paymentId);
        require(!payments[key].exists, "payment already exists");

        payments[key] = Payment({
            paymentId: paymentId,
            payer: payer,
            payee: payee,
            amountWei: amountWei,
            currency: currency,
            createdAt: uint64(block.timestamp),
            metadataHash: metadataHash,
            exists: true
        });

        emit PaymentRecorded(paymentId, payer, payee, amountWei, currency, metadataHash);
    }

    function getPayment(string calldata paymentId) external view returns (Payment memory) {
        bytes32 key = _paymentKey(paymentId);
        require(payments[key].exists, "payment not found");
        return payments[key];
    }

    function paymentExists(string calldata paymentId) external view returns (bool) {
        return payments[_paymentKey(paymentId)].exists;
    }

    function recordSubscription(
        string calldata subscriptionId,
        address merchant,
        address subscriber,
        uint256 amountWei,
        string calldata currency,
        string calldata frequency,
        uint64 startDate,
        uint64 endDate,
        bytes32 metadataHash
    ) external onlyOwner {
        require(bytes(subscriptionId).length > 0, "subscriptionId required");
        require(merchant != address(0), "merchant is zero address");
        require(subscriber != address(0), "subscriber is zero address");
        require(amountWei > 0, "amountWei must be > 0");
        require(bytes(frequency).length > 0, "frequency required");
        require(startDate > 0, "startDate must be > 0");

        bytes32 key = _subscriptionKey(subscriptionId);
        require(!subscriptions[key].exists, "subscription already exists");

        subscriptions[key] = Subscription({
            subscriptionId: subscriptionId,
            merchant: merchant,
            subscriber: subscriber,
            amountWei: amountWei,
            currency: currency,
            frequency: frequency,
            startDate: startDate,
            endDate: endDate,
            isActive: true,
            createdAt: uint64(block.timestamp),
            metadataHash: metadataHash,
            exists: true
        });

        emit SubscriptionRecorded(subscriptionId, merchant, subscriber, amountWei, currency, frequency, startDate, endDate, metadataHash);
    }

    function getSubscription(string calldata subscriptionId) external view returns (Subscription memory) {
        bytes32 key = _subscriptionKey(subscriptionId);
        require(subscriptions[key].exists, "subscription not found");
        return subscriptions[key];
    }

    function subscriptionExists(string calldata subscriptionId) external view returns (bool) {
        return subscriptions[_subscriptionKey(subscriptionId)].exists;
    }

    function updateSubscriptionStatus(string calldata subscriptionId, bool isActive) external onlyOwner {
        bytes32 key = _subscriptionKey(subscriptionId);
        require(subscriptions[key].exists, "subscription not found");
        subscriptions[key].isActive = isActive;
        emit SubscriptionUpdated(subscriptionId, isActive, uint64(block.timestamp));
    }

    function _subscriptionKey(string memory subscriptionId) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("sub:", subscriptionId));
    }

    function _paymentKey(string memory paymentId) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(paymentId));
    }
}
