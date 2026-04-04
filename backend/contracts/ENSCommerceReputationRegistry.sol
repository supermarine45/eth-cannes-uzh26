// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ENSCommerceReputationRegistry {
    struct Profile {
        address owner;
        string ensName;
        bytes32 ensNode;
        string profileURI;
        uint64 registeredAt;
        bool active;
    }

    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        bool isRevoked;
    }

    struct ProfileView {
        address owner;
        string ensName;
        bytes32 ensNode;
        string profileURI;
        uint64 registeredAt;
        bool active;
        uint64 reviewerCount;
    }

    struct Summary {
        uint64 count;
        int256 totalScaled18;
    }

    address public owner;

    mapping(address => Profile) private profiles;
    mapping(bytes32 => address) private ensNodeOwners;

    address[] private profileOwners;
    mapping(address => bool) private hasProfileOwner;

    mapping(address => address[]) private knownReviewers;
    mapping(address => mapping(address => bool)) private isKnownReviewer;
    mapping(address => mapping(address => uint64)) private lastFeedbackIndex;
    mapping(address => mapping(address => mapping(uint64 => Feedback))) private feedback;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event ProfileRegistered(address indexed ownerAddress, string ensName, bytes32 indexed ensNode, string profileURI);
    event ProfileUpdated(address indexed ownerAddress, string ensName, bytes32 indexed ensNode, string profileURI, bool active);
    event NewFeedback(
        address indexed targetAddress,
        address indexed reviewerAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );
    event FeedbackRevoked(address indexed targetAddress, address indexed reviewerAddress, uint64 indexed feedbackIndex);
    event ResponseAppended(
        address indexed targetAddress,
        address indexed reviewerAddress,
        uint64 indexed feedbackIndex,
        address responder,
        string responseURI,
        bytes32 responseHash
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

    function registerProfile(string calldata ensName, bytes32 ensNode, string calldata profileURI) external {
        _registerProfile(msg.sender, ensName, ensNode, profileURI);
    }

    function registerProfileFor(address ownerAddress, string calldata ensName, bytes32 ensNode, string calldata profileURI) external onlyOwner {
        _registerProfile(ownerAddress, ensName, ensNode, profileURI);
    }

    function updateProfile(string calldata ensName, bytes32 ensNode, string calldata profileURI, bool active) external {
        _updateProfile(msg.sender, ensName, ensNode, profileURI, active);
    }

    function updateProfileFor(address ownerAddress, string calldata ensName, bytes32 ensNode, string calldata profileURI, bool active) external onlyOwner {
        _updateProfile(ownerAddress, ensName, ensNode, profileURI, active);
    }

    function giveFeedback(
        address targetAddress,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        _giveFeedback(msg.sender, targetAddress, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function giveFeedbackFor(
        address reviewerAddress,
        address targetAddress,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external onlyOwner {
        _giveFeedback(reviewerAddress, targetAddress, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function revokeFeedback(address targetAddress, uint64 feedbackIndex) external {
        _revokeFeedback(msg.sender, targetAddress, feedbackIndex);
    }

    function revokeFeedbackFor(address reviewerAddress, address targetAddress, uint64 feedbackIndex) external onlyOwner {
        _revokeFeedback(reviewerAddress, targetAddress, feedbackIndex);
    }

    function appendResponse(address targetAddress, address reviewerAddress, uint64 feedbackIndex, string calldata responseURI, bytes32 responseHash) external {
        require(feedbackIndex > 0, "feedbackIndex required");
        require(feedbackIndex <= lastFeedbackIndex[targetAddress][reviewerAddress], "feedback not found");

        emit ResponseAppended(targetAddress, reviewerAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function getProfile(address ownerAddress) external view returns (Profile memory) {
        require(profiles[ownerAddress].owner != address(0), "profile not found");
        return profiles[ownerAddress];
    }

    function resolveEnsNode(bytes32 ensNode) external view returns (address) {
        return ensNodeOwners[ensNode];
    }

    function getProfileCount() external view returns (uint256) {
        return profileOwners.length;
    }

    function getProfileOwners(uint256 offset, uint256 limit) external view returns (address[] memory) {
        if (offset >= profileOwners.length || limit == 0) {
            return new address[](0);
        }

        uint256 remaining = profileOwners.length - offset;
        uint256 size = limit < remaining ? limit : remaining;
        address[] memory result = new address[](size);

        for (uint256 i = 0; i < size; i++) {
            result[i] = profileOwners[offset + i];
        }

        return result;
    }

    function getKnownReviewers(address targetAddress) external view returns (address[] memory) {
        return knownReviewers[targetAddress];
    }

    function getLastIndex(address targetAddress, address reviewerAddress) external view returns (uint64) {
        return lastFeedbackIndex[targetAddress][reviewerAddress];
    }

    function readFeedback(address targetAddress, address reviewerAddress, uint64 feedbackIndex) external view returns (Feedback memory) {
        require(feedbackIndex > 0, "feedbackIndex required");
        require(feedbackIndex <= lastFeedbackIndex[targetAddress][reviewerAddress], "feedback not found");
        Feedback memory entry = feedback[targetAddress][reviewerAddress][feedbackIndex];
        return entry;
    }

    function getSummary(address targetAddress, address[] calldata reviewerAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        require(reviewerAddresses.length > 0, "reviewerAddresses required");

        int256 totalScaled18 = 0;
        uint64 totalCount = 0;

        for (uint256 r = 0; r < reviewerAddresses.length; r++) {
            address reviewer = reviewerAddresses[r];
            uint64 maxIndex = lastFeedbackIndex[targetAddress][reviewer];

            for (uint64 i = 1; i <= maxIndex; i++) {
                Feedback memory entry = feedback[targetAddress][reviewer][i];
                if (entry.valueDecimals > 18 || entry.isRevoked) {
                    continue;
                }

                if (!_matchesTag(entry.tag1, tag1) || !_matchesTag(entry.tag2, tag2)) {
                    continue;
                }

                int256 scaled = int256(entry.value) * int256(10 ** (18 - entry.valueDecimals));
                totalScaled18 += scaled;
                totalCount += 1;
            }
        }

        require(totalScaled18 >= type(int128).min && totalScaled18 <= type(int128).max, "summary overflow");
        return (totalCount, int128(totalScaled18), 18);
    }

    function _registerProfile(address ownerAddress, string calldata ensName, bytes32 ensNode, string calldata profileURI) internal {
        require(ownerAddress != address(0), "owner is zero address");
        require(bytes(ensName).length > 0, "ensName required");
        require(ensNode != bytes32(0), "ensNode required");

        address ensOwner = ensNodeOwners[ensNode];
        require(ensOwner == address(0) || ensOwner == ownerAddress, "ensNode already linked");

        Profile storage existing = profiles[ownerAddress];
        if (existing.owner != address(0) && existing.ensNode != ensNode) {
            ensNodeOwners[existing.ensNode] = address(0);
        }

        profiles[ownerAddress] = Profile({
            owner: ownerAddress,
            ensName: ensName,
            ensNode: ensNode,
            profileURI: profileURI,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        ensNodeOwners[ensNode] = ownerAddress;

        if (!hasProfileOwner[ownerAddress]) {
            hasProfileOwner[ownerAddress] = true;
            profileOwners.push(ownerAddress);
        }

        emit ProfileRegistered(ownerAddress, ensName, ensNode, profileURI);
    }

    function _updateProfile(address ownerAddress, string calldata ensName, bytes32 ensNode, string calldata profileURI, bool active) internal {
        require(ownerAddress != address(0), "owner is zero address");
        require(bytes(ensName).length > 0, "ensName required");
        require(ensNode != bytes32(0), "ensNode required");

        Profile storage entry = profiles[ownerAddress];
        require(entry.owner != address(0), "profile not found");

        address ensOwner = ensNodeOwners[ensNode];
        require(ensOwner == address(0) || ensOwner == ownerAddress, "ensNode already linked");

        if (entry.ensNode != ensNode) {
            ensNodeOwners[entry.ensNode] = address(0);
        }

        entry.ensName = ensName;
        entry.ensNode = ensNode;
        entry.profileURI = profileURI;
        entry.active = active;
        ensNodeOwners[ensNode] = ownerAddress;

        emit ProfileUpdated(ownerAddress, ensName, ensNode, profileURI, active);
    }

    function _giveFeedback(
        address reviewerAddress,
        address targetAddress,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) internal {
        require(reviewerAddress != address(0), "reviewer is zero address");
        require(targetAddress != address(0), "target is zero address");
        require(reviewerAddress != targetAddress, "self feedback forbidden");
        require(valueDecimals <= 18, "valueDecimals out of range");
        require(profiles[targetAddress].owner != address(0), "target profile not found");

        uint64 nextIndex = lastFeedbackIndex[targetAddress][reviewerAddress] + 1;
        lastFeedbackIndex[targetAddress][reviewerAddress] = nextIndex;

        feedback[targetAddress][reviewerAddress][nextIndex] = Feedback({
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            isRevoked: false
        });

        if (!isKnownReviewer[targetAddress][reviewerAddress]) {
            isKnownReviewer[targetAddress][reviewerAddress] = true;
            knownReviewers[targetAddress].push(reviewerAddress);
        }

        emit NewFeedback(targetAddress, reviewerAddress, nextIndex, value, valueDecimals, tag1, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    function _revokeFeedback(address reviewerAddress, address targetAddress, uint64 feedbackIndex) internal {
        require(feedbackIndex > 0, "feedbackIndex required");
        require(feedbackIndex <= lastFeedbackIndex[targetAddress][reviewerAddress], "feedback not found");

        Feedback storage entry = feedback[targetAddress][reviewerAddress][feedbackIndex];
        require(!entry.isRevoked, "feedback already revoked");

        entry.isRevoked = true;
        emit FeedbackRevoked(targetAddress, reviewerAddress, feedbackIndex);
    }

    function _matchesTag(string memory item, string memory filterValue) internal pure returns (bool) {
        if (bytes(filterValue).length == 0) {
            return true;
        }
        return keccak256(bytes(item)) == keccak256(bytes(filterValue));
    }
}
