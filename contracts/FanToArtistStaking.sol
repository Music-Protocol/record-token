// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";

contract FanToArtistStaking is IFanToArtistStaking, Ownable {
    event ArtistAdded(address indexed artist, address indexed sender);
    event ArtistRemoved(address indexed artist, address indexed sender);
    event ArtistStaked(
        address indexed artist,
        address indexed sender,
        uint256 amount,
        uint128 end
    );
    event VeJTPRewardChanged(uint128 newRate, address indexed sender);
    event ArtistJTPRewardChanged(uint128 newRate, address indexed sender);

    struct Stake {
        uint256 amount;
        uint128 start; //block.timestamp
        uint128 end;
        uint128 rewardArtist; // 0 = none is paid // amount * time / rewardArtist
        bool redeemed;
    } //add a checkpoint inside the struct?? TBD costs/benefits?

    struct DetailedStake {
        Stake stake;
        address artist;
        address user;
    }

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

    mapping(address => uint256) private _artistAlreadyPaid;

    uint128 private immutable _veJTPRewardRate; //change onylOwner
    uint128 private _artistJTPRewardRate; //change onylOwner
    uint128 private immutable _minStakePeriod; //change onylOwner
    uint128 private immutable _maxStakePeriod; //change onylOwner

    constructor(
        uint128 veJTPRewardRate,
        uint128 artistJTPRewardRate,
        uint128 min,
        uint128 max
    ) {
        _veJTPRewardRate = veJTPRewardRate;
        _artistJTPRewardRate = artistJTPRewardRate;
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
        for (uint256 i = 0; i < _stake[artist][sender].length; i++) {
            if (_stake[artist][sender][i].end > block.timestamp) return true;
        }
        return false;
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
                rewardArtist: _artistJTPRewardRate,
                redeemed: false
            })
        );
    }

    function _getStakeIndex(
        address sender,
        address artist,
        uint128 end
    ) internal view returns (int256) {
        for (uint i = 0; i < _stake[artist][sender].length; i++) {
            if (_stake[artist][sender][i].end == end) return int(i);
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
        address[] memory array = _stakerOfArtist[_msgSender()];
        uint256 accumulator = 0;
        for (uint i = 0; i < array.length; i++) {
            for (uint j = 0; j < _stake[_msgSender()][array[i]].length; j++) {
                uint128 end = _stake[_msgSender()][array[i]][j].end;
                if (end > block.timestamp) end = uint128(block.timestamp);
                accumulator += // time* coeff
                    ((end - _stake[_msgSender()][array[i]][j].start) * //time = end - start
                        _stake[_msgSender()][array[i]][j].amount) / // coeff = amount / reward
                    _stake[_msgSender()][array[i]][j].rewardArtist;
            }
        }
        accumulator -= _artistAlreadyPaid[_msgSender()];
        _jtp.payArtist(_msgSender(), accumulator);
        _artistAlreadyPaid[_msgSender()] += accumulator;

        // TODO emit
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
                for (uint j = 0; j < _stake[artist][array[i]].length; j++)
                    if (_stake[artist][array[i]][j].end > block.timestamp)
                        _stake[artist][array[i]][j].end = uint128(
                            block.timestamp
                        );
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
        _artistJTPRewardRate = rate;
        //stop all stakes and create change
        for (uint k = 0; k < _verifiedArtistsArr.length; k++) {
            address artist = _verifiedArtistsArr[k];
            address[] memory array = _stakerOfArtist[artist];
            for (uint i = 0; i < array.length; i++) {
                for (uint j = 0; j < _stake[artist][array[i]].length; j++) {
                    if (_stake[artist][array[i]][j].end > block.timestamp) {
                        // _stake[artist][array[i]][j].end = uint128(
                        //     block.timestamp
                        // );
                        _stake[artist][array[i]][j].redeemed = true;
                        uint128 prev = _stake[artist][array[i]][j].end;
                        _stake[artist][array[i]][j].end = uint128(
                            block.timestamp
                        );
                        _addStake(
                            array[i], //sender
                            artist, //artist
                            _stake[artist][array[i]][j].amount, //amount
                            prev - _stake[artist][array[i]][j].end //end
                        );
                        break;
                    }
                }
            }
        }
        emit ArtistJTPRewardChanged(rate, sender);
    }

    function getStakingVeRate() external view returns (uint128) {
        return _veJTPRewardRate;
    }

    function getArtistRewardRate() external view returns (uint128) {
        return _artistJTPRewardRate;
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
            emit ArtistStaked(
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
            _jtp.unlock(
                _msgSender(),
                _stake[artist][_msgSender()][uint(index)].amount
            )
        ) _stake[artist][_msgSender()][uint(index)].redeemed = true;
    }

    function isVerified(address artist) external view returns (bool) {
        return _verifiedArtists[artist];
    }

    function totalVotingPower() external view returns (uint256) {
        uint256 accumulator = 0;
        for (uint k = 0; k < _verifiedArtistsArr.length; k++) {
            address artist = _verifiedArtistsArr[k];
            address[] memory array = _stakerOfArtist[artist];
            for (uint i = 0; i < array.length; i++) {
                for (uint j = 0; j < _stake[artist][array[i]].length; j++) {
                    uint time = _stake[artist][array[i]][j].end;
                    if (time > block.timestamp) time = block.timestamp;
                    accumulator =
                        (time - _stake[artist][array[i]][j].start) *
                        _stake[artist][array[i]][j].amount;
                }
            }
        }
        return accumulator / _veJTPRewardRate;
    }

    function totalVotingPowerAt(
        uint256 timestamp
    ) external view returns (uint256) {
        uint256 accumulator = 0;
        for (uint k = 0; k < _verifiedArtistsArr.length; k++) {
            address artist = _verifiedArtistsArr[k];
            address[] memory array = _stakerOfArtist[artist];
            for (uint i = 0; i < array.length; i++) {
                for (uint j = 0; j < _stake[artist][array[i]].length; j++) {
                    if (_stake[artist][array[i]][j].start > timestamp) break;
                    uint time = _stake[artist][array[i]][j].end;
                    if (time > timestamp) time = timestamp;
                    accumulator =
                        (time - _stake[artist][array[i]][j].start) *
                        _stake[artist][array[i]][j].amount;
                }
            }
        }
        return accumulator / _veJTPRewardRate;
    }

    function votingPowerOf(address user) external view returns (uint256) {
        uint256 accumulator = 0;
        address[] memory array = _artistStaked[user];
        for (uint i = 0; i < array.length; i++) {
            for (uint j = 0; j < _stake[array[i]][user].length; j++) {
                if (_stake[array[i]][user][j].start > block.timestamp) break;
                uint time = _stake[array[i]][user][j].end;
                if (time > block.timestamp) time = block.timestamp;
                accumulator =
                    (time - _stake[array[i]][user][j].start) *
                    _stake[array[i]][user][j].amount;
            }
        }
        return accumulator / _veJTPRewardRate;
    }

    function votingPowerOfAt(
        address user,
        uint256 timestamp
    ) external view returns (uint256) {
        uint256 accumulator = 0;
        address[] memory array = _artistStaked[user];
        for (uint i = 0; i < array.length; i++) {
            for (uint j = 0; j < _stake[array[i]][user].length; j++) {
                if (_stake[array[i]][user][j].start > timestamp) break;
                uint time = _stake[array[i]][user][j].end;
                if (time > timestamp) time = timestamp;
                accumulator =
                    (time - _stake[array[i]][user][j].start) *
                    _stake[array[i]][user][j].amount;
            }
        }
        return accumulator / _veJTPRewardRate;
    }
}
