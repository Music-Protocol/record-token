// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol"; //to mint and burn
import "./interfaces/IJTP.sol";
import "./interfaces/IFanToArtistStaking.sol";

interface IFTAS {
    function addArtist(address artist, address sender) external;

    function removeArtist(address artist, address sender) external;

    function transferOwnership(address to) external;
}

contract JTPManagement is AccessControl {
    event Mint(address indexed to, uint256 amount, address indexed sender);
    event Burn(address indexed from, uint256 amount, address indexed sender);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant VERIFY_ARTIST_ROLE =
        keccak256("VERIFY_ARTIST_ROLE");

    IJTP private _JTP;
    IFanToArtistStaking private _FTAS;

    constructor(address _jtp, address _ftas) {
        //set jtp
        _JTP = IJTP(_jtp);
        // Grant the minter role to a specified account
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);

        //set FanToArtistStaking
        _FTAS = IFanToArtistStaking(_ftas);
        //Grant role to add and remove address on FanToArtistStaking->verifiedArtists[]
        _grantRole(VERIFY_ARTIST_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _JTP.mint(to, amount);
        emit Mint(to, amount, _msgSender());
    }

    // note that with burn you do not burn the tokens of the caller(msg.sender) but of the current contract(JTPManament)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _JTP.burn(amount);
        emit Burn(address(this), amount, _msgSender());
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _JTP.burnFrom(account, amount);
        emit Burn(account, amount, _msgSender());
    }

    function transferJTP(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _JTP.transferOwnership(to);
    }

    function transferFanToArtistStaking(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _FTAS.transferOwnership(to);
    }

    function addArtist(address artist) external onlyRole(VERIFY_ARTIST_ROLE) {
        _FTAS.addArtist(artist, _msgSender());
    }

    function removeArtist(
        address artist
    ) external onlyRole(VERIFY_ARTIST_ROLE) {
        _FTAS.removeArtist(artist, _msgSender());
    }

    function pauseJTP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _JTP.pause();
    }

    function unpauseJTP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _JTP.unpause();
    }
}
