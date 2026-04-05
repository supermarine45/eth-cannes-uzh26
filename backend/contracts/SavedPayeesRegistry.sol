// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SavedPayeesRegistry {
    struct Payee {
        address owner;
        string ensName;
        uint256 summaryAverage;
        uint256 summaryCount;
        uint64 savedAt;
    }

    address public owner;

    // Mapping: user address => payee address => Payee
    mapping(address => mapping(address => Payee)) private savedPayees;
    
    // Mapping: user address => array of saved payee addresses
    mapping(address => address[]) private payeeAddresses;
    
    // Mapping: user address => payee address => index in payeeAddresses array (1-indexed, 0 means not exists)
    mapping(address => mapping(address => uint256)) private payeeIndex;

    event PayeeAdded(address indexed user, address indexed payeeAddress, string ensName, uint256 summaryAverage, uint256 summaryCount);
    event PayeeRemoved(address indexed user, address indexed payeeAddress);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

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

    function addPayee(
        address payeeAddress,
        string calldata ensName,
        uint256 summaryAverage,
        uint256 summaryCount
    ) external {
        _addPayee(msg.sender, payeeAddress, ensName, summaryAverage, summaryCount);
    }

    function addPayeeFor(
        address userAddress,
        address payeeAddress,
        string calldata ensName,
        uint256 summaryAverage,
        uint256 summaryCount
    ) external onlyOwner {
        _addPayee(userAddress, payeeAddress, ensName, summaryAverage, summaryCount);
    }

    function removePayee(address payeeAddress) external {
        _removePayee(msg.sender, payeeAddress);
    }

    function removePayeeFor(address userAddress, address payeeAddress) external onlyOwner {
        _removePayee(userAddress, payeeAddress);
    }

    function getPayee(address userAddress, address payeeAddress) external view returns (Payee memory) {
        require(payeeIndex[userAddress][payeeAddress] > 0, "Payee not found");
        return savedPayees[userAddress][payeeAddress];
    }

    function getPayeesCount(address userAddress) external view returns (uint256) {
        return payeeAddresses[userAddress].length;
    }

    function getPayeeAt(address userAddress, uint256 index) external view returns (Payee memory, address) {
        require(index < payeeAddresses[userAddress].length, "Index out of bounds");
        address payeeAddr = payeeAddresses[userAddress][index];
        return (savedPayees[userAddress][payeeAddr], payeeAddr);
    }

    function getPayees(address userAddress) external view returns (Payee[] memory, address[] memory) {
        address[] memory addresses = payeeAddresses[userAddress];
        Payee[] memory payees = new Payee[](addresses.length);
        
        for (uint256 i = 0; i < addresses.length; i++) {
            payees[i] = savedPayees[userAddress][addresses[i]];
        }
        
        return (payees, addresses);
    }

    function hasPayee(address userAddress, address payeeAddress) external view returns (bool) {
        return payeeIndex[userAddress][payeeAddress] > 0;
    }

    function _addPayee(
        address userAddress,
        address payeeAddress,
        string calldata ensName,
        uint256 summaryAverage,
        uint256 summaryCount
    ) internal {
        require(userAddress != address(0), "User is zero address");
        require(payeeAddress != address(0), "Payee is zero address");
        require(payeeIndex[userAddress][payeeAddress] == 0, "Payee already saved");

        // Add to array
        payeeAddresses[userAddress].push(payeeAddress);
        payeeIndex[userAddress][payeeAddress] = payeeAddresses[userAddress].length;

        // Store payee data
        savedPayees[userAddress][payeeAddress] = Payee({
            owner: payeeAddress,
            ensName: ensName,
            summaryAverage: summaryAverage,
            summaryCount: summaryCount,
            savedAt: uint64(block.timestamp)
        });

        emit PayeeAdded(userAddress, payeeAddress, ensName, summaryAverage, summaryCount);
    }

    function _removePayee(address userAddress, address payeeAddress) internal {
        require(userAddress != address(0), "User is zero address");
        require(payeeAddress != address(0), "Payee is zero address");

        uint256 index = payeeIndex[userAddress][payeeAddress];
        require(index > 0, "Payee not found");

        // Remove from index mapping
        payeeIndex[userAddress][payeeAddress] = 0;

        // Remove from array by swapping with last element
        uint256 arrayIndex = index - 1;
        uint256 lastArrayIndex = payeeAddresses[userAddress].length - 1;

        if (arrayIndex != lastArrayIndex) {
            address lastPayeeAddress = payeeAddresses[userAddress][lastArrayIndex];
            payeeAddresses[userAddress][arrayIndex] = lastPayeeAddress;
            payeeIndex[userAddress][lastPayeeAddress] = index;
        }

        payeeAddresses[userAddress].pop();

        // Clean up payee data
        delete savedPayees[userAddress][payeeAddress];

        emit PayeeRemoved(userAddress, payeeAddress);
    }
}
