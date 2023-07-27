// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

import "./access/Ownable.sol";
import "./libraries/DataTypes.sol";
import "./libraries/Errors.sol";
import "./interfaces/ILensHub.sol";
import "./libraries/SigUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TakoLensHub is Ownable {
    using SafeERC20 for IERC20;

    address LENS_HUB;
    address LENS_FREE_COLLECT_MODULE;

    enum BidType {
        Post,
        Comment,
        Mirror
    }

    struct BidData {
        string contentURI;
        uint256 profileIdPointed;
        uint256 pubIdPointed;
        address bidToken;
        uint256 bidAmount;
        uint256 duration;
        uint256[] toProfiles;
    }

    struct Content {
        string contentURI;
        uint256 profileIdPointed;
        uint256 pubIdPointed;
        address bidToken;
        address bidAddress;
        uint256 bidAmount;
        uint256 bidExpires;
        uint256[] toProfiles;
        uint256 curatorProfileId;
        uint256 curatorPubId;
        DataTypes.AuditState state;
        BidType bidType;
    }

    struct MomokaBidData {
        string contentURI;
        string mirror;
        string commentOn;
        address bidToken;
        uint256 bidAmount;
        uint256 duration;
        uint256[] toProfiles;
    }

    struct MomokaContent {
        string mirror;
        string commentOn;
        string contentURI;
        address bidToken;
        address bidAddress;
        uint256 bidAmount;
        uint256 bidExpires;
        uint256[] toProfiles;
        uint256 curatorProfileId;
        string curatorPubId;
        DataTypes.AuditState state;
        BidType bidType;
    }

    string public constant name = "Tako Lens Hub";
    bytes32 internal constant LOAN_WITH_SIG_TYPEHASH =
        keccak256(
            "LoanWithSig(uint256 index,address curator,string contentId,uint256 deadline)"
        );

    uint8 public maxToProfileCounter = 5;
    uint256 public maxDuration = 14 days;
    address public feeCollector;
    uint256 public feeRate = 1 * 10 ** 8;
    uint256 _bidCounter;

    mapping(uint256 => Content) internal _contentByIndex;
    mapping(address => bool) internal _bidTokenWhitelisted;
    mapping(address => mapping(address => uint256)) _minBidByTokenByWallet;
    mapping(address => mapping(BidType => bool)) _disableAuditType;

    uint256 _momokaBidCounter;
    mapping(uint256 => MomokaContent) internal _momokaContentByIndex;
    mapping(address => bool) internal _relayerWhitelisted;

    uint256 public constant FEE_DENOMINATOR = 10 ** 10;

    event addBidEvent(uint256 index, Content content);
    event modifiBidEvent(uint256 index, Content content);
    event addBidMomokaEvent(uint256 index, MomokaContent content);
    event modifiBidMomokaEvent(uint256 index, MomokaContent content);

    constructor(address lensHub, address lensFreeCollectModule) {
        require(lensHub != address(0), "lensHub address cannot be zero");
        require(
            lensFreeCollectModule != address(0),
            "lensFreeCollectModule address cannot be zero"
        );

        LENS_HUB = lensHub;
        LENS_FREE_COLLECT_MODULE = lensFreeCollectModule;

        feeCollector = _msgSender();
    }

    receive() external payable {}

    // Gov
    function whitelistBidToken(
        address token,
        bool whitelist
    ) external onlyOwner {
        require(token != address(0), "token address cannot be zero");
        _bidTokenWhitelisted[token] = whitelist;
    }

    function whitelistRelayer(
        address relayer,
        bool whitelist
    ) external onlyOwner {
        require(relayer != address(0), "relayer address cannot be zero");
        _relayerWhitelisted[relayer] = whitelist;
    }

    function setLensHub(address hub) external onlyOwner {
        require(hub != address(0), "hub address cannot be zero");
        LENS_HUB = hub;
    }

    function setLensFreeCollectModule(
        address collectModule
    ) external onlyOwner {
        require(
            collectModule != address(0),
            "collectModule address cannot be zero"
        );
        LENS_FREE_COLLECT_MODULE = collectModule;
    }

    function setFeeCollector(address newsFeeCollector) external onlyOwner {
        require(
            newsFeeCollector != address(0),
            "feeCollector address cannot be zero"
        );
        feeCollector = newsFeeCollector;
    }

    function setFeeRate(uint256 newFeeRate) external onlyOwner {
        require(newFeeRate <= FEE_DENOMINATOR, "new fee rate exceeds maximum");
        feeRate = newFeeRate;
    }

    function setToProfileLimit(uint8 counter) external onlyOwner {
        maxToProfileCounter = counter;
    }

    function setMaxDuration(uint256 max) external onlyOwner {
        maxDuration = max;
    }

    // User
    function bid(BidData calldata vars, BidType bidType) external payable {
        _bid(vars, bidType);
    }

    function bidBatch(
        BidData[] calldata vars,
        BidType[] calldata bidType
    ) external payable {
        for (uint256 i = 0; i < vars.length; i++) {
            _bid(vars[i], bidType[i]);
        }
    }

    function bidMomoka(
        MomokaBidData calldata vars,
        BidType bidType
    ) external payable {
        _bidMomoka(vars, bidType);
    }

    function bidMomokaBatch(
        MomokaBidData[] calldata vars,
        BidType[] calldata bidType
    ) external payable {
        for (uint256 i = 0; i < vars.length; i++) {
            _bidMomoka(vars[i], bidType[i]);
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

        _fetchBidToken(content.bidToken, amount);

        content.bidAmount += amount;
        content.bidExpires += duration;
        _contentByIndex[index] = content;
        emit modifiBidEvent(index, content);
    }

    function updateBidMomoka(
        uint256 index,
        uint256 duration,
        uint256 amount
    ) external payable {
        _validateDuration(duration);
        _validateMomokaContentIndex(index);

        MomokaContent memory content = _momokaContentByIndex[index];

        _fetchBidToken(content.bidToken, amount);

        content.bidAmount += amount;
        content.bidExpires += duration;
        _momokaContentByIndex[index] = content;
        emit modifiBidMomokaEvent(index, content);
    }

    function claimBackBid(uint256 index) external {
        _claimBack(index);
    }

    function claimBackBidBatch(uint256[] calldata indexArr) external {
        for (uint256 i = 0; i < indexArr.length; i++) {
            _claimBack(indexArr[i]);
        }
    }

    function claimBackBidMomoka(uint256 index) external {
        _claimBackMomoka(index);
    }

    function claimBackBidMomokaBatch(uint256[] calldata indexArr) external {
        for (uint256 i = 0; i < indexArr.length; i++) {
            _claimBackMomoka(indexArr[i]);
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

    function auditBidPost(
        uint256 index,
        uint256 profileId,
        DataTypes.EIP712Signature calldata sig
    ) external {
        _validateContentIndex(index);

        Content memory content = _contentByIndex[index];

        if (content.bidType != BidType.Post) {
            revert Errors.ParamsInvalid();
        }
        if (content.state != DataTypes.AuditState.Pending) {
            revert Errors.BidIsClose();
        }

        _validateExpires(content.bidExpires);
        _validateProfile(profileId, content.toProfiles);

        ILensHub.PostWithSigData memory lensData;
        lensData.profileId = profileId;
        lensData.contentURI = content.contentURI;
        lensData.collectModule = LENS_FREE_COLLECT_MODULE;
        lensData.collectModuleInitData = abi.encode(false);
        lensData.sig = DataTypes.EIP712Signature(
            sig.v,
            sig.r,
            sig.s,
            sig.deadline
        );

        _loan(content.bidToken, content.bidAmount);

        content.curatorPubId = _postWithSign(lensData);
        content.curatorProfileId = profileId;
        content.state = DataTypes.AuditState.Pass;

        _contentByIndex[index] = content;

        emit modifiBidEvent(index, content);
    }

    function auditBidMirror(
        uint256 index,
        uint256 profileId,
        DataTypes.EIP712Signature calldata sig
    ) external {
        _validateContentIndex(index);

        Content memory content = _contentByIndex[index];

        if (content.bidType != BidType.Mirror) {
            revert Errors.ParamsInvalid();
        }
        if (content.state != DataTypes.AuditState.Pending) {
            revert Errors.BidIsClose();
        }

        _validateExpires(content.bidExpires);
        _validateProfile(profileId, content.toProfiles);

        ILensHub.MirrorWithSigData memory lensData;
        lensData.profileId = profileId;
        lensData.profileIdPointed = content.profileIdPointed;
        lensData.pubIdPointed = content.pubIdPointed;
        lensData.sig = DataTypes.EIP712Signature(
            sig.v,
            sig.r,
            sig.s,
            sig.deadline
        );

        _loan(content.bidToken, content.bidAmount);

        content.curatorPubId = _mirrorWithSign(lensData);
        content.curatorProfileId = profileId;
        content.state = DataTypes.AuditState.Pass;

        _contentByIndex[index] = content;

        emit modifiBidEvent(index, _contentByIndex[index]);
    }

    function auditBidComment(
        uint256 index,
        uint256 profileId,
        DataTypes.EIP712Signature calldata sig
    ) external {
        _validateContentIndex(index);

        Content memory content = _contentByIndex[index];

        if (content.bidType != BidType.Comment) {
            revert Errors.ParamsInvalid();
        }
        if (content.state != DataTypes.AuditState.Pending) {
            revert Errors.BidIsClose();
        }

        _validateExpires(content.bidExpires);
        _validateProfile(profileId, content.toProfiles);

        ILensHub.CommentWithSigData memory lensData;
        lensData.profileId = profileId;
        lensData.contentURI = content.contentURI;
        lensData.profileIdPointed = content.profileIdPointed;
        lensData.pubIdPointed = content.pubIdPointed;
        lensData.collectModule = LENS_FREE_COLLECT_MODULE;
        lensData.collectModuleInitData = abi.encode(false);
        lensData.sig = DataTypes.EIP712Signature(
            sig.v,
            sig.r,
            sig.s,
            sig.deadline
        );

        _loan(content.bidToken, content.bidAmount);

        content.curatorPubId = _commentWithSign(lensData);
        content.curatorProfileId = profileId;
        content.state = DataTypes.AuditState.Pass;

        _contentByIndex[index] = content;

        emit modifiBidEvent(index, _contentByIndex[index]);
    }

    function loanWithSig(
        uint256 index,
        uint256 profileId,
        address relayer,
        string calldata contentId,
        DataTypes.EIP712Signature calldata sig
    ) external {
        _validateMomokaContentIndex(index);

        if (!_relayerWhitelisted[relayer]) {
            revert Errors.NotWhitelisted();
        }

        MomokaContent memory content = _momokaContentByIndex[index];
        if (content.state != DataTypes.AuditState.Pending) {
            revert Errors.BidIsClose();
        }

        _validateProfile(profileId, content.toProfiles);

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

        _momokaContentByIndex[index].state = DataTypes.AuditState.Pass;
        _momokaContentByIndex[index].curatorProfileId = profileId;
        _momokaContentByIndex[index].curatorPubId = contentId;

        emit modifiBidMomokaEvent(index, _momokaContentByIndex[index]);
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

    function getContentByIndex(
        uint256 index
    ) external view returns (Content memory) {
        return _contentByIndex[index];
    }

    function getMomokaContentByIndex(
        uint256 index
    ) external view returns (MomokaContent memory) {
        return _momokaContentByIndex[index];
    }

    function getBidCounter() external view returns (uint256) {
        return _bidCounter;
    }

    function getMomokaBidCounter() external view returns (uint256) {
        return _momokaBidCounter;
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

    function _validateMomokaContentIndex(uint256 index) internal view {
        if (index > _momokaBidCounter) {
            revert Errors.ParamsInvalid();
        }
    }

    function _validateBidAndGetToken(
        address token,
        uint256 amount,
        BidType bidType,
        uint256[] memory toProfiles
    ) internal {
        if (toProfiles.length > maxToProfileCounter) {
            revert Errors.ToProfileLimitExceeded();
        }

        for (uint8 i = 0; i < toProfiles.length; i++) {
            address profileOwner = ILensHub(LENS_HUB).ownerOf(toProfiles[i]);

            if (amount < _minBidByTokenByWallet[profileOwner][token]) {
                revert Errors.NotReachedMinimum();
            }
            if (_disableAuditType[profileOwner][bidType]) {
                revert Errors.BidTypeNotAccept();
            }
        }

        _fetchBidToken(token, amount);
    }

    function _validateProfile(
        uint256 profileId,
        uint256[] memory toProfiles
    ) internal {
        address profileOwner = ILensHub(LENS_HUB).ownerOf(profileId);
        if (profileOwner != _msgSender()) {
            revert Errors.NotProfileOwner();
        }

        if (toProfiles.length == 0) {
            return;
        }

        bool flag;
        for (uint8 i = 0; i < toProfiles.length; i++) {
            if (toProfiles[i] == profileId) {
                flag = true;
                break;
            }
        }
        if (!flag) {
            revert Errors.NotCurator();
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

        _disableAuditType[_msgSender()][BidType.Post] = disableAuditTypes[0];
        _disableAuditType[_msgSender()][BidType.Comment] = disableAuditTypes[1];
        _disableAuditType[_msgSender()][BidType.Mirror] = disableAuditTypes[2];
    }

    function _postWithSign(
        ILensHub.PostWithSigData memory vars
    ) internal returns (uint256) {
        return ILensHub(LENS_HUB).postWithSig(vars);
    }

    function _mirrorWithSign(
        ILensHub.MirrorWithSigData memory vars
    ) internal returns (uint256) {
        return ILensHub(LENS_HUB).mirrorWithSig(vars);
    }

    function _commentWithSign(
        ILensHub.CommentWithSigData memory vars
    ) internal returns (uint256) {
        return ILensHub(LENS_HUB).commentWithSig((vars));
    }

    function _bid(BidData calldata vars, BidType bidType) internal {
        _validateDuration(vars.duration);

        _validateBidAndGetToken(
            vars.bidToken,
            vars.bidAmount,
            bidType,
            vars.toProfiles
        );

        uint256 counter = ++_bidCounter;
        Content memory content;
        content.contentURI = vars.contentURI;
        content.bidAmount = vars.bidAmount;
        content.bidToken = vars.bidToken;
        content.bidAmount = vars.bidAmount;
        content.bidAddress = _msgSender();
        content.bidExpires = block.timestamp + vars.duration;
        content.toProfiles = vars.toProfiles;
        content.bidType = bidType;

        if (bidType == BidType.Comment || bidType == BidType.Mirror) {
            content.profileIdPointed = vars.profileIdPointed;
            content.pubIdPointed = vars.pubIdPointed;
        }

        content.state = DataTypes.AuditState.Pending;

        _contentByIndex[counter] = content;
        emit addBidEvent(counter, content);
    }

    function _bidMomoka(MomokaBidData calldata vars, BidType bidType) internal {
        _validateDuration(vars.duration);

        _validateBidAndGetToken(
            vars.bidToken,
            vars.bidAmount,
            bidType,
            vars.toProfiles
        );

        uint256 counter = ++_momokaBidCounter;
        MomokaContent memory content;
        content.bidAmount = vars.bidAmount;
        content.bidToken = vars.bidToken;
        content.bidAmount = vars.bidAmount;
        content.bidAddress = _msgSender();
        content.bidExpires = block.timestamp + vars.duration;
        content.toProfiles = vars.toProfiles;
        content.bidType = bidType;

        if (bidType == BidType.Post) {
            content.contentURI = vars.contentURI;
        }
        if (bidType == BidType.Comment) {
            content.contentURI = vars.contentURI;
            content.commentOn = vars.commentOn;
        }
        if (bidType == BidType.Mirror) {
            content.mirror = vars.mirror;
        }

        content.state = DataTypes.AuditState.Pending;

        _momokaContentByIndex[counter] = content;
        emit addBidMomokaEvent(counter, content);
    }

    function _claimBack(uint256 index) internal {
        _validateContentIndex(index);

        Content memory content = _contentByIndex[index];

        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();
        if (content.bidExpires > block.timestamp) revert Errors.NotExpired();
        if (content.state != DataTypes.AuditState.Pending)
            revert Errors.BidIsClose();
        if (content.bidAmount > 0) {
            _sendTokenOrETH(
                content.bidToken,
                content.bidAddress,
                content.bidAmount
            );
        }

        _contentByIndex[index].state = DataTypes.AuditState.Cancel;

        emit modifiBidEvent(index, _contentByIndex[index]);
    }

    function _claimBackMomoka(uint256 index) internal {
        _validateMomokaContentIndex(index);

        MomokaContent memory content = _momokaContentByIndex[index];

        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();
        if (content.bidExpires > block.timestamp) revert Errors.NotExpired();
        if (content.state != DataTypes.AuditState.Pending)
            revert Errors.BidIsClose();
        if (content.bidAmount > 0) {
            _sendTokenOrETH(
                content.bidToken,
                content.bidAddress,
                content.bidAmount
            );
        }

        _momokaContentByIndex[index].state = DataTypes.AuditState.Cancel;

        emit modifiBidMomokaEvent(index, _momokaContentByIndex[index]);
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
