// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract InvoiceRegistry {
    enum Status { Pending, Paid, Expired, Cancelled }

    enum SubscriptionStatus { Active, Paused }

    struct Invoice {
        uint256 id;
        address merchant;
        address recipient;
        string paymentId;
        string gatewayUrl;
        string description;
        uint256 amountCents;
        uint64 createdAt;
        uint64 dueDate;
        Status status;
    }

    struct Subscription {
        uint256 id;
        address merchant;
        address subscriber;
        string subscriptionId;
        uint256 amountWei;
        string currency;
        string frequency;
        uint64 createdAt;
        uint64 startDate;
        uint64 endDate;
        SubscriptionStatus status;
        bytes32 metadataHash;
    }

    address public owner;
    uint256 public invoiceCount;
    uint256 public subscriptionCount;

    mapping(uint256 => Invoice) private _invoices;
    mapping(address => uint256[]) private _byMerchant;
    mapping(address => uint256[]) private _byRecipient;
    mapping(string => uint256) private _paymentIdToId;
    mapping(string => bool) private _paymentIdExists;
    mapping(uint256 => Subscription) private _subscriptions;
    mapping(address => uint256[]) private _subscriptionsByMerchant;
    mapping(address => uint256[]) private _subscriptionsBySubscriber;
    mapping(string => uint256) private _subscriptionIdToId;
    mapping(string => bool) private _subscriptionIdExists;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed merchant,
        address indexed recipient,
        uint256 amountCents
    );
    event InvoiceStatusUpdated(uint256 indexed id, Status status);
    event SubscriptionCreated(
        uint256 indexed id,
        address indexed merchant,
        address indexed subscriber,
        uint256 amountWei,
        string frequency
    );
    event SubscriptionStatusUpdated(uint256 indexed id, SubscriptionStatus status);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Owner is zero address");
        owner = initialOwner;
    }

    function createInvoice(
        address merchant,
        address recipient,
        string calldata paymentId,
        string calldata gatewayUrl,
        string calldata description,
        uint256 amountCents,
        uint64 dueDate
    ) external onlyOwner returns (uint256) {
        require(merchant != address(0), "merchant is zero address");
        require(recipient != address(0), "recipient is zero address");
        require(bytes(paymentId).length > 0, "paymentId required");
        require(amountCents > 0, "amountCents must be > 0");
        require(!_paymentIdExists[paymentId], "paymentId already exists");

        uint256 id = invoiceCount;
        invoiceCount++;

        _invoices[id] = Invoice({
            id: id,
            merchant: merchant,
            recipient: recipient,
            paymentId: paymentId,
            gatewayUrl: gatewayUrl,
            description: description,
            amountCents: amountCents,
            createdAt: uint64(block.timestamp),
            dueDate: dueDate,
            status: Status.Pending
        });

        _byMerchant[merchant].push(id);
        _byRecipient[recipient].push(id);
        _paymentIdToId[paymentId] = id;
        _paymentIdExists[paymentId] = true;

        emit InvoiceCreated(id, merchant, recipient, amountCents);
        return id;
    }

    function updateStatus(string calldata paymentId, Status newStatus) external onlyOwner {
        require(_paymentIdExists[paymentId], "invoice not found");
        uint256 id = _paymentIdToId[paymentId];
        _invoices[id].status = newStatus;
        emit InvoiceStatusUpdated(id, newStatus);
    }

    function getInvoicesByMerchant(address merchant) external view returns (Invoice[] memory) {
        uint256[] storage ids = _byMerchant[merchant];
        Invoice[] memory result = new Invoice[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _invoices[ids[i]];
        }
        return result;
    }

    function getInvoicesByRecipient(address recipient) external view returns (Invoice[] memory) {
        uint256[] storage ids = _byRecipient[recipient];
        Invoice[] memory result = new Invoice[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _invoices[ids[i]];
        }
        return result;
    }

    function getInvoiceByPaymentId(string calldata paymentId) external view returns (Invoice memory) {
        require(_paymentIdExists[paymentId], "invoice not found");
        return _invoices[_paymentIdToId[paymentId]];
    }

    function createSubscription(
        address merchant,
        address subscriber,
        string calldata subscriptionId,
        uint256 amountWei,
        string calldata currency,
        string calldata frequency,
        uint64 startDate,
        uint64 endDate,
        bytes32 metadataHash
    ) external onlyOwner returns (uint256) {
        require(merchant != address(0), "merchant is zero address");
        require(subscriber != address(0), "subscriber is zero address");
        require(bytes(subscriptionId).length > 0, "subscriptionId required");
        require(amountWei > 0, "amountWei must be > 0");
        require(_isValidFrequency(frequency), "invalid frequency");
        require(startDate > 0, "startDate must be > 0");
        require(endDate == 0 || endDate >= startDate, "endDate must be >= startDate");
        require(!_subscriptionIdExists[subscriptionId], "subscriptionId already exists");

        uint256 id = subscriptionCount;
        subscriptionCount++;

        _subscriptions[id] = Subscription({
            id: id,
            merchant: merchant,
            subscriber: subscriber,
            subscriptionId: subscriptionId,
            amountWei: amountWei,
            currency: currency,
            frequency: frequency,
            createdAt: uint64(block.timestamp),
            startDate: startDate,
            endDate: endDate,
            status: SubscriptionStatus.Active,
            metadataHash: metadataHash
        });

        _subscriptionsByMerchant[merchant].push(id);
        _subscriptionsBySubscriber[subscriber].push(id);
        _subscriptionIdToId[subscriptionId] = id;
        _subscriptionIdExists[subscriptionId] = true;

        emit SubscriptionCreated(id, merchant, subscriber, amountWei, frequency);
        return id;
    }

    function updateSubscriptionStatus(string calldata subscriptionId, bool isActive) external onlyOwner {
        require(_subscriptionIdExists[subscriptionId], "subscription not found");
        uint256 id = _subscriptionIdToId[subscriptionId];
        _subscriptions[id].status = isActive ? SubscriptionStatus.Active : SubscriptionStatus.Paused;
        emit SubscriptionStatusUpdated(id, _subscriptions[id].status);
    }

    function getSubscription(string calldata subscriptionId) external view returns (Subscription memory) {
        require(_subscriptionIdExists[subscriptionId], "subscription not found");
        return _subscriptions[_subscriptionIdToId[subscriptionId]];
    }

    function subscriptionExists(string calldata subscriptionId) external view returns (bool) {
        return _subscriptionIdExists[subscriptionId];
    }

    function getSubscriptionsByMerchant(address merchant) external view returns (Subscription[] memory) {
        uint256[] storage ids = _subscriptionsByMerchant[merchant];
        Subscription[] memory result = new Subscription[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _subscriptions[ids[i]];
        }
        return result;
    }

    function getSubscriptionsBySubscriber(address subscriber) external view returns (Subscription[] memory) {
        uint256[] storage ids = _subscriptionsBySubscriber[subscriber];
        Subscription[] memory result = new Subscription[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _subscriptions[ids[i]];
        }
        return result;
    }

    function _isValidFrequency(string calldata frequency) private pure returns (bool) {
        bytes32 value = keccak256(bytes(frequency));
        return (
            value == keccak256(bytes("daily")) ||
            value == keccak256(bytes("weekly")) ||
            value == keccak256(bytes("monthly")) ||
            value == keccak256(bytes("quarterly")) ||
            value == keccak256(bytes("yearly"))
        );
    }
}
