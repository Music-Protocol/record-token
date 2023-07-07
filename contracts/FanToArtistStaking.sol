// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract FanToArtistStaking is IFanToArtistStaking, Ownable, Initializable {
    using Math for uint256;

    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistPaid(address indexed artist, uint256 amount);

    event ArtistWeb3MusicNativeTokenRewardChanged(
        uint256 newRate,
        uint40 timestamp,
        address indexed sender
    );
    event StakeCreated(
        address indexed artist,
        address indexed sender,
        uint256 amount,
        uint40 end
    );
    event StakeEndChanged(
        address indexed artist,
        address indexed sender,
        uint40 end
    );
    event StakeRedeemed(address indexed artist, address indexed sender);
    event StakeIncreased(
        address indexed artist,
        address indexed sender,
        uint amount
    );
    event StakeChangedArtist(
        address indexed artist,
        address indexed sender,
        address indexed newArtist
    );

    struct Stake {
        uint256 amount;
        uint40 start; //block.timestamp
        uint40 end;
        bool redeemed;
    }

    struct ArtistReward {
        uint256 rate;
        uint40 start;
        uint40 end;
    }

    struct ArtistCheckpoint {
        uint256 tokenAmount;
        uint40 lastRedeem;
        uint256 amountAcc;
    }

    ArtistReward[] private _artistReward;
    // to track all the

    IWeb3MusicNativeToken private _Web3MusicNativeToken;

    mapping(address => mapping(address => Stake)) private _stake;
    //_stake[artist][staker]
    //                      = Stake[]
    //                      .push(new Stake)

    mapping(address => ArtistCheckpoint) private _artistCheckoints;

    mapping(address => uint40) private _verifiedArtists; // 0 never added | 1 addedd | else is the timestamp of removal

    uint256 private _veWeb3MusicNativeTokenRewardRate; //change onylOwner
    uint40 private _minStakePeriod; //change onylOwner
    uint40 private _maxStakePeriod; //change onylOwner

    mapping(address => uint256) private _votingPower;
    uint256 private _totalVotingPower;

    address private _offChain;

    uint256 private REWARD_LIMIT;
    uint256 private CHANGE_REWARD_LIMIT;

    function initialize(
        address Web3MusicNativeToken_,
        address offChain_,
        uint256 veWeb3MusicNativeTokenRewardRate,
        uint256 artistWeb3MusicNativeTokenRewardRate,
        uint40 min,
        uint40 max,
        uint limit_
    ) public initializer {
        require(
            Web3MusicNativeToken_ != address(0),
            "FanToArtistStaking: the Web3MusicNativeToken address can not be 0"
        );
        require(
            offChain_ != address(0),
            "FanToArtistStaking: the offChain address can not be 0"
        );
        require(
            artistWeb3MusicNativeTokenRewardRate != 0,
            "FanToArtistStaking: the artist reward rate can not be 0"
        );
        require(
            veWeb3MusicNativeTokenRewardRate != 0,
            "FanToArtistStaking: the voting reward rate can not be 0"
        );
        require(max > min, "FanToArtistStaking: min cant be greater than max");
        _Web3MusicNativeToken = IWeb3MusicNativeToken(Web3MusicNativeToken_);
        _veWeb3MusicNativeTokenRewardRate = veWeb3MusicNativeTokenRewardRate;
        _artistReward.push(
            ArtistReward({
                start: 0,
                end: (2 ** 40) - 1,
                rate: artistWeb3MusicNativeTokenRewardRate
            })
        );
        _minStakePeriod = min;
        _maxStakePeriod = max;
        _offChain = offChain_;
        REWARD_LIMIT = limit_;
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist] == 1,
            "FanToArtistStaking: the artist is not a verified artist"
        );
        _;
    }

    modifier onlyOffChain() {
        require(
            _msgSender() == _offChain,
            "FanToArtistStaking: the caller is not offchain"
        );
        _;
    }

    modifier onlyNotEnded(uint40 end) {
        require(
            block.timestamp < end,
            "FanToArtistStaking: the stake is already ended"
        );
        _;
    }

    modifier onlyEnded(uint40 end) {
        require(
            end < block.timestamp,
            "FanToArtistStaking: the stake is not ended"
        );
        _;
    }

    function _isStakingNow(
        address artist,
        address sender
    ) internal view returns (bool) {
        return _stake[artist][sender].end != 0;
    }

    function _getReward(address artist) internal {
        console.log("GET REWARD");

        _calcSinceLastPosition(artist, 0, true);
        _Web3MusicNativeToken.pay(artist, _artistCheckoints[artist].amountAcc);
        _artistCheckoints[artist].amountAcc = 0;
    }

    function _calcSinceLastPosition(
        address artist,
        uint256 amount,
        bool isAdd
    ) internal {
        console.log(
            "entering with amount ",
            _artistCheckoints[artist].amountAcc
        );
        console.log(
            "entering with token ",
            _artistCheckoints[artist].tokenAmount
        );
        uint accumulator = 0;
        if (_artistCheckoints[artist].tokenAmount != 0) {
            for (
                uint i = 0;
                i < REWARD_LIMIT && _artistReward.length - i > 0;
                i++
            ) {
                uint256 index = _artistReward.length - i - 1;
                uint40 start = _artistReward[index].start;
                uint40 end = uint40(block.timestamp);

                if (end > _artistReward[index].end)
                    end = _artistReward[index].end;
                if (start < _artistCheckoints[artist].lastRedeem)
                    start = _artistCheckoints[artist].lastRedeem;
                if (_artistReward[index].end < start) break;
                console.log("duration ", end - start);
                console.log("amount ", _artistCheckoints[artist].tokenAmount);
                console.log("rate ", _artistReward[index].rate);

                accumulator += (_artistCheckoints[artist].tokenAmount *
                    (end - start)).mulDiv(_artistReward[index].rate, 10e9);
            }
        }

        _artistCheckoints[artist].amountAcc += accumulator;
        if (isAdd) _artistCheckoints[artist].tokenAmount += amount;
        else _artistCheckoints[artist].tokenAmount -= amount;

        _artistCheckoints[artist].lastRedeem = uint40(block.timestamp);
        console.log("accumulator ", accumulator);

        console.log(
            "finishing with amount ",
            _artistCheckoints[artist].amountAcc
        );
        console.log(
            "finishing with token ",
            _artistCheckoints[artist].tokenAmount
        );
        console.log("");

        // console.log("OUT ", _artistCheckoints[artist].tokenAmount);
    }

    function getReward(address artist) external {
        _getReward(artist);
    }

    function removeArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (_verifiedArtists[artist] == 1) {
            _verifiedArtists[artist] = uint40(block.timestamp);
            emit ArtistRemoved(artist, sender);
        }
    }

    function changeArtistRewardRate(
        uint256 rate,
        address sender
    ) external onlyOwner {
        require(
            rate != 0,
            "FanToArtistStaking: the artist reward rate can not be 0"
        );
        require(
            _artistReward[_artistReward.length - 1].start +
                CHANGE_REWARD_LIMIT >=
                block.timestamp,
            "FanToArtistStaking: the artist reward cannot be changed yet"
        );
        _artistReward[_artistReward.length - 1].end = uint40(block.timestamp);
        _artistReward.push(
            ArtistReward({
                start: uint40(block.timestamp),
                end: (2 ** 40) - 1,
                rate: rate
            })
        );
        emit ArtistWeb3MusicNativeTokenRewardChanged(
            rate,
            uint40(block.timestamp),
            sender
        );
    }

    function changeArtistRewardLimit(uint limit_) external onlyOwner {
        REWARD_LIMIT = limit_;
    }

    function getStakingVeRate() external view returns (uint256) {
        return _veWeb3MusicNativeTokenRewardRate;
    }

    function getArtistRewardRate() external view returns (uint256) {
        return _artistReward[_artistReward.length - 1].rate;
    }

    function addArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        require(
            artist != address(0),
            "FanToArtistStaking: the artist address can not be 0"
        );
        if (_verifiedArtists[artist] != 1) {
            _verifiedArtists[artist] = 1;
            _artistCheckoints[artist] = ArtistCheckpoint({
                amountAcc: 0,
                lastRedeem: uint40(block.timestamp),
                tokenAmount: 0
            });
            emit ArtistAdded(artist, sender);
        }
    }

    function transferOwnership(
        address to
    ) public override(IFanToArtistStaking, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function stake(
        address artist,
        uint256 amount,
        uint40 end
    ) external onlyVerifiedArtist(artist) {
        console.log("STAKE");

        require(
            !_isStakingNow(artist, _msgSender()),
            "FanToArtistStaking: already staking"
        );
        require(
            end > _minStakePeriod,
            "FanToArtistStaking: the end period is less than minimum"
        );
        require(
            end <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum"
        );
        if (_Web3MusicNativeToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()] = Stake({
                amount: amount,
                start: uint40(block.timestamp),
                end: uint40(block.timestamp + end),
                redeemed: false
            });
            _calcSinceLastPosition(artist, amount, true);
            emit StakeCreated(
                artist,
                _msgSender(),
                amount,
                uint40(block.timestamp) + end
            );
        }
    }

    function increaseAmountStaked(address artist, uint256 amount) external {
        require(
            _isStakingNow(artist, _msgSender()),
            "FanToArtistStaking: no stake found"
        );
        require(
            _stake[artist][_msgSender()].end - _minStakePeriod >=
                block.timestamp,
            "FanToArtistStaking: can not increase the amount below the minimum stake period"
        );
        if (_Web3MusicNativeToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()].amount += amount;
            _calcSinceLastPosition(artist, amount, true);
            emit StakeIncreased(artist, _msgSender(), amount);
        }
    }

    function extendStake(address artist, uint40 newEnd) external {
        require(
            _isStakingNow(artist, _msgSender()),
            "FanToArtistStaking: no stake found"
        );
        require(
            _stake[artist][_msgSender()].end > block.timestamp,
            "FanToArtistStaking: last stake cant be changed"
        );
        require(
            _minStakePeriod <= newEnd && newEnd <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum or less than minimum"
        );
        require(
            _stake[artist][_msgSender()].end + newEnd <
                block.timestamp + _maxStakePeriod,
            "FanToArtistStaking: the new stake period exceeds the maximum"
        );
        _stake[artist][_msgSender()].end += newEnd;
        emit StakeEndChanged(
            artist,
            _msgSender(),
            _stake[artist][_msgSender()].end
        );
    }

    function changeArtistStaked(
        address artist,
        address newArtist
    ) external onlyVerifiedArtist(newArtist) {
        require(
            _isStakingNow(artist, _msgSender()),
            "FanToArtistStaking: no stake found"
        );
        require( //TODO this can be improved, increase instead of revert???
            !_isStakingNow(newArtist, _msgSender()),
            "FanToArtistStaking: already staking the new artist"
        );
        require(
            _stake[artist][_msgSender()].end > block.timestamp,
            "FanToArtistStaking: last stake cant be changed"
        );
        require(
            artist != newArtist,
            "FanToArtistStaking: the new artist is the same as the old one"
        );

        _stake[artist][_msgSender()] = Stake({
            amount: _stake[artist][_msgSender()].amount,
            start: uint40(block.timestamp),
            end: _stake[artist][_msgSender()].end,
            redeemed: false
        });

        _calcSinceLastPosition(
            artist,
            _stake[newArtist][_msgSender()].amount,
            false
        );
        _calcSinceLastPosition(
            newArtist,
            _stake[newArtist][_msgSender()].amount,
            true
        );
        delete _stake[artist][_msgSender()];

        emit StakeChangedArtist(artist, _msgSender(), newArtist);
    }

    function redeem(
        address artist,
        address user
    ) external onlyEnded(_stake[artist][user].end) {
        console.log("REDEEM");

        require(
            _isStakingNow(artist, user),
            "FanToArtistStaking: stake not found"
        );
        require(
            !_stake[artist][user].redeemed,
            "FanToArtistStaking: this stake has already been redeemed"
        );
        require(
            _Web3MusicNativeToken.transfer(user, _stake[artist][user].amount),
            "FanToArtistStaking: error while redeeming"
        );
        _calcSinceLastPosition(artist, _stake[artist][user].amount, false);
        delete _stake[artist][user];
        emit StakeRedeemed(artist, user);
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist] == 1;
    }

    // ----------VOTING POWER------------------

    function totalVotingPower() external view returns (uint256) {
        return _totalVotingPower;
    }

    function votingPowerOf(address user) external view returns (uint256) {
        return _votingPower[user];
    }

    function setTotalVotingPower(uint totalVotingPower_) external onlyOffChain {
        _totalVotingPower = totalVotingPower_;
    }

    function setVotingPowerOf(
        address[] memory user,
        uint[] memory amount
    ) external onlyOffChain {
        require(
            user.length > 0 && user.length == amount.length,
            "FanToArtistStaking: input validation failed, check the lengths of the arrays"
        );
        for (uint i = 0; i < user.length; i++) {
            _votingPower[user[i]] = amount[i];
        }
    }

    function changeOffChain(address offChain_) external onlyOffChain {
        require(
            offChain_ != address(0),
            "FanToArtistStaking: address can not be 0"
        );
        _offChain = offChain_;
    }

    // ----------DEXLReward------------------
}
