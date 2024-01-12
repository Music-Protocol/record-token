// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/utils/VotesUpgradeable.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract FanToArtistStaking is
    IFanToArtistStaking,
    Ownable2StepUpgradeable,
    VotesUpgradeable
{
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

    event newRewardLimit(uint oldlimit, uint newlimit);

    struct Stake {
        uint256 amount;
        uint40 start; //block.timestamp
        uint40 end;
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

    mapping(address => ArtistCheckpoint) private _artistCheckpoints;

    mapping(address => bool) private _verifiedArtists; // 0 never added | 1 addedd | else is the timestamp of removal

    uint40 private _minStakePeriod; //change onylOwner
    uint40 private _maxStakePeriod; //change onylOwner

    mapping(address => uint256) private _votingPower;

    uint256 private REWARD_LIMIT;
    uint256 private CHANGE_REWARD_LIMIT;

    function initialize(
        address Web3MusicNativeToken_,
        uint256 artistWeb3MusicNativeTokenRewardRate,
        uint40 min,
        uint40 max,
        uint limit_,
        uint changeRewardLimit_
    ) public initializer {
        require(
            Web3MusicNativeToken_ != address(0),
            "FanToArtistStaking: the Web3MusicNativeToken address can not be 0"
        );
        require(
            artistWeb3MusicNativeTokenRewardRate != 0,
            "FanToArtistStaking: the artist reward rate can not be 0"
        );
        require(max > min, "FanToArtistStaking: min cant be greater than max");
        _Web3MusicNativeToken = IWeb3MusicNativeToken(Web3MusicNativeToken_);
        _artistReward.push(
            ArtistReward({
                start: 0,
                end: (2 ** 40) - 1,
                rate: artistWeb3MusicNativeTokenRewardRate
            })
        );
        __Ownable_init();
        __Votes_init();
        _minStakePeriod = min;
        _maxStakePeriod = max;
        REWARD_LIMIT = limit_;
        CHANGE_REWARD_LIMIT = changeRewardLimit_;
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist],
            "FanToArtistStaking: the artist is not a verified artist"
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
        _calcSinceLastPosition(artist, 0, true);
        _Web3MusicNativeToken.pay(artist, _artistCheckpoints[artist].amountAcc);
        _artistCheckpoints[artist].amountAcc = 0;
    }

    function _calcSinceLastPosition(
        address artist,
        uint256 amount,
        bool isAdd
    ) internal {
        uint accumulator = 0;
        if (_artistCheckpoints[artist].tokenAmount != 0) {
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
                if (start < _artistCheckpoints[artist].lastRedeem)
                    start = _artistCheckpoints[artist].lastRedeem;
                if (_artistReward[index].end < start) break;

                accumulator += (_artistCheckpoints[artist].tokenAmount *
                    (end - start)).mulDiv(_artistReward[index].rate, 10e9);
            }
        }

        _artistCheckpoints[artist].amountAcc += accumulator;
        if (isAdd) _artistCheckpoints[artist].tokenAmount += amount;
        else _artistCheckpoints[artist].tokenAmount -= amount;

        _artistCheckpoints[artist].lastRedeem = uint40(block.timestamp);
    }

    function getReward(address artist) external {
        _getReward(artist);
    }

    function removeArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (_verifiedArtists[artist]) {
            _verifiedArtists[artist] = false;
            _getReward(artist);
            delete _artistCheckpoints[artist];
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
                CHANGE_REWARD_LIMIT <=
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
        uint oldlimit = REWARD_LIMIT;
        REWARD_LIMIT = limit_;
        emit newRewardLimit(oldlimit, REWARD_LIMIT);
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
        if (!_verifiedArtists[artist]) {
            _verifiedArtists[artist] = true;
            _artistCheckpoints[artist] = ArtistCheckpoint({
                amountAcc: 0,
                lastRedeem: uint40(block.timestamp),
                tokenAmount: 0
            });
            emit ArtistAdded(artist, sender);
        }
    }

    function transferOwnership(
        address to
    ) public override(IFanToArtistStaking, Ownable2StepUpgradeable) onlyOwner {
        super.transferOwnership(to);
    }

    function addStakes(
        address[] calldata artists,
        uint256[] calldata amounts,
        uint40[] calldata ends
    ) external {
        require(
            artists.length == amounts.length && amounts.length == ends.length,
            "FanToArtistStaking: calldata format error"
        );
        for (uint i = 0; i < artists.length; i++) {
            stake(artists[i], amounts[i], ends[i]);
        }
    }

    function stake(
        address artist,
        uint256 amount,
        uint40 end
    ) public onlyVerifiedArtist(artist) {
        require(
            !_isStakingNow(artist, _msgSender()),
            "FanToArtistStaking: already staking"
        );
        require(amount > 0, "FanToArtistStaking: the amount can not be zero");
        require(
            end > _minStakePeriod,
            "FanToArtistStaking: the end period is less than minimum"
        );
        require(
            end <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum"
        );
        if (_msgSender() != delegates(_msgSender())) {
            delegate(_msgSender());
        }
        if (_Web3MusicNativeToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()] = Stake({
                amount: amount,
                start: uint40(block.timestamp),
                end: uint40(block.timestamp + end)
            });
            _transferVotingUnits(address(0), _msgSender(), amount);
            _votingPower[_msgSender()] += amount;
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
        require(amount > 0, "FanToArtistStaking: the amount can not be zero");
        require(
            _stake[artist][_msgSender()].end - _minStakePeriod >=
                block.timestamp,
            "FanToArtistStaking: can not increase the amount below the minimum stake period"
        );
        if (_Web3MusicNativeToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()].amount += amount;
            _transferVotingUnits(address(0), _msgSender(), amount);
            _votingPower[_msgSender()] += amount;
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

        _stake[newArtist][_msgSender()] = Stake({
            amount: _stake[artist][_msgSender()].amount,
            start: uint40(block.timestamp),
            end: _stake[artist][_msgSender()].end
        });

        _calcSinceLastPosition(
            newArtist,
            _stake[newArtist][_msgSender()].amount,
            true
        );

        _calcSinceLastPosition(
            artist,
            _stake[artist][_msgSender()].amount,
            false
        );

        delete _stake[artist][_msgSender()];

        emit StakeChangedArtist(artist, _msgSender(), newArtist);
    }

    function redeem(
        address artist,
        address user
    ) external onlyEnded(_stake[artist][user].end) {
        require(
            _isStakingNow(artist, user),
            "FanToArtistStaking: stake not found"
        );
        require(
            _Web3MusicNativeToken.transfer(user, _stake[artist][user].amount),
            "FanToArtistStaking: error while redeeming"
        );
        if (_verifiedArtists[artist]) {
            _calcSinceLastPosition(artist, _stake[artist][user].amount, false);
        }
        _transferVotingUnits(user, address(0), _stake[artist][user].amount);
        _votingPower[user] -= _stake[artist][user].amount;
        delete _stake[artist][user];
        emit StakeRedeemed(artist, user);
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist];
    }

    // ----------VOTING POWER------------------

    function getTotalSupply() external view returns (uint256) {
        return _getTotalSupply();
    }

    function getPastTotalSupply(
        uint256 blockNumber
    )
        public
        view
        override(IFanToArtistStaking, VotesUpgradeable)
        returns (uint256)
    {
        return super.getPastTotalSupply(blockNumber);
    }

    function getVotes(
        address account
    )
        public
        view
        override(IFanToArtistStaking, VotesUpgradeable)
        returns (uint256)
    {
        return super.getVotes(account);
    }

    function getPastVotes(
        address account,
        uint256 blockNumber
    )
        public
        view
        override(IFanToArtistStaking, VotesUpgradeable)
        returns (uint256)
    {
        return super.getPastVotes(account, blockNumber);
    }

    function _getVotingUnits(
        address account
    ) internal view virtual override returns (uint256) {
        return _votingPower[account];
    }

    //When a DAO member want to vote he must delegate himself
    function delegate(address delegatee) public override {
        require(
            _msgSender() == delegatee,
            "F2A: users cannot delegate other accounts."
        );
        super.delegate(delegatee);
    }
}
