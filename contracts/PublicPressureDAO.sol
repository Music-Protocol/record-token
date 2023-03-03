// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;
import "./interfaces/IFanToArtistStaking.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract PublicPressureDAO {
    using Math for uint256;

    event ProposalCreated(
        uint256 indexed proposalId,
        address proposer,
        address[] targets,
        bytes[] calldatas,
        uint256 startTime,
        uint256 endTime,
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

    struct Proposal {
        uint128 timeStart;
        uint128 timeEnd;
        uint256 maxVotingPower;
        uint256 votesFor;
        uint256 votesAgainst;
    }

    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) private _votes; //hash collision of keccack256

    uint128 private immutable _quorum; // 0 to 10e9
    uint128 private immutable _majority; // 0 to 10e9
    IFanToArtistStaking private immutable _ftas;

    constructor(address ftas_, uint128 quorum_, uint128 majority_) {
        _ftas = IFanToArtistStaking(ftas_);
        _quorum = quorum_;
        _majority = majority_;
    }

    function _reachedQuorum(
        uint256 proposalId
    ) internal view virtual returns (bool) {
        return
            (_proposals[proposalId].votesFor +
                _proposals[proposalId].votesAgainst) >
            uint256(_quorum).mulDiv(
                _proposals[proposalId].maxVotingPower,
                10e9
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
        require(targets.length > 0, "DAO: empty proposal");

        require(
            _proposals[proposalId].timeStart == 0 &&
                !(_reachedQuorum(proposalId) &&
                    _proposals[proposalId].timeEnd > block.timestamp &&
                    _proposals[proposalId].votesFor >
                    _proposals[proposalId].votesAgainst),
            "DAO: proposal already exists"
        );

        _proposals[proposalId] = Proposal({
            timeStart: uint128(block.timestamp),
            timeEnd: uint128(block.timestamp + 900),
            maxVotingPower: _ftas.totalVotingPowerAt(block.timestamp),
            votesFor: 0,
            votesAgainst: 0
        });

        emit ProposalCreated(
            proposalId,
            msg.sender,
            targets,
            calldatas,
            _proposals[proposalId].timeStart,
            _proposals[proposalId].timeEnd,
            description
        );
    }

    function vote(
        address[] memory targets,
        bytes[] memory calldatas,
        string memory description,
        bool isFor
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
            block.timestamp < _proposals[proposalId].timeEnd,
            "DAO: proposal expired"
        );

        uint256 hashVote = uint256(
            keccak256(abi.encode(proposalId, _proposals[proposalId].timeStart))
        );
        require(!_votes[hashVote][msg.sender], "DAO: already voted");

        uint256 amount = _ftas.votingPowerOfAt(
            msg.sender,
            _proposals[proposalId].timeStart
        );
        if (isFor) _proposals[proposalId].votesFor += amount;
        else _proposals[proposalId].votesAgainst += amount;

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
            block.timestamp > _proposals[proposalId].timeEnd,
            "DAO: proposal not ended"
        );
        require(_reachedQuorum(proposalId), "DAO: quorum not reached");
        if (
            _proposals[proposalId].votesFor >
            _proposals[proposalId].votesAgainst
        ) {
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
        delete _proposals[proposalId];
        emit ProposalExecuted(
            proposalId,
            msg.sender,
            _proposals[proposalId].votesFor >
                _proposals[proposalId].votesAgainst
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
}
