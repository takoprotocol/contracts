// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

import "./access/Ownable.sol";
import "./libraries/DataTypes.sol";
import "./libraries/Errors.sol";
import "./libraries/SigUtils.sol";
import "./interfaces/IIdRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract TakoFarcasterHub is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    address FARCASTER_ID_REGISTRY;

    enum BidType {
        Casts,
        Reply,
        Recasts
    }

    struct BidData {
        string contentURI;
        string parentHash;
        address bidToken;
        uint256 bidAmount;
        uint256 duration;
        uint256[] toCurators;
        address[] toCuratorAddresses;
    }

    struct Content {
        string contentURI;
        string parentHash;
        address bidToken;
        uint256 bidAmount;
        address bidAddress;
        uint256 bidExpires;
        uint256[] toCurators;
        uint256 curatorId;
        string curatorContentId;
        DataTypes.AuditStatus status;
        BidType bidType;
    }

    string public constant name = "Tako Farcaster Hub";
    bytes32 public merkleRoot;
    bytes32 internal constant LOAN_WITH_SIG_TYPEHASH =
        keccak256(
            "LoanWithSig(uint256 index,address curator,string contentId,uint256 deadline)"
        );

    uint8 public maxToCuratorCounter = 5;
    uint256 public maxDuration = 14 days;
    address public feeCollector;
    uint256 public feeRate = 1 * 10 ** 8;
    uint256 _bidCounter;

    mapping(uint256 => Content) internal _contentByIndex;
    mapping(address => bool) internal _bidTokenWhitelisted;
    mapping(address => mapping(address => uint256)) _minBidByTokenByWallet;
    mapping(address => mapping(BidType => bool)) _disableAuditType;
    mapping(address => bool) internal _relayerWhitelisted;
    mapping(address => bool) internal _governance;

    uint256 public constant FEE_DENOMINATOR = 10 ** 10;

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

    constructor(bytes32 initMerkleRoot, address farcasterIdRegistry) {
        merkleRoot = initMerkleRoot;
        feeCollector = _msgSender();
        FARCASTER_ID_REGISTRY = farcasterIdRegistry;
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
        if (gov == address(0)) revert Errors.AddressCanNotBeZero();
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

    function setToCuratorLimit(uint8 counter) external onlyGov {
        maxToCuratorCounter = counter;
    }

    function setMaxDuration(uint256 max) external onlyGov {
        maxDuration = max;
    }

    // User
    function bid(
        BidData calldata vars,
        BidType bidType,
        DataTypes.MerkleVerifyData calldata verifyData
    ) external payable nonReentrant onlyWhitelisted(verifyData) {
        _fetchBidToken(vars.bidToken, vars.bidAmount);
        _bid(vars, bidType);
    }

    function bidBatch(
        BidData[] calldata vars,
        BidType[] calldata bidType,
        DataTypes.MerkleVerifyData calldata verifyData
    ) external payable nonReentrant onlyWhitelisted(verifyData) {
        uint256 assetAmounts;
        for (uint256 i = 0; i < vars.length; i++) {
            _bid(vars[i], bidType[i]);
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
        uint256 duration,
        uint256 amount
    ) external payable nonReentrant {
        _validateDuration(duration);
        _validateContentIndex(index);

        Content storage content = _contentByIndex[index];
        if (content.status != DataTypes.AuditStatus.Pending)
            revert Errors.BidIsClose();
        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();

        _fetchBidToken(content.bidToken, amount);

        content.bidAmount += amount;
        content.bidExpires += duration;
        emit modifiBidEvent(index, content);
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
    function settings(
        address token,
        uint256 min,
        bool[] calldata disableAuditTypes
    ) external {
        _setMinBid(token, min);
        _setDisableAuditTypes(disableAuditTypes);
    }

    function setMinBid(address token, uint256 min) external {
        _setMinBid(token, min);
    }

    function setDisableAuditTypes(bool[] calldata disableAuditTypes) external {
        _setDisableAuditTypes(disableAuditTypes);
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

        _validateCurator(curatorId, content.toCurators);
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
        _loan(content.bidToken, content.bidAmount);
        emit modifiBidEvent(index, content);
    }

    // View
    function getMinBidAmount(
        address wallet,
        address token
    ) external view returns (uint256) {
        return _minBidByTokenByWallet[wallet][token];
    }

    function getDisableAcceptType(
        address wallet,
        BidType bidType
    ) external view returns (bool) {
        return _disableAuditType[wallet][bidType];
    }

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
    function _validateExpires(uint256 expires) internal view {
        if (expires < block.timestamp) {
            revert Errors.Expired();
        }
    }

    function _validateContentIndex(uint256 index) internal view {
        if (index > _bidCounter) {
            revert Errors.ParamsInvalid();
        }
    }

    function _validateBid(
        address token,
        uint256 amount,
        BidType bidType,
        address[] memory toCuratorAddresses
    ) internal view {
        if (toCuratorAddresses.length > maxToCuratorCounter) {
            revert Errors.ToCuratorLimitExceeded();
        }
        for (uint8 i = 0; i < toCuratorAddresses.length; i++) {
            if (amount < _minBidByTokenByWallet[toCuratorAddresses[i]][token]) {
                revert Errors.NotReachedMinimum();
            }
            if (_disableAuditType[toCuratorAddresses[i]][bidType]) {
                revert Errors.BidTypeNotAccept();
            }
        }
    }

    function _validateCurator(
        uint256 curatorId,
        uint256[] memory toCurators
    ) internal view {
        if (
            curatorId != IIdRegistry(FARCASTER_ID_REGISTRY).idOf(_msgSender())
        ) {
            revert Errors.NotProfileOwner();
        }
        if (toCurators.length == 0) {
            return;
        }

        bool flag;
        for (uint8 i = 0; i < toCurators.length; i++) {
            if (toCurators[i] == curatorId) {
                flag = true;
                break;
            }
        }
        if (!flag) {
            revert Errors.NotCurator();
        }
    }

    function _validateCurators(
        uint256[] memory curatorIds,
        address[] memory curators
    ) internal view {
        for (uint8 i = 0; i < curatorIds.length; i++) {
            if (
                IIdRegistry(FARCASTER_ID_REGISTRY).idOf(curators[i]) !=
                curatorIds[i]
            ) {
                revert Errors.ParamsInvalid();
            }
        }
    }

    function _validateDuration(uint256 duration) internal view {
        if (duration > maxDuration) {
            revert Errors.DurationLimitExceeded();
        }
    }

    function _setMinBid(address token, uint256 min) internal {
        _minBidByTokenByWallet[_msgSender()][token] = min;
    }

    function _setDisableAuditTypes(bool[] calldata disableAuditTypes) internal {
        if (disableAuditTypes.length != 3) {
            revert Errors.ParamsInvalid();
        }

        _disableAuditType[_msgSender()][BidType.Casts] = disableAuditTypes[0];
        _disableAuditType[_msgSender()][BidType.Reply] = disableAuditTypes[1];
        _disableAuditType[_msgSender()][BidType.Recasts] = disableAuditTypes[2];
    }

    function _bid(BidData calldata vars, BidType bidType) internal {
        _validateDuration(vars.duration);
        _validateCurators(vars.toCurators, vars.toCuratorAddresses);
        _validateBid(
            vars.bidToken,
            vars.bidAmount,
            bidType,
            vars.toCuratorAddresses
        );

        uint256 counter = ++_bidCounter;
        Content memory content;
        if (bidType == BidType.Reply || bidType == BidType.Casts) {
            content.contentURI = vars.contentURI;
        }
        if (bidType == BidType.Reply || bidType == BidType.Recasts) {
            content.parentHash = vars.parentHash;
        }
        content.bidToken = vars.bidToken;
        content.bidAmount = vars.bidAmount;
        content.bidAddress = _msgSender();
        content.bidExpires = block.timestamp + vars.duration;
        content.toCurators = vars.toCurators;
        content.bidType = bidType;

        content.status = DataTypes.AuditStatus.Pending;

        _contentByIndex[counter] = content;
        emit addBidEvent(counter, content);
    }

    function _claimBack(uint256 index) internal {
        _validateContentIndex(index);

        Content storage content = _contentByIndex[index];

        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();
        if (content.bidExpires > block.timestamp) revert Errors.NotExpired();
        if (content.status != DataTypes.AuditStatus.Pending)
            revert Errors.BidIsClose();
        if (content.bidAmount > 0) {
            _sendTokenOrETH(
                content.bidToken,
                content.bidAddress,
                content.bidAmount
            );
        }

        content.status = DataTypes.AuditStatus.Cancel;

        emit modifiBidEvent(index, content);
    }

    function _loan(address token, uint256 amount) internal {
        uint256 feeAmount = (amount * feeRate) / FEE_DENOMINATOR;
        if (feeAmount > 0) {
            _sendTokenOrETH(token, feeCollector, feeAmount);
        }
        if (amount - feeAmount > 0) {
            _sendTokenOrETH(token, _msgSender(), amount - feeAmount);
        }
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
            _sendETH(to, amount);
        } else {
            _sendToken(token, to, amount);
        }
    }

    function _sendToken(address token, address to, uint256 amount) internal {
        IERC20(token).safeTransfer(to, amount);
    }

    function _sendETH(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}(new bytes(0));
        if (!success) revert Errors.ETHTransferFailed();
    }
}
