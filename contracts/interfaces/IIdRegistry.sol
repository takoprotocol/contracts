// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IIdRegistry {
    /**
     * @notice Maps each address to an fid, or zero if it does not own an fid.
     */
    function idOf(address owner) external view returns (uint256 fid);
}
