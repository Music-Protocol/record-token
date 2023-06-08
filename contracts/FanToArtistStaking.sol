// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";

contract FanToArtistStaking is IFanToArtistStaking, Ownable, Initializable {
    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistPaid(address indexed artist, uint256 amount);

    event ArtistJTPRewardChanged(
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
    event StakeRedeemed(
        address indexed artist,
        address indexed sender,
        uint40 end
    );

    struct Stake {
        uint256 amount;
        uint40 start; //block.timestamp
        uint40 end;
        bool redeemed;
    }

    struct DetailedStake {
        Stake stake;
        address artist;
        address user;
    }

    struct ArtistReward {
        uint256 rate;
        uint40 start;
        uint40 end;
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

    mapping(address => uint8) private _verifiedArtists; // 0 not added | 1 addedd | 2 removed
    address[] private _verifiedArtistsArr; //redundant info array also with removed

    mapping(address => uint40) private _artistLastPayment;

    uint256 private _veJTPRewardRate; //change onylOwner
    uint40 private _minStakePeriod; //change onylOwner
    uint40 private _maxStakePeriod; //change onylOwner

    function initialize(
        address jtp_,
        uint256 veJTPRewardRate,
        uint256 artistJTPRewardRate,
        uint40 min,
        uint40 max
    ) public initializer {
        require(
            jtp_ != address(0),
            "FanToArtistStaking: the jtp address can not be 0"
        );
        require(
            artistJTPRewardRate != 0,
            "FanToArtistStaking: the artist reward rate can not be 0"
        );
        require(
            veJTPRewardRate != 0,
            "FanToArtistStaking: the voting reward rate can not be 0"
        );
        require(max > min, "FanToArtistStaking: min cant be greater than max");
        _jtp = IJTP(jtp_);
        _veJTPRewardRate = veJTPRewardRate;
        _artistReward.push(
            ArtistReward({start: 0, end: 0, rate: artistJTPRewardRate})
        );
        _minStakePeriod = min;
        _maxStakePeriod = max;
    }

    modifier onlyVerifiedArtist(address artist) {
        require(
            _verifiedArtists[artist] == 1,
            "FanToArtistStaking: the artist is not a verified artist"
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
        if (_stake[artist][sender].length == 0) {
            _artistStaked[sender].push(artist);
            _stakerOfArtist[artist].push(sender);
        }
        _stake[artist][sender].push(
            Stake({
                amount: amount,
                start: uint40(block.timestamp),
                end: uint40(block.timestamp) + end,
                redeemed: false
            })
        );
    }

    //I loop arrays in reverse because the most recent stakes are added at the end
    function _getStakeIndex(
        address sender,
        address artist,
        uint40 end
    ) internal view returns (uint256) {
        for (uint i = _stake[artist][sender].length; i > 0; i--) {
            if (_stake[artist][sender][i - 1].end == end) return i - 1;
        }
        return 0;
    }

    // @return the array of all Stake from the msg.sender
    function getAllUserStake() external view returns (DetailedStake[] memory) {
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
                        uint40 start = _stake[_msgSender()][user[i]][z].start;
                        uint40 end = _stake[_msgSender()][user[i]][z].end;
                        if (end > block.timestamp)
                            end = uint40(block.timestamp);
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
        _artistLastPayment[_msgSender()] = uint40(block.timestamp);
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
            if (_verifiedArtists[artist] != 2) _verifiedArtistsArr.push(artist);
            _verifiedArtists[artist] = 1;
            emit ArtistAdded(artist, sender);
        }
    }

    function removeArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (_verifiedArtists[artist] == 1) {
            _verifiedArtists[artist] = 2;
            //stop all stake
            address[] memory array = _stakerOfArtist[artist];
            for (uint i = 0; i < array.length; i++) {
                uint j = _stake[artist][array[i]].length - 1;
                if (_stake[artist][array[i]][j].end > block.timestamp) {
                    emit StakeEndChanged(
                        artist,
                        _msgSender(),
                        uint40(block.timestamp)
                    );
                    _stake[artist][array[i]][j].end = uint40(block.timestamp);
                }
            }
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
            ArtistReward({start: uint40(block.timestamp), end: 0, rate: rate})
        );
        emit ArtistJTPRewardChanged(rate, uint40(block.timestamp), sender);
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
        if (_jtp.lock(_msgSender(), amount)) {
            _addStake(_msgSender(), artist, amount, end);
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
            _stake[artist][_msgSender()].length > 0,
            "FanToArtistStaking: no stake present"
        );
        uint index = _stake[artist][_msgSender()].length - 1;
        require(
            _stake[artist][_msgSender()][index].end > block.timestamp,
            "FanToArtistStaking: last stake cant be changed"
        );
        if (_jtp.lock(_msgSender(), amount)) {
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
                prev
            );
        }
    }

    function extendStake(address artist, uint40 newEnd) external {
        require(
            _stake[artist][_msgSender()].length > 0,
            "FanToArtistStaking: no stake present"
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
            _stake[artist][_msgSender()][index].end
        );
    }

    function changeArtistStaked(
        address artist,
        address newArtist
    ) external onlyVerifiedArtist(newArtist) {
        require(
            _stake[artist][_msgSender()].length > 0,
            "FanToArtistStaking: no stake present"
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
            _stake[newArtist][_msgSender()][index].amount,
            prev
        );
    }

    function redeem(address artist, uint40 end) external onlyEnded(end) {
        uint index = _getStakeIndex(_msgSender(), artist, end);
        require(
            _stake[artist][_msgSender()].length > 0 &&
                _stake[artist][_msgSender()][index].end == end,
            "FanToArtistStaking: no stake found with this end date"
        );
        require(
            !_stake[artist][_msgSender()][index].redeemed,
            "FanToArtistStaking: this stake has already been redeemed"
        );
        if (
            _jtp.transfer(
                _msgSender(),
                _stake[artist][_msgSender()][index].amount
            )
        ) _stake[artist][_msgSender()][index].redeemed = true;
        emit StakeRedeemed(artist, _msgSender(), end);
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist] == 1;
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
                    accumulator +=
                        ((_stake[artist][array[i]][j].end -
                            _stake[artist][array[i]][j].start) *
                            _stake[artist][array[i]][j].amount) /
                        _veJTPRewardRate;
                }
            }
        }
        return accumulator;
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
                accumulator +=
                    ((_stake[array[i]][user][j].end -
                        _stake[array[i]][user][j].start) *
                        _stake[array[i]][user][j].amount) /
                    _veJTPRewardRate;
            }
        }
        return accumulator;
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

    // ----------DEXLReward------------------
    function calculateIntegral(
        address artist,
        address user,
        uint256 start,
        uint256 end
    ) private view returns (uint256) {
        uint256 integral = 0;
        Stake[] storage stakes = _stake[artist][user];
        for (uint i = 0; i < stakes.length; i++) {
            if (stakes[i].end < start || stakes[i].start > end) {
                continue; // skip stakes outside the interval
            }
            uint256 amount = stakes[i].amount;
            uint256 startTime = start;
            if (start < stakes[i].start) startTime = stakes[i].start;
            uint256 endTime = end;
            if (end > stakes[i].end) endTime = stakes[i].end;

            integral += amount * (endTime - startTime);
        }
        return integral;
    }

    function calculateOverallStake(
        uint256 start,
        uint256 end
    ) public view returns (uint256) {
        require(
            end > start,
            "FanToArtistStaking: end must be greater than start"
        );
        uint256 totalStake = 0;
        for (uint i = 0; i < _verifiedArtistsArr.length; i++) {
            for (
                uint j = 0;
                j < _stakerOfArtist[_verifiedArtistsArr[i]].length;
                j++
            ) {
                totalStake += calculateIntegral(
                    _verifiedArtistsArr[i],
                    _stakerOfArtist[_verifiedArtistsArr[i]][j],
                    start,
                    end
                );
            }
        }
        return totalStake;
    }
}
