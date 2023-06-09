// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "hardhat/console.sol";

contract FanToArtistStaking is IFanToArtistStaking, Ownable, Initializable {
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
        uint256 index,
        uint40 end
    );
    event StakeEndChanged(
        address indexed artist,
        address indexed sender,
        uint256 index,
        uint40 end
    );
    event StakeRedeemed(
        address indexed artist,
        address indexed sender,
        uint end
    );

    struct Stake {
        uint256 amount;
        uint40 start; //block.timestamp
        uint40 end;
        uint40 lastPayment;
        bool redeemed;
    }

    struct ArtistReward {
        uint256 rate;
        uint40 start;
        uint40 end;
    }

    ArtistReward[] private _artistReward;
    // to track all the

    IWeb3MusicNativeToken private _Web3MusicNativeToken;

    mapping(address => mapping(address => Stake[])) private _stake;
    //_stake[artist][staker]
    //                      = Stake[]
    //                      .push(new Stake)

    mapping(address => uint40) private _verifiedArtists; // 0 never added | 1 addedd | else is the timestamp of removal

    uint256 private _veWeb3MusicNativeTokenRewardRate; //change onylOwner
    uint40 private _minStakePeriod; //change onylOwner
    uint40 private _maxStakePeriod; //change onylOwner

    mapping(address => uint256) private _votingPower;
    uint256 private _totalVotingPower;

    address private _offChain;

    function initialize(
        address Web3MusicNativeToken_,
        address offChain_,
        uint256 veWeb3MusicNativeTokenRewardRate,
        uint256 artistWeb3MusicNativeTokenRewardRate,
        uint40 min,
        uint40 max
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

    modifier validateIndex(
        address artist,
        address user,
        uint index
    ) {
        require(
            index < _stake[artist][_msgSender()].length,
            "FanToArtistStaking: no stake found with this index"
        );
        _;
    }

    function transferOwnership(
        address to
    ) public override(IFanToArtistStaking, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function _isStakingNow(
        address sender,
        address artist
    ) internal view returns (bool) {
        uint len = _stake[artist][sender].length;
        return (len > 0 &&
            _stake[artist][sender][len - 1].end > block.timestamp);
    }

    function _addStake(
        address sender,
        address artist,
        uint256 amount,
        uint40 end
    ) internal {
        _stake[artist][sender].push(
            Stake({
                amount: amount,
                start: uint40(block.timestamp),
                end: uint40(block.timestamp) + end,
                lastPayment: 0,
                redeemed: false
            })
        );
    }

    // Function replaced by passign index of reward as parameter
    // 
    // function _getRewardRateBinarySearch(
    //     uint target
    // ) internal view returns (uint) {
    //     uint min = 0;
    //     uint max = _artistReward.length - 1;
    //     while (min <= max) {
    //         uint mid = (min + max) / 2;
    //         if (
    //             _artistReward[mid].start < target &&
    //             _artistReward[mid].end > target
    //         ) return mid;
    //         else if (_artistReward[mid].end < target) min = mid + 1;
    //         else if (_artistReward[mid].start > target) max = mid - 1;
    //         else require(false, "binarysearch error");
    //     }
    //     return 0;
    // }

    function _getSingleReward(
        address artist,
        address user,
        uint stakeIndex,
        uint rewardIndex,
        uint rewardDeep
    ) internal returns (uint) {
        require(
            _stake[artist][user][stakeIndex].lastPayment <
                _stake[artist][user][stakeIndex].end,
            "FanToArtistStaking: a stake was already redeemed completely"
        );
        uint accumulator = 0;
        if (_stake[artist][user][stakeIndex].lastPayment == 0)
            require(
                (_artistReward[rewardIndex].start <=
                    _stake[artist][user][stakeIndex].start) &&
                    (_artistReward[rewardIndex].end >=
                        _stake[artist][user][stakeIndex].start),
                "FanToArtistStaking: the reward index provided was wrong"
            );
        else
            require(
                (_artistReward[rewardIndex].start <=
                    _stake[artist][user][stakeIndex].lastPayment) &&
                    (_artistReward[rewardIndex].end >=
                        _stake[artist][user][stakeIndex].lastPayment),
                "FanToArtistStaking: the reward index provided was wrong"
            );

        while (rewardIndex < _artistReward.length && rewardDeep >= 1) {
            uint40 start = _stake[artist][user][stakeIndex].start;
            uint40 end = _stake[artist][user][stakeIndex].end;

            if (_verifiedArtists[artist] > 1 && end < _verifiedArtists[artist])
                end = _artistReward[rewardIndex].end;
            else if (end > _artistReward[rewardIndex].end)
                end = _artistReward[rewardIndex].end;
            else if (end > block.timestamp) end = uint40(block.timestamp);

            if (start < _artistReward[rewardIndex].start)
                start = _artistReward[rewardIndex].start;
            else if (start < _stake[artist][user][stakeIndex].lastPayment)
                start = _stake[artist][user][stakeIndex].lastPayment;

            accumulator +=
                ((end - start) * _stake[artist][user][stakeIndex].amount) /
                _artistReward[rewardIndex].rate;
            if (
                _stake[artist][user][stakeIndex].end <=
                _artistReward[rewardIndex].end
            ) rewardDeep = 1;
            rewardIndex++;
            rewardDeep--;
        }
        if (block.timestamp > _stake[artist][user][stakeIndex].end)
            _stake[artist][user][stakeIndex].lastPayment = _stake[artist][user][
                stakeIndex
            ].end;
        else
            _stake[artist][user][stakeIndex].lastPayment = uint40(
                block.timestamp
            );

        return accumulator;
    }

    function getReward(
        address artist,
        address[] memory user,
        uint[] memory stakeIndex,
        uint[] memory rewardIndex,
        uint[] memory rewardDeep
    ) external {
        require(
            user.length > 0 &&
                user.length == stakeIndex.length &&
                user.length == rewardIndex.length &&
                user.length == rewardDeep.length,
            "FanToArtistStaking: input validation failed, check the lengths of the arrays"
        );
        uint accumulator = 0;
        for (uint i = 0; i < user.length; i++) {
            require(
                stakeIndex[i] < _stake[artist][user[i]].length,
                "FanToArtistStaking: no stake found with this index"
            );
            accumulator += _getSingleReward(
                artist,
                user[i],
                stakeIndex[i],
                rewardIndex[i],
                rewardDeep[i]
            );
        }
        _Web3MusicNativeToken.pay(artist, accumulator);
        emit ArtistPaid(artist, accumulator);
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
            emit ArtistAdded(artist, sender);
        }
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
        _artistReward[_artistReward.length - 1].end = uint40(block.timestamp);
        _artistReward.push(
            ArtistReward({
                start: uint40(block.timestamp),
                end: (2 ** 40) - 1,
                rate: rate
            })
        );
        emit ArtistWeb3MusicNativeTokenRewardChanged(rate, uint40(block.timestamp), sender);
    }

    function getStakingVeRate() external view returns (uint256) {
        return _veWeb3MusicNativeTokenRewardRate;
    }

    function getArtistRewardRate() external view returns (uint256) {
        return _artistReward[_artistReward.length - 1].rate;
    }

    function stake(
        address artist,
        uint256 amount,
        uint40 end
    ) external onlyVerifiedArtist(artist) {
        require(
            end > _minStakePeriod,
            "FanToArtistStaking: the end period is less than minimum"
        );
        require(
            end <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum"
        );
        require(
            !(_isStakingNow(_msgSender(), artist)),
            "FanToArtistStaking: already staking"
        );
        if (_Web3MusicNativeToken.lock(_msgSender(), amount)) {
            _addStake(_msgSender(), artist, amount, end);
            emit StakeCreated(
                artist,
                _msgSender(),
                amount,
                _stake[artist][_msgSender()].length - 1,
                uint40(block.timestamp) + end
            );
        }
    }

    function increaseAmountStaked(address artist, uint256 amount) external {
        require(
            _stake[artist][_msgSender()].length > 0,
            "FanToArtistStaking: no stake found"
        );
        uint index = _stake[artist][_msgSender()].length - 1;
        require(
            _stake[artist][_msgSender()][index].end + _minStakePeriod> block.timestamp,
            "FanToArtistStaking: can not increase the amount below the minimum stake period"
        );
        if (_Web3MusicNativeToken.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()][index].redeemed = true;
            uint40 prev = _stake[artist][_msgSender()][index].end;
            _stake[artist][_msgSender()][index].end = uint40(block.timestamp);
            _addStake(
                _msgSender(), //sender
                artist, //artist
                _stake[artist][_msgSender()][index].amount + amount, //amount
                prev - _stake[artist][_msgSender()][index].end //end
            );
            emit StakeEndChanged(
                artist,
                _msgSender(),
                index,
                _stake[artist][_msgSender()][index].end
            );
            emit StakeRedeemed(
                artist,
                _msgSender(),
                _stake[artist][_msgSender()][index].end
            );
            emit StakeCreated(
                artist,
                _msgSender(),
                _stake[artist][_msgSender()][index + 1].amount,
                index + 1,
                prev
            );
        }
    }

    function extendStake(address artist, uint40 newEnd) external {
        require(
            _stake[artist][_msgSender()].length > 0,
            "FanToArtistStaking: no stake found"
        );
        uint index = _stake[artist][_msgSender()].length - 1;
        require(
            _stake[artist][_msgSender()][index].end > block.timestamp,
            "FanToArtistStaking: last stake cant be changed"
        );
        require(
            _minStakePeriod <= newEnd && newEnd <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum or less than minimum"
        );
        require(
            _stake[artist][_msgSender()][index].end + newEnd <
                block.timestamp + _maxStakePeriod,
            "FanToArtistStaking: the new stake period exceeds the maximum"
        );
        _stake[artist][_msgSender()][index].end += newEnd;
        emit StakeEndChanged(
            artist,
            _msgSender(),
            index,
            _stake[artist][_msgSender()][index].end
        );
    }

    function changeArtistStaked(
        address artist,
        address newArtist
    ) external onlyVerifiedArtist(newArtist) {
        require(
            _stake[artist][_msgSender()].length > 0,
            "FanToArtistStaking: no stake found"
        );
        uint index = _stake[artist][_msgSender()].length - 1;
        require(
            _stake[artist][_msgSender()][index].end > block.timestamp,
            "FanToArtistStaking: last stake cant be changed"
        );
        require(
            artist != newArtist,
            "FanToArtistStaking: the new artist is the same as the old one"
        );
        require(
            !(_isStakingNow(_msgSender(), newArtist)),
            "FanToArtistStaking: already staking the new artist"
        );
        _stake[artist][_msgSender()][index].redeemed = true;
        uint40 prev = _stake[artist][_msgSender()][index].end;
        _stake[artist][_msgSender()][index].end = uint40(block.timestamp);
        _addStake(
            _msgSender(), //sender
            newArtist, //artist
            _stake[artist][_msgSender()][index].amount, //amount
            prev - _stake[artist][_msgSender()][index].end //end
        );
        emit StakeEndChanged(
            artist,
            _msgSender(),
            index,
            _stake[artist][_msgSender()][index].end
        );
        emit StakeRedeemed(
            artist,
            _msgSender(),
            _stake[artist][_msgSender()][index].end
        );
        emit StakeCreated(
            newArtist,
            _msgSender(),
            _stake[artist][_msgSender()][index].amount,
            index + 1,
            prev
        );
    }

    function redeem(
        address artist,
        address user,
        uint index
    )
        external
        validateIndex(artist, user, index)
        onlyEnded(_stake[artist][user][index].end)
    {
        require(
            !_stake[artist][user][index].redeemed,
            "FanToArtistStaking: this stake has already been redeemed"
        );
        if (
            _Web3MusicNativeToken.transfer(
                user,
                _stake[artist][user][index].amount
            )
        ) _stake[artist][user][index].redeemed = true;
        emit StakeRedeemed(artist, user, index);
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
