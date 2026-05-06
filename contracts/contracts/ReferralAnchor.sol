// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract ReferralAnchor is Ownable {
    event ReferralAnchored(bytes32 indexed tenantHash, bytes32 indexed merkleRoot, uint256 anchoredAt);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function anchorBatch(bytes32 tenantHash, bytes32 merkleRoot) external onlyOwner {
        require(tenantHash != bytes32(0), "invalid tenantHash");
        require(merkleRoot != bytes32(0), "invalid merkleRoot");
        emit ReferralAnchored(tenantHash, merkleRoot, block.timestamp);
    }
}
