// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

import "./access/Ownable.sol";
import "./libraries/DataTypes.sol";
import "./libraries/Errors.sol";
import "./libraries/SigUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract TakoFarcasterHub is Ownable {
    using SafeERC20 for IERC20;

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

    struct VerifiedCuratorsData {
        uint256[] curatorIds;
        address[] curators;
        address relayer;
        DataTypes.EIP712Signature sig;
    }

    string public constant name = "Tako Farcaster Hub";
    bytes32 public merkleRoot;
    bytes32 internal constant LOAN_WITH_SIG_TYPEHASH =
        keccak256(
            "LoanWithSig(uint256 index,address curator,string contentId,uint256 deadline)"
        );
    bytes32 internal constant VERIFIED_CURATORS_TYPEHASH =
        keccak256(
            "VerifiedCurators(uint256[] curatorIds,address[] curators,uint256 deadline)"
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
    mapping(address => bool) internal _governances;
    mapping(uint256 => mapping(uint256 => address))
        private _verifiedCuratorById;

    uint256 public constant FEE_DENOMINATOR = 10 ** 10;

    event addBidEvent(uint256 index, Content content);
    event modifiBidEvent(uint256 index, Content content);

    modifier onlyGov() {
        if (!_governances[_msgSender()]) {
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
        require(
            newsFeeCollector != address(0),
            "feeCollector address cannot be zero"
        );
        require(newFeeRate <= FEE_DENOMINATOR, "new fee rate exceeds maximum");
        feeRate = newFeeRate;
        feeCollector = newsFeeCollector;
    }

    function setGovernance(address gov, bool whitelist) external onlyOwner {
        _governances[gov] = whitelist;
    }

    // Gov
    function setMerkleRoot(bytes32 newMerkelRoot) external onlyGov {
        merkleRoot = newMerkelRoot;
    }

    function whitelistBidToken(address token, bool whitelist) external onlyGov {
        _bidTokenWhitelisted[token] = whitelist;
    }

    function whitelistRelayer(
        address relayer,
        bool whitelist
    ) external onlyGov {
        require(relayer != address(0), "relayer address cannot be zero");
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
        VerifiedCuratorsData calldata verifiedCuratorsData,
        DataTypes.MerkleVerifyData calldata verifyData
    ) external payable onlyWhitelisted(verifyData) {
        _validateCuratorsSigData(verifiedCuratorsData);
        _bid(vars, bidType);
    }

    function bidBatch(
        BidData[] calldata vars,
        BidType[] calldata bidType,
        VerifiedCuratorsData calldata verifiedCuratorsData,
        DataTypes.MerkleVerifyData calldata verifyData
    ) external payable onlyWhitelisted(verifyData) {
        _validateCuratorsSigData(verifiedCuratorsData);
        for (uint256 i = 0; i < vars.length; i++) {
            _bid(vars[i], bidType[i]);
        }
    }

    function updateBid(
        uint256 index,
        uint256 duration,
        uint256 amount
    ) external payable {
        _validateDuration(duration);
        _validateContentIndex(index);

        Content memory content = _contentByIndex[index];
        if (content.status != DataTypes.AuditStatus.Pending)
            revert Errors.BidIsClose();
        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();

        _fetchBidToken(content.bidToken, amount);

        content.bidAmount += amount;
        content.bidExpires += duration;
        _contentByIndex[index] = content;
        emit modifiBidEvent(index, content);
    }

    function claimBackBid(uint256 index) external {
        _claimBack(index);
    }

    function claimBackBidBatch(uint256[] calldata indexArr) external {
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
        VerifiedCuratorsData calldata verifiedCuratorsData,
        DataTypes.EIP712Signature calldata sig
    ) external {
        _validateContentIndex(index);
        _validateCuratorsSigData(verifiedCuratorsData);
        if (!_relayerWhitelisted[relayer]) {
            revert Errors.NotWhitelisted();
        }

        Content memory content = _contentByIndex[index];
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

        _loan(content.bidToken, content.bidAmount);

        _contentByIndex[index].status = DataTypes.AuditStatus.Pass;
        _contentByIndex[index].curatorId = curatorId;
        _contentByIndex[index].curatorContentId = contentId;

        emit modifiBidEvent(index, content);
        (index, _contentByIndex[index]);
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
        return _governances[wallet];
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

    function _validateBidAndGetToken(
        address token,
        uint256 amount,
        BidType bidType,
        uint256[] memory toCurators
    ) internal {
        if (toCurators.length > maxToCuratorCounter) {
            revert Errors.ToCuratorLimitExceeded();
        }
        uint256 blockNumber = block.number;
        for (uint8 i = 0; i < toCurators.length; i++) {
            address curatorAddr = _verifiedCuratorById[toCurators[i]][
                blockNumber
            ];
            if (amount < _minBidByTokenByWallet[curatorAddr][token]) {
                revert Errors.NotReachedMinimum();
            }
            if (_disableAuditType[curatorAddr][bidType]) {
                revert Errors.BidTypeNotAccept();
            }
        }

        _fetchBidToken(token, amount);
    }

    function _validateCurator(
        uint256 curatorId,
        uint256[] memory toCurators
    ) internal view {
        address curator = _verifiedCuratorById[curatorId][block.number];
        if (curator != _msgSender()) {
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

    function _validateCuratorsSigData(
        VerifiedCuratorsData calldata verifiedCuratorsData
    ) internal {
        if (!_relayerWhitelisted[verifiedCuratorsData.relayer]) {
            revert Errors.NotWhitelisted();
        }
        SigUtils._validateRecoveredAddress(
            SigUtils._calculateDigest(
                keccak256(
                    abi.encode(
                        VERIFIED_CURATORS_TYPEHASH,
                        keccak256(
                            abi.encodePacked(verifiedCuratorsData.curatorIds)
                        ),
                        keccak256(
                            abi.encodePacked(verifiedCuratorsData.curators)
                        ),
                        verifiedCuratorsData.sig.deadline
                    )
                ),
                name
            ),
            verifiedCuratorsData.relayer,
            verifiedCuratorsData.sig
        );
        for (uint8 i = 0; i < verifiedCuratorsData.curatorIds.length; i++) {
            _verifiedCuratorById[verifiedCuratorsData.curatorIds[i]][
                block.number
            ] = verifiedCuratorsData.curators[i];
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

        _validateBidAndGetToken(
            vars.bidToken,
            vars.bidAmount,
            bidType,
            vars.toCurators
        );

        uint256 counter = ++_bidCounter;
        Content memory content;
        if (bidType == BidType.Reply || bidType == BidType.Casts) {
            content.contentURI = vars.contentURI;
        }
        if (bidType == BidType.Reply || bidType == BidType.Recasts) {
            content.parentHash = vars.parentHash;
        }
        content.bidAmount = vars.bidAmount;
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

        Content memory content = _contentByIndex[index];

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

        _contentByIndex[index].status = DataTypes.AuditStatus.Cancel;

        emit modifiBidEvent(index, _contentByIndex[index]);
    }

    function _loan(address token, uint256 amount) internal {
        uint256 feeAmount = (amount * feeRate) / FEE_DENOMINATOR;
        _sendTokenOrETH(token, feeCollector, feeAmount);
        _sendTokenOrETH(token, _msgSender(), amount - feeAmount);
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
