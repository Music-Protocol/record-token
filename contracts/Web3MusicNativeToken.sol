// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";

contract Web3MusicNativeToken is
    IWeb3MusicNativeToken,
    ERC20,
    Ownable2Step,
    Pausable
{
    using SafeMath for uint256;

    uint256 max_mint = 1000000000000000000000000000;            
    uint256 minted = 0;
    address private immutable _fanToArtistStaking;
    mapping (address => ReleasablePayment) releasablePayments;

    struct ReleasablePayment {
        uint256 released;
        uint256 tokens;
        uint64 start;
        uint64 duration;
        bool initiated;
    }

    event TokenReleased(
        address beneficiary, 
        uint256 amount
    );

    event TokenLocked(
        address beneficiary, 
        uint256 amount
    );

    //for the function callable only by FanToArtistStaking.sol
    modifier onlyStaking() {
        require(
            _fanToArtistStaking == _msgSender(),
            "Web3MusicNativeToken: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    constructor(
        address staking_
    ) ERC20("Web3MusicNativeToken", "W3M") {
        require(
            staking_ != address(0),
            "Web3MusicNativeToken: the address of FanToArtistStaking is 0"
        );
        _fanToArtistStaking = staking_;
    }

    function transferOwnership(
        address to
    ) public override(IWeb3MusicNativeToken, Ownable2Step) onlyOwner {
        super.transferOwnership(to);
    }

    function renounceOwnership(
    ) public override(Ownable) onlyOwner {
        require(false, "function disabled");
        super.renounceOwnership();
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        if(from!=address(0) && to!=_fanToArtistStaking){
            release(from);
            require((balanceOf(from) - (releasablePayments[from].tokens - releasablePayments[from].released)) >= amount, "W3T: transfer amount exceeds balance");
        }
        if(from == address(0)) require(minted + amount <= max_mint, "W3T: Maximum limit of minable tokens reached");
        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        if(to == _fanToArtistStaking && releasablePayments[from].tokens != 0){
            (,uint256 ownedTokens) = balanceOf(from).trySub(releasablePayments[from].tokens - releasablePayments[from].released);
            if (ownedTokens < amount) {
                (,uint256 excess) = amount.trySub(ownedTokens);
                (,releasablePayments[from].released) = releasablePayments[from].released.tryAdd(excess);
            }
        }
        if(from == address(0)) minted += amount;
        if(to == address(0)) minted -= amount;
        super._afterTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount) external override onlyOwner {
        _mint(to, amount);
    }

    function mint_and_lock(address _beneficiary, uint256 _amount, uint64 _start, uint64 _duration) external override onlyOwner {
        require(
            _amount > 0, 
            "W3T: Amount can not be 0 or less in mint_and_lock."
        );
        require(
            releasablePayments[_beneficiary].tokens == 0,
            "W3T: Releasable payment already used."
        );
        releasablePayments[_beneficiary] = ReleasablePayment(0, _amount, _start, _duration, true);
        _mint(_beneficiary, _amount);
        emit TokenLocked(_beneficiary, _amount);
    }

    function burn(uint256 amount) external override onlyOwner {
        _burn(_msgSender(), amount);
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external override onlyOwner {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    function transfer_and_lock(address _beneficiary, uint256 _amount, uint64 _start, uint64 _duration) external override onlyOwner {
        require(
            _amount > 0, 
            "W3T: Amount can not be 0 or less in transfer_and_lock."
        );
        require(
            releasablePayments[_beneficiary].tokens == 0,
            "W3T: Releasable payment already used."
        );
        releasablePayments[_beneficiary] = ReleasablePayment(0, _amount, _start, _duration, true);
        transfer(_beneficiary, _amount);
        emit TokenLocked(_beneficiary, _amount);
    }

    function release(address beneficiary) internal {
            uint256 amount = releasable(beneficiary);
            releasablePayments[beneficiary].released += amount;
            emit TokenReleased(beneficiary, amount);
    }

    function released(address beneficiary) public view returns (uint256) {
        return releasablePayments[beneficiary].released;
    }

    function releasable(address beneficiary) public view returns (uint256) {
        (,uint256 releasableTokens) = _vestingSchedule(releasablePayments[beneficiary], uint64(block.timestamp)).trySub(released(beneficiary));
        if(releasableTokens > 0) return releasableTokens;
        return 0;
    }

    function _vestingSchedule(ReleasablePayment memory releasablePayment, uint64 timestamp) private pure returns (uint256) {
        if (timestamp < releasablePayment.start) {
            return 0;
        } else if (timestamp >= releasablePayment.start + releasablePayment.duration) {
            return releasablePayment.tokens;
        } else {
            return (releasablePayment.tokens * (timestamp - releasablePayment.start)) / releasablePayment.duration;
        }
    }

    //Safe since it can be called only by FanToArtistStaking, could add a mapping(address => amount) to check if someone is unlocking more than what he previously locked
    function lock(
        address from,
        uint256 amount
    ) external override onlyStaking returns (bool) {
        _transfer(from, _msgSender(), amount);
        return true;
    }

    function pay(address to, uint256 amount) external override onlyStaking {
        _mint(to, amount);
    }
}
