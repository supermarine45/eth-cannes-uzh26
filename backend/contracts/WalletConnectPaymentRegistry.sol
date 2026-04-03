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

    address public owner;
    mapping(bytes32 => Payment) private payments;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event PaymentRecorded(
        string indexed paymentId,
        address indexed payer,
        address indexed payee,
        uint256 amountWei,
        string currency,
        bytes32 metadataHash
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

    function _paymentKey(string memory paymentId) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(paymentId));
    }
}
