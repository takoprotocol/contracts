// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

library DataTypes {
    struct EIP712Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint256 deadline;
    }

    enum AuditState {
        Pending,
        Refuse,
        Pass,
        Cancel
    }

    struct MerkleVerifyData {
        uint256 index;
        bytes32[] merkleProof;
    }
}
