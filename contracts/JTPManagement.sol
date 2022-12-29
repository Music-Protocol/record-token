// SPDX-License-Identifier: MIT

pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol"; //to mint and burn

//import interface of JTP(erc20) to call mint and burn

//the interfaces of JTP that we need to call on
interface IJTP {
    function mint(address to, uint256 amount) external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function transferOwnership(address to) external;
}

interface IFTAS {
    function addArtist(address artist, address sender) external;

    function removeArtist(address artist, address sender) external;

    function transferOwnership(address to) external;
}

contract JTPManagement is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant VERIFY_ARTIST_ROLE =
        keccak256("VERIFY_ARTIST_ROLE");

    IJTP private jtp;
    IFTAS private ftas;

    constructor(address _jtp, address _ftas) {
        //set jtp
        jtp = IJTP(_jtp);
        // Grant the minter role to a specified account
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);

        //set FanToArtistStaking
        ftas = IFTAS(_ftas);
        //Grant role to add and remove address on FanToArtistStaking->verifiedArtists[]
        _grantRole(VERIFY_ARTIST_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        jtp.mint(to, amount);
    }

    // note that with burn you do not burn the tokens of the caller(msg.sender) but of the current contract(JTPManament)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        jtp.burn(amount);
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        jtp.burnFrom(account, amount);
    }

    function transferJTP(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        jtp.transferOwnership(to);
    }

    function transferFanToArtistStaking(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ftas.transferOwnership(to);
    }

    function addArtist(address artist) external onlyRole(VERIFY_ARTIST_ROLE) {
        ftas.addArtist(artist, _msgSender());
    }

    function removeArtist(address artist) external onlyRole(VERIFY_ARTIST_ROLE) {
        ftas.removeArtist(artist, _msgSender());
    }
}
