// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.17;

import "./access/Ownable.sol";
import "./libraries/DataTypes.sol";
import "./libraries/Errors.sol";
import "./interfaces/ILensHub.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TakoLensHub is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;
    address LENS_HUB;

    enum BidType {
        Post,
        Comment,
        Mirror,
        QuotePost
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
        uint256[] toProfileIds;
        DataTypes.AuditState state;
        BidType bidType;
    }

    address public feeCollector;
    uint256 public feeRate = 1 * 10 ** 8;
    uint256 _bidCounter;
    mapping(address => mapping(address => uint256)) _minBidByTokenByWallet;
    mapping(address => bool) internal _bidTokenWhitelisted;
    mapping(uint256 => Content) internal _contentByIndex;

    uint256 public constant FEE_DENOMINATOR = 10 ** 10;

    constructor(address lensHub) {
        LENS_HUB = lensHub;
    }

    receive() external payable {}

    function bidPost(BidData calldata vars) external payable {
        _bid(vars, BidType.Post);
    }

    function bidMirror(BidData calldata vars) external payable {
        _bid(vars, BidType.Mirror);
    }

    function bidComment(BidData calldata vars) external {
        _bid(vars, BidType.Comment);
    }

    function bidQuotePost(BidData calldata vars) external {
        _bid(vars, BidType.QuotePost);
    }

    function updateBid(BidData calldata vars, uint256 index) external {
        _cancelBid(index);
        Content memory content = _contentByIndex[index];
        _bid(vars, content.bidType);
    }

    function cancelBid(uint256 index) external {
        _cancelBid(index);
    }

    function auditBid(uint256 index) external {}

    function _validateContentIndex(uint256 index) internal view {
        if (index > _bidCounter) {
            revert Errors.ParamsrInvalid();
        }
    }

    function _validateBidAndGetToken(
        address token,
        uint256 amount,
        uint256[] memory toProfiles
    ) internal {
        for (uint8 i = 0; i < toProfiles.length; i++) {
            address profileOwner = ILensHub(LENS_HUB).ownerOf(toProfiles[i]);
            if (_minBidByTokenByWallet[profileOwner][token] > amount) {
                revert Errors.NotReachedMinimum();
            }
        }
        if (token == address(0) && amount != msg.value) {
            revert Errors.InsufficientInputAmount();
        }
        if (token != address(0)) {
            if (!_bidTokenWhitelisted[token])
                revert Errors.BidTokenNotWhitelisted();
            IERC20(token).safeTransferFrom(_msgSender(), address(this), amount);
        }
    }

    function _mirrorWithSign(
        ILensHub.MirrorWithSigData calldata vars
    ) external {
        ILensHub(LENS_HUB).mirrorWithSig(vars);
    }

    function _bid(BidData calldata vars, BidType bidType) internal {
        _validateBidAndGetToken(vars.bidToken, vars.bidAmount, vars.toProfiles);
        uint256 counter = ++_bidCounter;
        Content memory content;
        content.contentURI = vars.contentURI;
        content.bidAmount = vars.bidAmount;
        content.state = DataTypes.AuditState.Pending;
        content.bidToken = vars.bidToken;
        content.bidAmount = vars.bidAmount;
        content.bidAddress = _msgSender();
        content.bidExpires = block.timestamp + vars.duration;
        content.toProfileIds = vars.toProfiles;
        content.bidType = bidType;
        if (bidType == BidType.Comment || bidType == BidType.Mirror) {
            content.profileIdPointed = vars.profileIdPointed;
            content.pubIdPointed = vars.pubIdPointed;
        }
        content.state = DataTypes.AuditState.Pending;
        _contentByIndex[counter] = content;
    }

    function _cancelBid(uint256 index) internal {
        _validateContentIndex(index);
        Content memory content = _contentByIndex[index];
        if (content.bidAddress != _msgSender()) revert Errors.NotBidder();
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
