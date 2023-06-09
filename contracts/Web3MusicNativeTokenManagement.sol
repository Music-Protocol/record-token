// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol"; //to mint and burn
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";
import "./interfaces/IFanToArtistStaking.sol";
import "./interfaces/IDEXLFactory.sol";

contract Web3MusicNativeTokenManagement is AccessControl {
    event Mint(address indexed to, uint256 amount, address indexed sender);
    event Burn(address indexed from, uint256 amount, address indexed sender);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant FACTORY_MANAGER = keccak256("FACTORY_MANAGER");
    bytes32 public constant VERIFY_ARTIST_ROLE =
        keccak256("VERIFY_ARTIST_ROLE");
    bytes32 public constant REMOVE_ARTIST_ROLE =
        keccak256("REMOVE_ARTIST_ROLE");

    IWeb3MusicNativeToken private _Web3MusicNativeToken;
    IFanToArtistStaking private _ftas;
    IDEXLFactory private _dexl;

    constructor(address Web3MusicNativeToken, address ftas, address dexl) {
        require(Web3MusicNativeToken != address(0), "Web3MusicNativeTokenManagement: Web3MusicNativeToken address can not be 0");
        _Web3MusicNativeToken = IWeb3MusicNativeToken(Web3MusicNativeToken);
        // Grant the minter role to a specified account
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);

        require(
            ftas != address(0),
            "Web3MusicNativeTokenManagement: fanToArtistStaking address can not be 0"
        );
        _ftas = IFanToArtistStaking(ftas);
        //Grant role to add and remove address on FanToArtistStaking->verifiedArtists[]
        _grantRole(VERIFY_ARTIST_ROLE, msg.sender);
        _grantRole(REMOVE_ARTIST_ROLE, msg.sender);

        require(
            dexl != address(0),
            "Web3MusicNativeTokenManagement: DEXLFactory address can not be 0"
        );
        _dexl = IDEXLFactory(dexl);
        _grantRole(FACTORY_MANAGER, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _Web3MusicNativeToken.mint(to, amount);
        emit Mint(to, amount, _msgSender());
    }

    // note that with burn you do not burn the tokens of the caller(msg.sender) but of the current contract(Web3MusicNativeTokenManament)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _Web3MusicNativeToken.burn(amount);
        emit Burn(address(this), amount, _msgSender());
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _Web3MusicNativeToken.burnFrom(account, amount);
        emit Burn(account, amount, _msgSender());
    }

    function transferWeb3MusicNativeToken(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _Web3MusicNativeToken.transferOwnership(to);
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
    ) external onlyRole(REMOVE_ARTIST_ROLE) {
        _ftas.removeArtist(artist, _msgSender());
    }

    function pauseWeb3MusicNativeToken() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _Web3MusicNativeToken.pause();
    }

    function unpauseWeb3MusicNativeToken() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _Web3MusicNativeToken.unpause();
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

    function changeWeb3MusicNativeToken(address Web3MusicNativeToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(Web3MusicNativeToken != address(0), "Web3MusicNativeTokenManagement: Web3MusicNativeToken address can not be 0");
        _Web3MusicNativeToken = IWeb3MusicNativeToken(Web3MusicNativeToken);
    }

    function changeFTAS(address ftas) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            ftas != address(0),
            "Web3MusicNativeTokenManagement: fanToArtistStaking address can not be 0"
        );
        _ftas = IFanToArtistStaking(ftas);
    }

    function changeDEXLFactory(
        address dexl
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            dexl != address(0),
            "Web3MusicNativeTokenManagement: DEXLFactory address can not be 0"
        );
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
                "Web3MusicNativeTokenManagement: call reverted without message"
            );
        }
    }
}
