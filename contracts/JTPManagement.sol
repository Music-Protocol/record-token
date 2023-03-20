// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/AccessControl.sol"; //to mint and burn
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "./interfaces/IDEXLFactory.sol";

contract JTPManagement is AccessControl {
    event Mint(address indexed to, uint256 amount, address indexed sender);
    event Burn(address indexed from, uint256 amount, address indexed sender);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant FACTORY_MANAGER = keccak256("FACTORY_MANAGER");
    bytes32 public constant VERIFY_ARTIST_ROLE =
        keccak256("VERIFY_ARTIST_ROLE");

    IJTP private _jtp;
    IFanToArtistStaking private _ftas;
    IDEXLFactory private _dexl;

    constructor(address jtp, address ftas, address dexl) {
        //set jtp
        _jtp = IJTP(jtp);
        // Grant the minter role to a specified account
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);

        //set FanToArtistStaking
        _ftas = IFanToArtistStaking(ftas);
        //Grant role to add and remove address on FanToArtistStaking->verifiedArtists[]
        _grantRole(VERIFY_ARTIST_ROLE, msg.sender);

        //set DEXLFactory
        _dexl = IDEXLFactory(dexl);
        _grantRole(FACTORY_MANAGER, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _jtp.mint(to, amount);
        emit Mint(to, amount, _msgSender());
    }

    // note that with burn you do not burn the tokens of the caller(msg.sender) but of the current contract(JTPManament)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _jtp.burn(amount);
        emit Burn(address(this), amount, _msgSender());
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _jtp.burnFrom(account, amount);
        emit Burn(account, amount, _msgSender());
    }

    function transferJTP(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _jtp.transferOwnership(to);
    }

    function transferFanToArtistStaking(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas.transferOwnership(to);
    }

    function transferDEXLFactory(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _dexl.transferOwnership(to);
    }

    function addArtist(address artist) external onlyRole(VERIFY_ARTIST_ROLE) {
        _ftas.addArtist(artist, _msgSender());
    }

    function removeArtist(
        address artist
    ) external onlyRole(VERIFY_ARTIST_ROLE) {
        _ftas.removeArtist(artist, _msgSender());
    }

    function pauseJTP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _jtp.pause();
    }

    function unpauseJTP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _jtp.unpause();
    }

    function approveProposal(
        uint256 index
    ) external onlyRole(FACTORY_MANAGER) returns (address) {
        return _dexl.approveProposal(index);
    }

    function declineProposal(uint256 index) external onlyRole(FACTORY_MANAGER) {
        _dexl.declineProposal(index);
    }

    function changeDEXLRewardRate(
        uint256 rate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _dexl.changeRewardRate(rate);
    }

    function changeArtistRewardRate(
        uint256 rate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas.changeArtistRewardRate(rate, _msgSender());
    }

    function changeJTP(address jtp) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _jtp = IJTP(jtp);
    }

    function changeFTAS(address ftas) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas = IFanToArtistStaking(ftas);
    }

    function changeDEXLFactory(
        address dexl
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _dexl = IDEXLFactory(dexl);
    }

    function custom(
        address[] memory targets,
        bytes[] memory calldatas
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < targets.length; ++i) {
            (bool success, bytes memory returndata) = targets[i].call(
                calldatas[i]
            );
            Address.verifyCallResult(
                success,
                returndata,
                "JTPManagement: call reverted without message"
            );
        }
    }
}
