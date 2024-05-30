// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IMusicProtocolRECORDToken.sol";

contract MusicProtocolRECORDToken is
    IMusicProtocolRECORDToken,
    ERC20,
    Ownable2Step,
    Pausable
{
    uint256 private constant MAX_MINT = 1000000000000000000000000000;
    uint256 public minted = 0;
    address private immutable _ArtistStaking;
    mapping(address => ReleasablePayment) public releasablePayments;

    struct ReleasablePayment {
        uint256 releasableBalance;
        uint256 tokens;
        uint256 released;
        uint64 start;
        uint64 duration;
        uint64 updatedDuration;
    }

    event TokenReleased(address indexed beneficiary, uint256 amount);
    event TokenLocked(address indexed sender, address indexed beneficiary, uint256 amount);
    event SenderReleasablePaymentUpdate(
        uint256 indexed senderToken,
        uint64 indexed senderUpdatedDuration
    );
    event RecipientReleasablePaymentUpdate(
        uint256 indexed recipientToken,
        uint64 indexed recipientUpdatedDuration
    );

    //for the function callable only by ArtistStaking.sol
    modifier onlyStaking() {
        require(
            _ArtistStaking == _msgSender(),
            "MusicProtocolRECORDToken: caller is not the ArtistStaking contract"
        );
        _;
    }

    constructor(address staking_) ERC20("MusicProtocolRECORDToken", "RECORD") {
        require(
            staking_ != address(0),
            "MusicProtocolRECORDToken: the address of ArtistStaking is 0"
        );
        _ArtistStaking = staking_;
    }

    function transferOwnership(
        address to
    ) public override(IMusicProtocolRECORDToken, Ownable2Step) onlyOwner {
        super.transferOwnership(to);
    }

    function renounceOwnership() public override(Ownable) onlyOwner {
        require(
            false, 
            "MusicProtocolRECORDToken: function disabled"
        );
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
    ) internal virtual override whenNotPaused {

        //Sender address has enough tokens
        if (balanceOf(from) >= amount) {

            //Sender address has received a phased release of tokens
            if (releasablePayments[from].releasableBalance > 0) {

                _release(from); //Release of earned tokens

                //It's not a mint, it's not a stake and it's not a redeem: TRANSFER
                if (from != address(0) && to != _ArtistStaking && from != _ArtistStaking) {
                    //Calculating the tokens actually held:
                    uint256 ownedTokens = balanceOf(from) - 
                        (releasablePayments[from].tokens -
                            releasablePayments[from].released);
                    //To continue the transaction, it checks that the tokens actually held are greater than those sent:
                    require(
                        ownedTokens >= amount, 
                        "MusicProtocolRECORDToken: transfer amount exceeds balance"
                    );
                }

                //It's a transfer to the stake: STAKE
                if (to == _ArtistStaking) {
                    //Calculating the tokens actually held:
                    uint256 ownedTokens = balanceOf(from) - 
                        (releasablePayments[from].tokens - 
                            releasablePayments[from].released); 
                    if (
                        amount > ownedTokens
                    ) {
                        uint256 debt = amount - ownedTokens;
                        releasablePayments[from].tokens -= debt;
                        releasablePayments[from].updatedDuration -= uint64(
                            (debt * releasablePayments[from].duration) /
                                releasablePayments[from].releasableBalance
                        );
                        emit SenderReleasablePaymentUpdate(
                            releasablePayments[from].tokens, 
                            releasablePayments[from].updatedDuration
                        );
                    }
                }
            }

            //If a user who has received a gradual release of tokens does a REDEEM:
            if (
                from == _ArtistStaking && //It's a redeem, it is sent by the ArtistStaking contract
                releasablePayments[to].releasableBalance > 0 //The recipient address received a phased release of tokens
            )   {
                //Calculating the possible debt:
                uint256 debt = releasablePayments[to].releasableBalance -
                    releasablePayments[to].tokens;
                //It checks if there is a debt
                if (debt > 0) { //It checks if there is a debt is greater or equal than amount:
                    if (amount >= debt) {
                        //Allocate tokens within releasable payment, only the amount of debit tokens are included in the gradual payment
                        releasablePayments[to].tokens += debt; 
                        //Update the duration
                        releasablePayments[to].updatedDuration += uint64( 
                            (debt * releasablePayments[to].duration) /
                                releasablePayments[to].releasableBalance
                        );
                    } else { //If this debt is less than amount:
                        //Allocate tokens within releasable payment
                        releasablePayments[to].tokens += amount;
                        //Update the duration
                        releasablePayments[to].updatedDuration += uint64( 
                            (amount * releasablePayments[to].duration) /
                                releasablePayments[to].releasableBalance
                        );
                    }
                    emit RecipientReleasablePaymentUpdate(
                        releasablePayments[to].tokens, 
                        releasablePayments[to].updatedDuration
                    );
                }
            }
        }

        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount) external override onlyOwner {
        require(
            minted + amount <= MAX_MINT,
            "MusicProtocolRECORDToken: Maximum limit of mintable tokens reached"
        );
        minted += amount;
        _mint(to, amount);
    }

    function mint_and_lock(
        address _beneficiary,
        uint256 _amount,
        uint64 _start,
        uint64 _duration
    ) external override onlyOwner {
        require(
            _amount > 0,
            "MusicProtocolRECORDToken: Amount can not be 0 or less in mint_and_lock."
        );
        require(
            releasablePayments[_beneficiary].releasableBalance == 0,
            "MusicProtocolRECORDToken: Releasable payment already used."
        );
        require(
            minted + _amount <= MAX_MINT,
            "MusicProtocolRECORDToken: Maximum limit of mintable tokens reached"
        );
        require(
            _start >= block.timestamp, 
            "MusicProtocolRECORDToken: Releasable payment cannot begin in the past"
        );
        require(
            _duration >= 600, 
            "MusicProtocolRECORDToken: The duration of releasable payment must be at least 10 minutes"
        );
        releasablePayments[_beneficiary] = ReleasablePayment(
            _amount,
            _amount,
            0,
            _start,
            _duration,
            _duration
        );
        minted += _amount;
        _mint(_beneficiary, _amount);
        emit TokenLocked(address(0), _beneficiary, _amount);
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
        address _from,
        address _beneficiary,
        uint256 _amount,
        uint64 _start,
        uint64 _duration
    ) external override onlyOwner {
        require(
            _amount > 0,
            "MusicProtocolRECORDToken: Amount can not be 0 or less in transfer_and_lock."
        );
        require(
            releasablePayments[_beneficiary].releasableBalance == 0,
            "MusicProtocolRECORDToken: Releasable payment already used."
        );
        require(
            _start >= block.timestamp, 
            "MusicProtocolRECORDToken: Releasable payment cannot begin in the past"
        );
        require(
            _duration >= 600, 
            "MusicProtocolRECORDToken: The duration of releasable payment must be at least 10 minutes"
        );
        releasablePayments[_beneficiary] = ReleasablePayment(
            _amount,
            _amount,
            0,
            _start,
            _duration,
            _duration
        );
        transferFrom(_from, _beneficiary, _amount);
        emit TokenLocked(_from, _beneficiary, _amount);
    }

    function _release(address beneficiary) internal {
        uint256 amount = releasable(beneficiary);
        releasablePayments[beneficiary].released += amount;
        emit TokenReleased(beneficiary, amount);
    }

    function released(address beneficiary) public view returns (uint256) {
        return releasablePayments[beneficiary].released;
    }

    function releasable(address beneficiary) public view returns (uint256) {
        uint256 releasableTokens = _vestingSchedule(
            releasablePayments[beneficiary],
            uint64(block.timestamp)
        ) - released(beneficiary);
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

    //Safe since it can be called only by ArtistStaking, could add a mapping(address => amount) to check if someone is unlocking more than what he previously locked
    function lock(
        address from,
        uint256 amount
    ) external override onlyStaking returns (bool) {
        transferFrom(from, _msgSender(), amount);
        return true;
    }

    function pay(address to, uint256 amount) external override onlyStaking {
        _mint(to, amount);
    }
}
