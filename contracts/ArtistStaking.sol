// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/utils/VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./interfaces/IMusicProtocolRECORDToken.sol";
import "./interfaces/IArtistStaking.sol";

contract ArtistStaking is
    IArtistStaking,
    Ownable2StepUpgradeable,
    VotesUpgradeable,
    UUPSUpgradeable
{
    using MathUpgradeable for uint256;

    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistPaid(address indexed artist, uint256 amount);

    event ArtistMusicProtocolRECORDTokenRewardChanged(
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
        uint256 amount
    );
    event StakeChangedArtist(
        address indexed artist,
        address indexed sender,
        address indexed newArtist
    );

    event newRewardLimit(uint256 oldlimit, uint256 newlimit);

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

    IMusicProtocolRECORDToken private _MusicProtocolRECORDToken;

    mapping(address => mapping(address => Stake)) private _stake;
    //_stake[artist][staker]
    //                      = Stake[]
    //                      .push(new Stake)

    mapping(address => ArtistCheckpoint) private _artistCheckpoints;

    mapping(address => bool) private _verifiedArtists; // 0 never added | 1 addedd | else is the timestamp of removal

    uint40 private _minStakePeriod;
    uint40 private _maxStakePeriod;

    mapping(address => uint256) private _votingPower;

    uint256 private _rewardLimit;
    uint256 private _changeRewardLimit;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address MusicProtocolRECORDToken_,
        uint256 artistMusicProtocolRECORDTokenRewardRate,
        uint40 min,
        uint40 max,
        uint256 limit_,
        uint256 changeRewardLimit_
    ) public initializer {
        require(
            MusicProtocolRECORDToken_ != address(0),
            "ArtistStaking: the MusicProtocolRECORDToken address can not be 0"
        );
        require(
            artistMusicProtocolRECORDTokenRewardRate != 0,
            "ArtistStaking: the artist reward rate can not be 0"
        );
        require(
            limit_ > 0,
            "ArtistStaking: the reward limit must be greater than 0"
        );
        require(
            changeRewardLimit_ >= 600,
            "ArtistStaking: the minimum time to change the reward rate is 10 minutes"
        );
        require(max > min, "ArtistStaking: min cant be greater than max");
        _MusicProtocolRECORDToken = IMusicProtocolRECORDToken(MusicProtocolRECORDToken_);
        _artistReward.push(
            ArtistReward({
                start: uint40(block.timestamp),
                end: (2 ** 40) - 1,
                rate: artistMusicProtocolRECORDTokenRewardRate
            })
        );
        __Ownable2Step_init();
        __Votes_init();
        _minStakePeriod = min;
        _maxStakePeriod = max;
        _rewardLimit = limit_;
        _changeRewardLimit = changeRewardLimit_;
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist],
            "ArtistStaking: the artist is not a verified artist"
        );
        _;
    }

    modifier onlyEnded(uint40 end) {
        require(
            end < block.timestamp,
            "ArtistStaking: the stake is not ended"
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
        _MusicProtocolRECORDToken.pay(artist, _artistCheckpoints[artist].amountAcc);
        _artistCheckpoints[artist].amountAcc = 0;
    }

    function _calcSinceLastPosition(
        address artist,
        uint256 amount,
        bool isAdd
    ) internal {
        uint256 accumulator = 0;
        if (
            _artistCheckpoints[artist].tokenAmount != 0 &&
            _verifiedArtists[artist] //The artist accumulates tokens only if he is verified
        ) {
            for (
                uint256 i = 0;
                i < _rewardLimit && _artistReward.length - i > 0;
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
            _getReward(artist); //Before removing it, the tokens it has earned are conferred
            _verifiedArtists[artist] = false;
            emit ArtistRemoved(artist, sender);
        }
    }

    function changeArtistRewardRate(
        uint256 rate,
        address sender
    ) external onlyOwner {
        require(
            rate != 0,
            "ArtistStaking: the artist reward rate can not be 0"
        );
        require(
            _artistReward[_artistReward.length - 1].start +
                _changeRewardLimit <=
                block.timestamp,
            "ArtistStaking: the artist reward cannot be changed yet"
        );
        _artistReward[_artistReward.length - 1].end = uint40(block.timestamp);
        _artistReward.push(
            ArtistReward({
                start: uint40(block.timestamp),
                end: (2 ** 40) - 1,
                rate: rate
            })
        );
        emit ArtistMusicProtocolRECORDTokenRewardChanged(
            rate,
            uint40(block.timestamp),
            sender
        );
    }

    function changeArtistRewardLimit(uint256 limit_) external onlyOwner {
        uint256 oldlimit = _rewardLimit;
        _rewardLimit = limit_;
        emit newRewardLimit(oldlimit, _rewardLimit);
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
            "ArtistStaking: the artist address can not be 0"
        );
        if (!_verifiedArtists[artist]) {
            //Check if the artist is already verified
            if (_artistCheckpoints[artist].lastRedeem == 0) {
                //If it is not verified, and it has never been verified
                _verifiedArtists[artist] = true;
                _artistCheckpoints[artist] = ArtistCheckpoint({ //It creates the ArtistCheckpoint
                    amountAcc: 0,
                    lastRedeem: uint40(block.timestamp),
                    tokenAmount: 0
                });
                emit ArtistAdded(artist, sender);
            }
            if (
                _artistCheckpoints[artist].lastRedeem != 0 //If it is not verified but has already been verified
            ) {
                _verifiedArtists[artist] = true;
                _artistCheckpoints[artist].lastRedeem = uint40(block.timestamp); //It changes the value of lastRedeem to not calculate the time period when it was not verified
                emit ArtistAdded(artist, sender);
            }
        }
    }

    function transferOwnership(
        address to
    ) public override(IArtistStaking, Ownable2StepUpgradeable) onlyOwner {
        super.transferOwnership(to);
    }

    function addStakes(
        address[] calldata artists,
        uint256[] calldata amounts,
        uint40[] calldata ends
    ) external {
        require(
            artists.length == amounts.length && amounts.length == ends.length,
            "ArtistStaking: calldata format error"
        );
        for (uint256 i = 0; i < artists.length; i++) {
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
            "ArtistStaking: already staking"
        );
        require(amount > 0, "ArtistStaking: the amount can not be zero");
        require(
            end > _minStakePeriod,
            "ArtistStaking: the end period is less than minimum"
        );
        require(
            end <= _maxStakePeriod,
            "ArtistStaking: the stake period exceed the maximum"
        );
        if (_msgSender() != delegates(_msgSender())) {
            delegate(_msgSender());
        }
        if (_MusicProtocolRECORDToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()] = Stake({
                amount: amount,
                start: uint40(block.timestamp),
                end: uint40(block.timestamp) + end
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

    function increaseAmountStaked(
        address artist,
        uint256 amount
    ) external onlyVerifiedArtist(artist) {
        require(
            _isStakingNow(artist, _msgSender()),
            "ArtistStaking: no stake found"
        );
        require(amount > 0, "ArtistStaking: the amount can not be zero");
        require(
            _stake[artist][_msgSender()].end - _minStakePeriod >=
                block.timestamp,
            "ArtistStaking: can not increase the amount below the minimum stake period"
        );
        if (_MusicProtocolRECORDToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()].amount += amount;
            _transferVotingUnits(address(0), _msgSender(), amount);
            _votingPower[_msgSender()] += amount;
            _calcSinceLastPosition(artist, amount, true);
            emit StakeIncreased(artist, _msgSender(), amount);
        }
    }

    function extendStake(
        address artist,
        uint40 newEnd
    ) external onlyVerifiedArtist(artist) {
        require(
            _isStakingNow(artist, _msgSender()),
            "ArtistStaking: no stake found"
        );
        require(
            _stake[artist][_msgSender()].end > block.timestamp,
            "ArtistStaking: last stake cant be changed"
        );
        require(
            _minStakePeriod <= newEnd && newEnd <= _maxStakePeriod,
            "ArtistStaking: the stake period exceed the maximum or less than minimum"
        );
        require(
            _stake[artist][_msgSender()].end + newEnd <
                block.timestamp + _maxStakePeriod,
            "ArtistStaking: the new stake period exceeds the maximum"
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
            "ArtistStaking: no stake found"
        );
        require(
            !_isStakingNow(newArtist, _msgSender()),
            "ArtistStaking: already staking the new artist"
        );
        require(
            _stake[artist][_msgSender()].end > block.timestamp,
            "ArtistStaking: last stake cant be changed"
        );
        require(
            artist != newArtist,
            "ArtistStaking: the new artist is the same as the old one"
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

    function redeemStakes(
        address[] calldata artists
    ) external {
        require(
            artists.length != 0,
            "ArtistStaking: calldata format error"
        );
        for (uint256 i = 0; i < artists.length; i++) {
            redeem(artists[i]);
        }
    }

    function redeem(
        address artist
    ) public onlyEnded(_stake[artist][_msgSender()].end) {
        require(
            _isStakingNow(artist, _msgSender()),
            "ArtistStaking: stake not found"
        );
        require(
            _MusicProtocolRECORDToken.transfer(_msgSender(), _stake[artist][_msgSender()].amount),
            "ArtistStaking: error while redeeming"
        );
        _calcSinceLastPosition(artist, _stake[artist][_msgSender()].amount, false);
        _transferVotingUnits(_msgSender(), address(0), _stake[artist][_msgSender()].amount);
        _votingPower[_msgSender()] -= _stake[artist][_msgSender()].amount;
        delete _stake[artist][_msgSender()];
        emit StakeRedeemed(artist, _msgSender());
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
        override(IArtistStaking, VotesUpgradeable)
        returns (uint256)
    {
        return super.getPastTotalSupply(blockNumber);
    }

    function getVotes(
        address account
    )
        public
        view
        override(IArtistStaking, VotesUpgradeable)
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
        override(IArtistStaking, VotesUpgradeable)
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
    function _delegate(address account, address delegatee) internal override {
        require(
            account == delegatee,
            "ArtistStaking: users cannot delegate other accounts."
        );
        super._delegate(account, delegatee);
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}
}
