// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract InvoiceRegistry {
    enum Status { Pending, Paid, Expired, Cancelled }

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

    address public owner;
    uint256 public invoiceCount;

    mapping(uint256 => Invoice) private _invoices;
    mapping(address => uint256[]) private _byMerchant;
    mapping(address => uint256[]) private _byRecipient;
    mapping(string => uint256) private _paymentIdToId;
    mapping(string => bool) private _paymentIdExists;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed merchant,
        address indexed recipient,
        uint256 amountCents
    );
    event InvoiceStatusUpdated(uint256 indexed id, Status status);

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
}
