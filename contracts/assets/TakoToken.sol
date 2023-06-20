// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

import "../access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TakoToken is Context, ERC20, Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    mapping(address => bool) private _authorizedMintCaller;

    modifier onlyAuthorizedMintCaller() {
        require(
            _msgSender() == owner() || _authorizedMintCaller[_msgSender()],
            "TK: MINT_CALLER_NOT_AUTHORIZED"
        );
        _;
    }

    constructor() ERC20("Tako", "TK") {}

    function mint(
        address to,
        uint256 amount
    ) external onlyAuthorizedMintCaller {
        _mint(to, amount);
        require(totalSupply() <= 10 ** 26, "TK: TOTAL_SUPPLY_EXCEEDED");
    }

    function setAuthorizedMintCaller(address caller) external onlyOwner {
        _authorizedMintCaller[caller] = true;
    }

    function removeAuthorizedMintCaller(address caller) external onlyOwner {
        _authorizedMintCaller[caller] = false;
    }
}
