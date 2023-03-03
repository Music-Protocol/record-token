// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";
// import "hardhat/console.sol";

contract FanToArtistStaking is IFanToArtistStaking, Ownable {
    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistPaid(address indexed artist, uint256 amount);

    event ArtistJTPRewardChanged(
        uint128 newRate,
        uint256 timestamp,
        address indexed sender
    );
    event StakeCreated(
        address indexed artist,
        address indexed sender,
        uint256 amount,
        uint128 end
    );
    event StakeEndChanged(
        address indexed artist,
        address indexed sender,
        uint128 end,
        uint128 newEnd
    );
    event StakeRedeemed(
        address indexed artist,
        address indexed sender,
        uint128 end
    );

    struct Stake {
        uint256 amount;
        uint128 start; //block.timestamp
        uint128 end;
        bool redeemed;
    }

    struct DetailedStake {
        Stake stake;
        address artist;
        address user;
    }

    struct ArtistReward {
        uint128 start;
        uint128 end;
        uint256 rate;
    }

    ArtistReward[] private _artistReward;
    // to track all the

    IJTP private _jtp;

    mapping(address => mapping(address => Stake[])) private _stake;
    //_stake[artist][staker]
    //                      = Stake[]
    //                      .push(new Stake)

    mapping(address => address[]) private _artistStaked;
    //_artistStaked[staker] = Array of artist staked (past and present)

    mapping(address => address[]) private _stakerOfArtist;
    //_stakerOfArtist[artist] = Array of user that staked (past and present)

    mapping(address => bool) private _verifiedArtists;
    address[] private _verifiedArtistsArr; //redundant info array

    mapping(address => uint128) private _artistLastPayment;

    uint256 private immutable _veJTPRewardRate; //change onylOwner
    uint128 private immutable _minStakePeriod; //change onylOwner
    uint128 private immutable _maxStakePeriod; //change onylOwner

    constructor(
        uint256 veJTPRewardRate,
        uint128 artistJTPRewardRate,
        uint128 min,
        uint128 max
    ) {
        require(
            artistJTPRewardRate != 0,
            "FanToArtistStaking: the artist reward rate can not be 0"
        );
        require(
            veJTPRewardRate != 0,
            "FanToArtistStaking: the voting reward rate can not be 0"
        );
        _veJTPRewardRate = veJTPRewardRate;
        _artistReward.push(
            ArtistReward({start: 0, end: 0, rate: artistJTPRewardRate})
        );
        _minStakePeriod = min;
        _maxStakePeriod = max;
    }

    function setJTP(address jtp) external onlyOwner {
        require(
            address(_jtp) == address(0),
            "FanToArtistStaking: JTP contract already linked"
        );
        _jtp = IJTP(jtp);
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist],
            "FanToArtistStaking: the artist is not a verified artist"
        );
        _;
    }

    modifier onlyNotEnded(uint128 end) {
        require(
            block.timestamp < end,
            "FanToArtistStaking: the stake is already ended"
        );
        _;
    }

    modifier onlyEnded(uint128 end) {
        require(
            end < block.timestamp,
            "FanToArtistStaking: the stake is not ended"
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
        uint128 end
    ) internal {
        if (_stake[artist][sender].length == 0) {
            _artistStaked[sender].push(artist);
            _stakerOfArtist[artist].push(sender);
        }
        _stake[artist][sender].push(
            Stake({
                amount: amount,
                start: uint128(block.timestamp),
                end: uint128(block.timestamp) + end,
                redeemed: false
            })
        );
    }

    function _getStakeIndex(
        address sender,
        address artist,
        uint128 end
    ) internal view returns (int256) {
        for (uint i = _stake[artist][sender].length; i > 0; i--) {
            if (_stake[artist][sender][i - 1].end == end) return int(i - 1);
        }
        return -1;
    }

    // @return the array of all Stake from the msg.sender
    function getAllStake() external view returns (DetailedStake[] memory) {
        uint count = 0;
        address[] memory array = _artistStaked[_msgSender()];
        for (uint i = 0; i < array.length; i++) {
            count += _stake[array[i]][_msgSender()].length;
        }
        DetailedStake[] memory result = new DetailedStake[](count);

        uint z = 0;
        for (uint i = 0; i < array.length; i++) {
            for (uint j = 0; j < _stake[array[i]][_msgSender()].length; j++) {
                result[z].stake = _stake[array[i]][_msgSender()][j];
                result[z].artist = array[i];
                result[z].user = _msgSender();
                z++;
            }
        }
        return result;
    }

    // @return the array of all Stake to the msg.sender
    function getAllArtistStake()
        external
        view
        returns (DetailedStake[] memory)
    {
        uint count = 0;
        address[] memory array = _stakerOfArtist[_msgSender()];
        for (uint i = 0; i < array.length; i++) {
            count += _stake[_msgSender()][array[i]].length;
        }
        DetailedStake[] memory result = new DetailedStake[](count);

        uint z = 0;
        for (uint i = 0; i < array.length; i++) {
            for (uint j = 0; j < _stake[_msgSender()][array[i]].length; j++) {
                result[z].stake = _stake[_msgSender()][array[i]][j];
                result[z].artist = _msgSender();
                result[z].user = array[i];
                z++;
            }
        }
        return result;
    }

    //no restricting this to onlyArtist because a removed artist can pull the reward
    function getReward() external {
        require(
            _stakerOfArtist[_msgSender()].length > 0,
            "FanToArtistStaking: no stake found"
        );
        address[] memory user = _stakerOfArtist[_msgSender()];
        uint256 accumulator = 0;
        for (uint i = 0; i < user.length; i++) {
            uint z = 0;
            for (uint j = 0; j < _artistReward.length; j++) {
                for (; z < _stake[_msgSender()][user[i]].length; z++) {
                    if (
                        _stake[_msgSender()][user[i]][z].end >
                        _artistLastPayment[_msgSender()]
                    ) {
                        uint128 start = _stake[_msgSender()][user[i]][z].start;
                        uint128 end = _stake[_msgSender()][user[i]][z].end;
                        if (end > block.timestamp)
                            end = uint128(block.timestamp);
                        if (start < _artistLastPayment[_msgSender()])
                            start = _artistLastPayment[_msgSender()];
                        if (
                            start >= _artistReward[j].start &&
                            (end <= _artistReward[j].end ||
                                _artistReward[j].end == 0)
                        ) {
                            accumulator +=
                                ((end - start) *
                                    _stake[_msgSender()][user[i]][z].amount) /
                                _artistReward[j].rate;
                        } else if (
                            start >= _artistReward[j].start &&
                            start <= _artistReward[j].end &&
                            end > _artistReward[j].end
                        ) {
                            accumulator +=
                                ((_artistReward[j].end - start) *
                                    _stake[_msgSender()][user[i]][z].amount) /
                                _artistReward[j].rate;
                            break;
                        } else if (
                            start < _artistReward[j].start &&
                            end >= _artistReward[j].start &&
                            (end <= _artistReward[j].end ||
                                _artistReward[j].end == 0)
                        ) {
                            accumulator +=
                                ((end - _artistReward[j].start) *
                                    _stake[_msgSender()][user[i]][z].amount) /
                                _artistReward[j].rate;
                        } else {
                            break;
                        }
                    }
                }
            }
        }
        _jtp.payArtist(_msgSender(), accumulator);
        emit ArtistPaid(_msgSender(), accumulator);
        _artistLastPayment[_msgSender()] = uint128(block.timestamp);
    }

    function addArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (!_verifiedArtists[artist]) {
            _verifiedArtists[artist] = true;
            _verifiedArtistsArr.push(artist);
            emit ArtistAdded(artist, sender);
        }
    }

    function removeArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (_verifiedArtists[artist]) {
            _verifiedArtists[artist] = false;
            //stop all stake
            address[] memory array = _stakerOfArtist[artist];
            for (uint i = 0; i < array.length; i++) {
                uint j = _stake[artist][array[i]].length - 1;
                if (_stake[artist][array[i]][j].end > block.timestamp) {
                    emit StakeEndChanged(
                        artist,
                        _msgSender(),
                        _stake[artist][array[i]][j].end,
                        uint128(block.timestamp)
                    );
                    _stake[artist][array[i]][j].end = uint128(block.timestamp);
                }
            }
            emit ArtistRemoved(artist, sender);
        }
    }

    // Note that this function is highly gas consuming,
    // as many Stake structures are created as the number of active ones.
    // A solution could be to stop all the active stakes instead of creating new one for each one of them.
    function changeArtistRewardRate(
        uint128 rate,
        address sender
    ) external onlyOwner {
        require(
            rate != 0,
            "FanToArtistStaking: the artist reward rate can not be 0"
        );
        _artistReward[_artistReward.length - 1].end = uint128(block.timestamp);
        _artistReward.push(
            ArtistReward({start: uint128(block.timestamp), end: 0, rate: rate})
        );
        emit ArtistJTPRewardChanged(rate, block.timestamp, sender);
    }

    function getStakingVeRate() external view returns (uint256) {
        return _veJTPRewardRate;
    }

    function getArtistRewardRate() external view returns (uint256) {
        return _artistReward[_artistReward.length - 1].rate;
    }

    function stake(
        address artist,
        uint256 amount,
        uint128 end
    ) external onlyVerifiedArtist(artist) {
        require(
            end > _minStakePeriod,
            "FanToArtistStaking: the end period is less than minimum"
        );
        require(
            end <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum"
        );
        // bool isStaking = _isStaking(_msgSender(), artist);
        require(
            !(_isStakingNow(_msgSender(), artist)),
            "FanToArtistStaking: already staking"
        );
        if (_jtp.lock(_msgSender(), amount)) {
            _addStake(_msgSender(), artist, amount, end);
            emit StakeCreated(
                artist,
                _msgSender(),
                amount,
                uint128(block.timestamp) + end
            );
        }
    }

    function increaseAmountStaked(
        address artist,
        uint256 amount,
        uint128 end
    ) external onlyVerifiedArtist(artist) onlyNotEnded(end) {
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: no stake found with this end date"
        );
        // this check on redeemed is unecessary,
        // redeem = true, When you call redeem() so stake time is ended and the modifier onlyNotEnded reverts the request
        // redeem = true, also when you increase the amount and the end is set to block.timestamp, onlyNotEnded prevent also this case
        // we could leave it as block.timestamp can be manipulated
        // require(
        //     !_stake[artist][_msgSender()][uint(index)].redeemed,
        //     "FanToArtistStaking: this stake has already been redeemed"
        // );
        if (_jtp.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()][uint(index)].redeemed = true;
            uint128 prev = _stake[artist][_msgSender()][uint(index)].end;
            _stake[artist][_msgSender()][uint(index)].end = uint128(
                block.timestamp
            );
            _addStake(
                _msgSender(), //sender
                artist, //artist
                _stake[artist][_msgSender()][uint(index)].amount + amount, //amount
                prev - _stake[artist][_msgSender()][uint(index)].end //end
            );
            emit StakeEndChanged(
                artist,
                _msgSender(),
                prev,
                _stake[artist][_msgSender()][uint(index)].end
            );
            emit StakeRedeemed(
                artist,
                _msgSender(),
                _stake[artist][_msgSender()][uint(index)].end
            );
            emit StakeCreated(
                artist,
                _msgSender(),
                _stake[artist][_msgSender()][uint(index)].amount,
                prev
            );
        }
    }

    function extendStake(
        address artist,
        uint128 end,
        uint128 newEnd
    ) external onlyVerifiedArtist(artist) onlyNotEnded(end) {
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: no stake found with this end date"
        );
        require(
            newEnd <= _maxStakePeriod,
            "FanToArtistStaking: the stake period exceed the maximum"
        );
        _stake[artist][_msgSender()][uint(index)].end += newEnd;
        emit StakeEndChanged(artist, _msgSender(), end, end + newEnd);
    }

    function changeArtistStaked(
        address artist,
        address newArtist,
        uint128 end
    ) external onlyVerifiedArtist(artist) onlyNotEnded(end) {
        require(
            artist != newArtist,
            "FanToArtistStaking: the new artist is the same as the old one"
        );
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: no stake found with this end date"
        );
        // this check on redeemed is unecessary,
        // redeem = true, When you call redeem() so stake time is ended and the modifier onlyNotEnded reverts the request
        // redeem = true, also when you increase the amount and the end is set to block.timestamp, onlyNotEnded prevent also this case
        // we could leave it as block.timestamp can be manipulated
        // require(
        //     !_stake[artist][_msgSender()][uint(index)].redeemed,
        //     "FanToArtistStaking: this stake has already been redeemed"
        // );
        require(
            !(_isStakingNow(_msgSender(), newArtist)),
            "FanToArtistStaking: already staking the new artist"
        );
        _stake[artist][_msgSender()][uint(index)].redeemed = true;
        uint128 prev = _stake[artist][_msgSender()][uint(index)].end;
        _stake[artist][_msgSender()][uint(index)].end = uint128(
            block.timestamp
        );
        _addStake(
            _msgSender(), //sender
            newArtist, //artist
            _stake[artist][_msgSender()][uint(index)].amount, //amount
            prev - _stake[artist][_msgSender()][uint(index)].end //end
        );
        emit StakeEndChanged(
            artist,
            _msgSender(),
            prev,
            _stake[artist][_msgSender()][uint(index)].end
        );
        emit StakeRedeemed(
            artist,
            _msgSender(),
            _stake[artist][_msgSender()][uint(index)].end
        );
        emit StakeCreated(
            artist,
            _msgSender(),
            _stake[artist][_msgSender()][uint(index)].amount,
            prev
        );
    }

    function redeem(address artist, uint128 end) external onlyEnded(end) {
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: no stake found with this end date"
        );
        require(
            !_stake[artist][_msgSender()][uint(index)].redeemed,
            "FanToArtistStaking: this stake has already been redeemed"
        );
        if (
            _jtp.transfer(
                _msgSender(),
                _stake[artist][_msgSender()][uint(index)].amount
            )
        ) _stake[artist][_msgSender()][uint(index)].redeemed = true;
        emit StakeRedeemed(artist, _msgSender(), end);
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist];
    }

    function _totalVotingPower(
        uint256 timestamp
    ) internal view returns (uint256) {
        uint256 accumulator = 0;
        for (uint k = 0; k < _verifiedArtistsArr.length; k++) {
            address artist = _verifiedArtistsArr[k];
            address[] memory array = _stakerOfArtist[artist];
            for (uint i = 0; i < array.length; i++) {
                for (uint j = 0; j < _stake[artist][array[i]].length; j++) {
                    if (_stake[artist][array[i]][j].start > timestamp) break;
                    uint time = _stake[artist][array[i]][j].end;
                    if (time > timestamp) time = timestamp;
                    accumulator +=
                        (time - _stake[artist][array[i]][j].start) *
                        _stake[artist][array[i]][j].amount;
                }
            }
        }
        return accumulator / _veJTPRewardRate;
    }

    function totalVotingPower() external view returns (uint256) {
        return _totalVotingPower(block.timestamp);
    }

    function totalVotingPowerAt(
        uint256 timestamp
    ) external view returns (uint256) {
        return _totalVotingPower(timestamp);
    }

    function _votingPowerOf(
        address user,
        uint256 timestamp
    ) internal view returns (uint256) {
        uint256 accumulator = 0;
        address[] memory array = _artistStaked[user];
        for (uint i = 0; i < array.length; i++) {
            for (uint j = 0; j < _stake[array[i]][user].length; j++) {
                if (_stake[array[i]][user][j].start > timestamp) break;
                uint time = _stake[array[i]][user][j].end;
                if (time > timestamp) time = timestamp;
                accumulator +=
                    (time - _stake[array[i]][user][j].start) *
                    _stake[array[i]][user][j].amount;
            }
        }
        return accumulator / _veJTPRewardRate;
    }

    function votingPowerOf(address user) external view returns (uint256) {
        return _votingPowerOf(user, block.timestamp);
    }

    function votingPowerOfAt(
        address user,
        uint256 timestamp
    ) external view returns (uint256) {
        return _votingPowerOf(user, timestamp);
    }
}
