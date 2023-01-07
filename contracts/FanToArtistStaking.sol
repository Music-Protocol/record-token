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
        uint128 rewardVe;
        uint128 rewardArtist;
        uint128 previous;
        bool redeemed;
    } //add a checkpoint inside the struct?? TBD costs/benefits?

    struct DetailedStake {
        Stake stake;
        address artist;
    }

    IJTP private _jtp;

    mapping(address => mapping(address => Stake[])) private _stake;
    //_stake[artist][staker]
    //                      = Stake[]
    //                      .push(new Stake)

    mapping(address => address[]) private _artistStaked;
    //_artistStaked[staker] = Array of artist staked (past and present)

    mapping(address => bool) private _verifiedArtists;

    mapping(address => uint256) private _artistAlreadyPaid;

    uint128 private _veJTPRewardRate; //change onylOwner
    uint128 private _artistJTPRewardRate; //change onylOwner
    uint128 private _minStakePeriod; //change onylOwner
    uint128 private _maxStakePeriod; //change onylOwner

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

    function transferOwnership(
        address to
    ) public override(IFanToArtistStaking, Ownable) onlyOwner {
        super.transferOwnership(to);
    }

    function _isStaking(
        address sender,
        address artist
    ) internal view returns (bool) {
        return _stake[artist][sender].length !=0;
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
        uint128 end,
        uint128 referencedStake,
        bool isStaking
    ) internal {
        if (!isStaking) {
            _artistStaked[sender].push(artist);
        }
        _stake[artist][sender].push(
            Stake({
                amount: amount,
                start: uint128(block.timestamp),
                end: uint128(block.timestamp) + end,
                rewardVe: _veJTPRewardRate,
                rewardArtist: _artistJTPRewardRate,
                previous: referencedStake,
                redeemed: false
            })
        );
    }

    function _getStakeIndex(
        address sender,
        address artist,
        uint128 end
    ) internal view returns (int) {
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
                z++;
            }
        }
        return result;
    }

    function addArtist(
        address artist,
        address sender
    ) external override onlyOwner {
        if (!_verifiedArtists[artist]) {
            _verifiedArtists[artist] = true;
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
            emit ArtistRemoved(artist, sender);
        }
    }

    function changeStakingVeRate(
        uint128 rate,
        address sender
    ) external onlyOwner {
        //stop all stakes
        _veJTPRewardRate = rate;
        emit VeJTPRewardChanged(rate, sender);
    }

    function changeArtistRewardRate(
        uint128 rate,
        address sender
    ) external onlyOwner {
        //stop all stakes and create change
        _artistJTPRewardRate = rate;
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
        bool isStaking = _isStaking(_msgSender(), artist);
        require(
            !(isStaking && _isStakingNow(_msgSender(), artist)),
            "FanToArtistStaking: already staking"
        );
        if (_jtp.lock(_msgSender(), amount)) {
            _addStake(_msgSender(), artist, amount, end, 0, isStaking);
            emit ArtistStaked(
                artist,
                _msgSender(),
                amount,
                uint128(block.timestamp) + end
            );
        }
    }

    function incrementAmountStaked(
        address artist,
        uint256 amount,
        uint128 end
    ) external onlyVerifiedArtist(artist) {
        require(
            block.timestamp < end,
            "FanToArtistStaking: you are trying to redeem a stake before his end"
        );
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: No stake found with this end date"
        );
        require(
            !_stake[artist][_msgSender()][uint(index)].redeemed,
            "FanToArtistStaking: this stake has already been redeemed"
        );
        if (_jtp.lock(_msgSender(), amount)) {
            _stake[artist][_msgSender()][uint(index)].redeemed = true;
            _addStake(
                _msgSender(),//sender
                artist,//artist
                _stake[artist][_msgSender()][uint(index)].amount + amount,//amount
                _stake[artist][_msgSender()][uint(index)].end -
                    _stake[artist][_msgSender()][uint(index)].start,//end
                _stake[artist][_msgSender()][uint(index)].end,//referencedStake
                true//newEnd
            );
            _stake[artist][_msgSender()][uint(index)].end = uint128(
                block.timestamp
            );
        }
    }

    function extendStake(
        address artist,
        uint128 end,
        uint128 newEnd
    ) external onlyVerifiedArtist(artist) {
        require(
            block.timestamp < end,
            "FanToArtistStaking: you are trying to redeem a stake before his end"
        );
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: No stake found with this end date"
        );
        require(
            !_stake[artist][_msgSender()][uint(index)].redeemed,
            "FanToArtistStaking: this stake has already been redeemed"
        );
        _stake[artist][_msgSender()][uint(index)].end += newEnd;
    }

    function redeem(address artist, uint128 end) external {
        require(
            end < block.timestamp,
            "FanToArtistStaking: you are trying to redeem a stake before his end"
        );
        int index = _getStakeIndex(_msgSender(), artist, end);
        require(
            index > -1,
            "FanToArtistStaking: No stake found with this end date"
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
}
