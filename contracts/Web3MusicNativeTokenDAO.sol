// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract Web3MusicNetworkDAO is Ownable2Step {
    using Math for uint256;

    event ProposalCreated(
        uint256 indexed proposalId,
        address proposer,
        address[] targets,
        bytes[] calldatas,
        uint256 startTime,
        string description
    );
    event ProposalExecuted(
        uint256 indexed hash,
        address indexed executor,
        bool executed
    );
    event ProposalVoted(
        uint256 indexed hash,
        address indexed voter,
        uint256 amount,
        bool isFor
    );
    event UserWhitelisted(address indexed target, bool whitelisted);

    struct Proposal {
        uint256 blockNumber;
        uint256 maxProposalMembers;
        uint256 proposalVoters;
        uint256 votesFor;
        uint256 votesAgainst;
        uint128 timeStart;
    }

    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) private _votes; //hash collision of keccack256

    mapping(address => bool) whitelistedAddresses;
    bool whitelistEnabled;

    uint128 private immutable _quorum; // 0 to 10e8
    uint128 private immutable _majority; // 0 to 10e8
    uint128 private immutable _timeVotes;
    uint128 private _membersNumber;

    IFanToArtistStaking private immutable _ftas;

    constructor(
        address ftas_,
        uint128 quorum_,
        uint128 majority_,
        uint128 time,
        bool whitelist_
    ) {
        require(
            ftas_ != address(0),
            "DAO: the fanToArtistStaking address can not be 0"
        );
        require(
            quorum_ <= 10e8,
            "DAO: the quorum must be less than or equal 10e8"
        );
        require(
            majority_ <= 10e8,
            "DAO: the majority must be less than or equal 10e8"
        );
        _ftas = IFanToArtistStaking(ftas_);
        _quorum = quorum_;
        _majority = majority_;
        _timeVotes = time;
        whitelistEnabled = whitelist_;
    }

    function _reachedQuorum(
        uint256 proposalId
    ) internal virtual returns (bool) {
        if (whitelistEnabled) {
            if (
                _proposals[proposalId].proposalVoters == 0 ||
                _proposals[proposalId].maxProposalMembers == 0
            ) return false;
            return
                _proposals[proposalId].proposalVoters >
                uint256(_quorum).mulDiv(
                    _proposals[proposalId].maxProposalMembers,
                    10e8
                );
        }
        if (block.number == _proposals[proposalId].blockNumber) {
            return
                (_proposals[proposalId].votesFor +
                    _proposals[proposalId].votesAgainst) >
                uint256(_quorum).mulDiv(_ftas.getTotalSupply(), 10e8);
        }
        return
            (_proposals[proposalId].votesFor +
                _proposals[proposalId].votesAgainst) >
            uint256(_quorum).mulDiv(
                _ftas.getPastTotalSupply(_proposals[proposalId].blockNumber),
                10e8
            );
    }

    function _votePassed(
        uint256 proposalId
    ) internal view virtual returns (bool) {
        if (
            _proposals[proposalId].votesFor +
                _proposals[proposalId].votesAgainst ==
            0
        ) return false;
        return
            _proposals[proposalId].votesFor >=
            uint256(_majority).mulDiv(
                (_proposals[proposalId].votesFor +
                    _proposals[proposalId].votesAgainst),
                10e8
            );
    }

    function hashProposal(
        address[] memory targets,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public pure virtual returns (uint256) {
        return
            uint256(keccak256(abi.encode(targets, calldatas, descriptionHash)));
    }

    function propose(
        address[] memory targets,
        bytes[] memory calldatas,
        string memory description
    ) external {
        uint256 proposalId = hashProposal(
            targets,
            calldatas,
            keccak256(bytes(description))
        );
        require(
            targets.length == calldatas.length,
            "DAO: invalid proposal length"
        );

        require(
            _proposals[proposalId].timeStart == 0 ||
                (block.timestamp >
                    _proposals[proposalId].timeStart + _timeVotes &&
                    !(_reachedQuorum(proposalId) && _votePassed(proposalId))),
            "DAO: proposal already exists"
        );

        _proposals[proposalId] = Proposal({
            timeStart: uint128(block.timestamp),
            maxProposalMembers: _membersNumber,
            proposalVoters: 0,
            blockNumber: block.number,
            votesFor: 0,
            votesAgainst: 0
        });

        emit ProposalCreated(
            proposalId,
            msg.sender,
            targets,
            calldatas,
            _proposals[proposalId].timeStart,
            description
        );
    }

    function vote(
        address[] memory targets,
        bytes[] memory calldatas,
        string memory description,
        bool isFor
    ) external {
        require(
            whitelistEnabled == false || whitelistedAddresses[msg.sender],
            "DAO: user not whitelisted"
        );
        uint256 proposalId = hashProposal(
            targets,
            calldatas,
            keccak256(bytes(description))
        );

        require(
            _proposals[proposalId].timeStart != 0,
            "DAO: proposal not found"
        );
        require(
            block.timestamp < _proposals[proposalId].timeStart + _timeVotes,
            "DAO: proposal expired"
        );

        uint256 hashVote = uint256(
            keccak256(abi.encode(proposalId, _proposals[proposalId].timeStart))
        );
        require(!_votes[hashVote][msg.sender], "DAO: already voted");

        uint256 amount;
        if (block.number == _proposals[proposalId].blockNumber) {
            amount = _ftas.getVotes(msg.sender);
        } else {
            amount = _ftas.getPastVotes(
                msg.sender,
                _proposals[proposalId].blockNumber
            );
        }

        if (isFor) _proposals[proposalId].votesFor += amount;
        else _proposals[proposalId].votesAgainst += amount;

        _proposals[proposalId].proposalVoters += 1;
        _votes[hashVote][msg.sender] = true;

        emit ProposalVoted(proposalId, msg.sender, amount, isFor);
    }

    function execute(
        address[] memory targets,
        bytes[] memory calldatas,
        string memory description
    ) external {
        uint256 proposalId = hashProposal(
            targets,
            calldatas,
            keccak256(bytes(description))
        );

        require(
            _proposals[proposalId].timeStart != 0,
            "DAO: proposal not found"
        );
        require(
            block.timestamp > _proposals[proposalId].timeStart + _timeVotes,
            "DAO: proposal not ended"
        );
        bool votingResult = _reachedQuorum(proposalId) && _votePassed(proposalId);
        delete _proposals[proposalId];
        if (votingResult) {
            for (uint256 i = 0; i < targets.length; ++i) {
                (bool success, bytes memory returndata) = targets[i].call(
                    calldatas[i]
                );
                Address.verifyCallResult(
                    success,
                    returndata,
                    "DAO: call reverted without message"
                );
            }
        }
        emit ProposalExecuted(
            proposalId,
            msg.sender,
            votingResult
        );
    }

    function getProposal(
        address[] memory targets,
        bytes[] memory calldatas,
        string memory description
    ) external view returns (Proposal memory) {
        uint256 proposalId = hashProposal(
            targets,
            calldatas,
            keccak256(bytes(description))
        );
        require(
            _proposals[proposalId].timeStart != 0,
            "DAO: proposal not found"
        );
        return _proposals[proposalId];
    }

    function manageWhitelist(
        address target,
        bool whitelist
    ) external onlyOwner {
        require(
            whitelistedAddresses[target] != whitelist,
            "F2A: already added/removed."
        );
        whitelistedAddresses[target] = whitelist;
        whitelist ? _membersNumber++ : _membersNumber--;
        emit UserWhitelisted(target, whitelist);
    }
}
