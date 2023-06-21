// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

library Errors {
    error SignatureExpired();
    error BidTokenNotWhitelisted();
    error NotWhitelisted();

    error Expired();
    error WrongAmount();
    error ParamsrInvalid();

    error ToProfileLimitExceeded();
    error NotReachedMinimum();
    error InsufficientBalance();
    error InsufficientInputAmount();
    error ETHTransferFailed();
    error SignatureInvalid();

    error NotAuditor();
    error NotProfileOwner();
    error NotBidder();
    error BidIsClose();

    error Paused();
}
