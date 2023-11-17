// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

import "./access/Ownable.sol";
import "./libraries/DataTypes.sol";
import "./libraries/Errors.sol";
import "./libraries/SigUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TakoOpenLensHub is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct BidData {
        string contentId;
        address bidToken;
        uint256 bidAmount;
    }

    struct Content {
        string contentId;
        address bidToken;
        address bidAddress;
        uint256 bidAmount;
        uint256 bidTime;
        uint256 curatorId;
        string curatorContentId;
        DataTypes.AuditStatus status;
    }

    string public constant name = "Tako Open Lens Hub";
    bytes32 public merkleRoot;
    bytes32 internal constant LOAN_WITH_SIG_TYPEHASH =
        keccak256(
            "LoanWithSig(uint256 index,address curator,string contentId,uint256 deadline)"
        );

    address public feeCollector;
    uint256 public feeRate = 1 * 10 ** 8;
    uint256 public constant FEE_DENOMINATOR = 10 ** 10;
    uint256 public curateDuration = 2 days;
    uint256 public rewardClaimProtectionDuration = 7 days;

    uint256 _bidCounter;
    mapping(uint256 => Content) internal _contentByIndex;
    mapping(address => bool) internal _bidTokenWhitelisted;
    mapping(address => bool) internal _relayerWhitelisted;
    mapping(address => bool) internal _governance;

    event addBidEvent(uint256 index, Content content);
    event modifiBidEvent(uint256 index, Content content);

    modifier onlyGov() {
        if (!_governance[_msgSender()]) {
            revert Errors.NotGovernance();
        }
        _;
    }

    modifier onlyWhitelisted(DataTypes.MerkleVerifyData memory verifyData) {
        if (merkleRoot != bytes32(0)) {
            address wallet = msg.sender;
            bytes32 node = keccak256(
                abi.encodePacked(verifyData.index, wallet)
            );
            if (!MerkleProof.verify(verifyData.merkleProof, merkleRoot, node))
                revert Errors.NotWhitelisted();
        }
        _;
    }

    constructor(bytes32 initMerkleRoot) {
        merkleRoot = initMerkleRoot;
        feeCollector = _msgSender();
    }

    receive() external payable {}

    // Owner
    function setFeeCollector(
        address newsFeeCollector,
        uint256 newFeeRate
    ) external onlyOwner {
        if (newsFeeCollector == address(0)) revert Errors.AddressCanNotBeZero();
        if (newFeeRate > FEE_DENOMINATOR) revert Errors.RateExceedsMaximum();
        feeRate = newFeeRate;
        feeCollector = newsFeeCollector;
    }

    function setGovernance(address gov, bool whitelist) external onlyOwner {
        _governance[gov] = whitelist;
    }

    // Gov

    function setMerkleRoot(bytes32 newMerkleRoot) external onlyGov {
        merkleRoot = newMerkleRoot;
    }

    function whitelistBidToken(address token, bool whitelist) external onlyGov {
        _bidTokenWhitelisted[token] = whitelist;
    }

    function whitelistRelayer(
        address relayer,
        bool whitelist
    ) external onlyGov {
        if (relayer == address(0)) revert Errors.AddressCanNotBeZero();
        _relayerWhitelisted[relayer] = whitelist;
    }

    function setCurateDuration(uint256 duration) external onlyGov {
        if (duration < 1 days) revert Errors.ParamsInvalid();
        curateDuration = duration;
    }

    function setRewardClaimProtectionDuration(
        uint256 duration
    ) external onlyGov {
        if (duration < 1 days) revert Errors.ParamsInvalid();
        rewardClaimProtectionDuration = duration;
    }

    // User
    function bid(
        BidData calldata vars,
        DataTypes.MerkleVerifyData calldata verifyData
    ) external payable nonReentrant onlyWhitelisted(verifyData) {
        _fetchBidToken(vars.bidToken, vars.bidAmount);
        _bid(vars);
    }

    function bidBatch(
        BidData[] calldata vars,
        DataTypes.MerkleVerifyData calldata verifyData
    ) external payable nonReentrant onlyWhitelisted(verifyData) {
        uint256 assetAmounts;
        for (uint256 i = 0; i < vars.length; i++) {
            _bid(vars[i]);
            if (vars[i].bidToken == address(0)) {
                assetAmounts += vars[i].bidAmount;
            } else {
                _fetchBidToken(vars[i].bidToken, vars[i].bidAmount);
            }
        }
        if (assetAmounts > 0) {
            _fetchBidToken(address(0), assetAmounts);
        }
    }

    function updateBid(
        uint256 index,
        uint256 amount
    ) external payable nonReentrant {
        _updateBid(index, amount);
    }

    function claimBackBid(uint256 index) external nonReentrant {
        _claimBack(index);
    }

    function claimBackBidBatch(
        uint256[] calldata indexArr
    ) external nonReentrant {
        for (uint256 i = 0; i < indexArr.length; i++) {
            _claimBack(indexArr[i]);
        }
    }

    // Curator
    function loanWithRelayer(
        uint256 index,
        uint256 curatorId,
        address to,
        string calldata contentId
    ) external nonReentrant {
       _loanWithRelayer(index, curatorId, to, contentId);
    }


    function loanBatchWithRelayer(
        uint256[] calldata index,
        uint256[] calldata curatorId,
        address[] calldata to,
        string[] calldata contentId
    ) external nonReentrant {
        if(index.length != curatorId.length || curatorId.length != to.length || to.length != contentId.length) {
          revert Errors.ParamsInvalid();
        }
        uint256 indexLength = index.length;
        for(uint256 i = 0; i < indexLength; ) {
          _loanWithRelayer(index[i], curatorId[i], to[i], contentId[i]);
          unchecked {
            i++;
          }
        }
    }

    function loanWithSig(
        uint256 index,
        uint256 curatorId,
        address relayer,
        string calldata contentId,
        DataTypes.EIP712Signature calldata sig
    ) external nonReentrant {
        _validateContentIndex(index);

        if (!_relayerWhitelisted[relayer]) {
            revert Errors.NotWhitelisted();
        }

        Content storage content = _contentByIndex[index];

        if (content.status != DataTypes.AuditStatus.Pending) {
            revert Errors.BidIsClose();
        }
        if (content.bidTime + curateDuration > block.timestamp)
            revert Errors.NotTimeToClaimYet();
        SigUtils._validateRecoveredAddress(
            SigUtils._calculateDigest(
                keccak256(
                    abi.encode(
                        LOAN_WITH_SIG_TYPEHASH,
                        index,
                        _msgSender(),
                        keccak256(bytes(contentId)),
                        sig.deadline
                    )
                ),
                name
            ),
            relayer,
            sig
        );

        content.status = DataTypes.AuditStatus.Pass;
        content.curatorId = curatorId;
        content.curatorContentId = contentId;
        _loan(content.bidToken, content.bidAmount, _msgSender());
        emit modifiBidEvent(index, content);
    }

    // View
    function isBidTokenWhitelisted(address token) external view returns (bool) {
        return _bidTokenWhitelisted[token];
    }

    function isRelayerWhitelisted(address wallet) external view returns (bool) {
        return _relayerWhitelisted[wallet];
    }

    function isGovernance(address wallet) external view returns (bool) {
        return _governance[wallet];
    }

    function getContentByIndex(
        uint256 index
    ) external view returns (Content memory) {
        return _contentByIndex[index];
    }

    function getBidCounter() external view returns (uint256) {
        return _bidCounter;
    }

    // Private
    function _validateContentIndex(uint256 index) internal view {
        if (index > _bidCounter) {
            revert Errors.ParamsInvalid();
        }
    }

    function _bid(BidData calldata vars) internal {
        uint256 counter = ++_bidCounter;
        Content memory content;
        content.contentId = vars.contentId;
        content.bidToken = vars.bidToken;
        content.bidAmount = vars.bidAmount;
        content.bidAddress = _msgSender();
        content.bidTime = block.timestamp;
        content.status = DataTypes.AuditStatus.Pending;
        _contentByIndex[counter] = content;
        emit addBidEvent(counter, content);
    }

    function _claimBack(uint256 index) internal {
        _validateContentIndex(index);
        Content storage content = _contentByIndex[index];
        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();
        if (
            content.bidTime + curateDuration + rewardClaimProtectionDuration >
            block.timestamp
        ) revert Errors.NotExpired();
        if (content.status != DataTypes.AuditStatus.Pending)
            revert Errors.BidIsClose();
        _contentByIndex[index].status = DataTypes.AuditStatus.Cancel;
        emit modifiBidEvent(index, _contentByIndex[index]);
        if (content.bidAmount > 0) {
            _sendTokenOrETH(
                content.bidToken,
                content.bidAddress,
                content.bidAmount
            );
        }
    }

    function _updateBid(uint256 index, uint256 amount) internal {
        _validateContentIndex(index);
        Content storage content = _contentByIndex[index];
        if (content.status != DataTypes.AuditStatus.Pending)
            revert Errors.BidIsClose();
        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();
        _fetchBidToken(content.bidToken, amount);
        _contentByIndex[index].bidAmount += amount;
        emit modifiBidEvent(index, _contentByIndex[index]);
    }

    function _loan(address token, uint256 amount, address to) internal {
        uint256 feeAmount = (amount * feeRate) / FEE_DENOMINATOR;
        if (feeAmount > 0) {
            _sendTokenOrETH(token, feeCollector, feeAmount);
        }
        if (amount - feeAmount > 0) {
            _sendTokenOrETH(token, to, amount - feeAmount);
        }
    }

    function _loanWithRelayer(
        uint256 index,
        uint256 curatorId,
        address to,
        string calldata contentId
    ) internal {
        _validateContentIndex(index);

        if (!_relayerWhitelisted[msg.sender]) {
            revert Errors.NotWhitelisted();
        }

        Content storage content = _contentByIndex[index];

        if (content.status != DataTypes.AuditStatus.Pending) {
            revert Errors.BidIsClose();
        }
        if (content.bidTime + curateDuration > block.timestamp)
            revert Errors.NotTimeToClaimYet();

        content.status = DataTypes.AuditStatus.Pass;
        content.curatorId = curatorId;
        content.curatorContentId = contentId;
        _loan(content.bidToken, content.bidAmount, to);
        emit modifiBidEvent(index, content);
    }

    function _fetchBidToken(address token, uint256 amount) internal {
        if (token == address(0) && amount != msg.value) {
            revert Errors.InsufficientInputAmount();
        }
        if (token != address(0)) {
            if (!_bidTokenWhitelisted[token])
                revert Errors.BidTokenNotWhitelisted();
            IERC20(token).safeTransferFrom(_msgSender(), address(this), amount);
        }
    }

    function _sendTokenOrETH(
        address token,
        address to,
        uint256 amount
    ) internal {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}(new bytes(0));
            if (!success) revert Errors.ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
