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
    mapping(address => ReleasablePayment) releasablePayments;

    struct ReleasablePayment {
        uint256 releasableBalance;
        uint256 tokens;
        uint256 released;
        uint64 start;
        uint64 duration;
        uint64 updatedDuration;
    }

    event TokenReleased(address beneficiary, uint256 amount);

    event TokenLocked(address beneficiary, uint256 amount);

    //for the function callable only by FanToArtistStaking.sol
    modifier onlyStaking() {
        require(
            _fanToArtistStaking == _msgSender(),
            "Web3MusicNativeToken: caller is not the FanToArtistStaking contract"
        );
        _;
    }

    constructor(address staking_) ERC20("Web3MusicNativeToken", "W3M") {
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

    function renounceOwnership() public override(Ownable) onlyOwner {
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
        if (
            from != address(0) &&
            to != _fanToArtistStaking &&
            releasablePayments[from].tokens > 0
        ) {
            release(from);
            (, uint256 ownedTokens) = balanceOf(from).trySub(
                releasablePayments[from].tokens -
                    releasablePayments[from].released
            );
            require(
                ownedTokens >= amount,
                "Web3MusicNativeToken: transfer amount exceeds balance"
            );
        }
        if (from == _fanToArtistStaking) {
            uint256 debt = releasablePayments[to].releasableBalance -
                releasablePayments[to].tokens;
            if (debt > 0 && amount >= debt) {
                releasablePayments[to].tokens += debt;
                releasablePayments[to].updatedDuration += uint64(
                    (debt * releasablePayments[to].duration) /
                        releasablePayments[to].releasableBalance
                );
                if (
                    releasablePayments[to].updatedDuration >
                    releasablePayments[to].duration
                )
                    releasablePayments[to].updatedDuration = releasablePayments[
                        to
                    ].duration;
            }
            if (debt > 0 && amount < debt) {
                releasablePayments[to].tokens += amount;
                releasablePayments[to].updatedDuration += uint64(
                    (amount * releasablePayments[to].duration) /
                        releasablePayments[to].releasableBalance
                );
            }
        }
        if (to == _fanToArtistStaking) {
            if (releasablePayments[from].releasableBalance > 0) {
                uint256 unlockedTokens = balanceOf(from) -
                    (releasablePayments[from].tokens -
                        releasablePayments[from].released);
                if (amount > unlockedTokens) {
                    uint256 excess = amount - unlockedTokens;
                    releasablePayments[from].tokens -= excess;
                    releasablePayments[from].updatedDuration -= uint64(
                        (excess * releasablePayments[from].duration) /
                            releasablePayments[from].releasableBalance
                    );
                }
            }
        }
        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount) external override onlyOwner {
        require(
            minted + amount <= max_mint,
            "W3T: Maximum limit of minable tokens reached"
        );
        _mint(to, amount);
        minted += amount;
    }

    function mint_and_lock(
        address _beneficiary,
        uint256 _amount,
        uint64 _start,
        uint64 _duration
    ) external override onlyOwner {
        require(
            _amount > 0,
            "Web3MusicNativeToken: Amount can not be 0 or less in mint_and_lock."
        );
        require(
            releasablePayments[_beneficiary].tokens == 0,
            "Web3MusicNativeToken: Releasable payment already used."
        );
        require(
            minted + _amount <= max_mint,
            "W3T: Maximum limit of minable tokens reached"
        );
        releasablePayments[_beneficiary] = ReleasablePayment(
            _amount,
            _amount,
            0,
            _start,
            _duration,
            _duration
        );
        _mint(_beneficiary, _amount);
        minted += _amount;
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

    function transfer_and_lock(
        address _beneficiary,
        uint256 _amount,
        uint64 _start,
        uint64 _duration
    ) external override onlyOwner {
        require(
            _amount > 0,
            "Web3MusicNativeToken: Amount can not be 0 or less in transfer_and_lock."
        );
        require(
            releasablePayments[_beneficiary].tokens == 0,
            "Web3MusicNativeToken: Releasable payment already used."
        );
        releasablePayments[_beneficiary] = ReleasablePayment(
            _amount,
            _amount,
            0,
            _start,
            _duration,
            _duration
        );
        transfer(_beneficiary, _amount);
        emit TokenLocked(_beneficiary, _amount);
    }

    // -------------------Debug Functions----------------------------------------------
    function getMinted() public view returns (uint256) {
        return minted;
    }

    function getReleasableBalance(
        address beneficiary
    ) public view returns (uint256) {
        return releasablePayments[beneficiary].releasableBalance;
    }

    function getReleasableTokens(
        address beneficiary
    ) public view returns (uint256) {
        return releasablePayments[beneficiary].tokens;
    }

    function updatedDuration(
        address beneficiary
    ) public view returns (uint256) {
        return releasablePayments[beneficiary].updatedDuration;
    }

    function duration(address beneficiary) public view returns (uint256) {
        return releasablePayments[beneficiary].duration;
    }
    // --------------------------------------------------------------------------------

    function release(address beneficiary) internal {
        uint256 amount = releasable(beneficiary);
        releasablePayments[beneficiary].released += amount;
        emit TokenReleased(beneficiary, amount);
    }

    function released(address beneficiary) public view returns (uint256) {
        return releasablePayments[beneficiary].released;
    }

    function releasable(address beneficiary) public view returns (uint256) {
        (, uint256 releasableTokens) = _vestingSchedule(
            releasablePayments[beneficiary],
            uint64(block.timestamp)
        ).trySub(released(beneficiary));
        return releasableTokens;
    }

    function _vestingSchedule(
        ReleasablePayment memory releasablePayment,
        uint64 timestamp
    ) private pure returns (uint256) {
        if (timestamp < releasablePayment.start) {
            return 0;
        } else if (
            timestamp >=
            releasablePayment.start + releasablePayment.updatedDuration
        ) {
            return releasablePayment.tokens;
        } else {
            return
                (releasablePayment.tokens *
                    (timestamp - releasablePayment.start)) /
                releasablePayment.updatedDuration;
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
