// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol"; //to mint and burn
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IWeb3MusicNativeToken.sol";
import "./interfaces/IFanToArtistStaking.sol";

contract Web3MusicNativeTokenManagement is AccessControl {
    event Mint(address indexed to, uint256 amount, address indexed sender);
    event Burn(address indexed from, uint256 amount, address indexed sender);
    event Web3MusicNativeTokenChanged(address indexed newAddress);
    event FanToArtistStakingChanged(address indexed newAddress);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant TGE_ROLE = keccak256("TGE_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant VERIFY_ARTIST_ROLE = keccak256("VERIFY_ARTIST_ROLE");
    bytes32 public constant REMOVE_ARTIST_ROLE = keccak256("REMOVE_ARTIST_ROLE");

    IWeb3MusicNativeToken private _web3MusicNativeToken;
    IFanToArtistStaking private _ftas;

    constructor(address web3MusicNativeToken_, address ftas_) {
        require(
            web3MusicNativeToken_ != address(0),
            "Web3MusicNativeTokenManagement: Web3MusicNativeToken address can not be 0"
        );
        require(
            ftas_ != address(0),
            "Web3MusicNativeTokenManagement: fanToArtistStaking address can not be 0"
        );
        _web3MusicNativeToken = IWeb3MusicNativeToken(web3MusicNativeToken_);
        _ftas = IFanToArtistStaking(ftas_);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(BURNER_ROLE, msg.sender);
        _grantRole(VERIFY_ARTIST_ROLE, msg.sender);
        _grantRole(REMOVE_ARTIST_ROLE, msg.sender);
        _grantRole(TGE_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _web3MusicNativeToken.mint(to, amount);
        emit Mint(to, amount, _msgSender());
    }

    function mint_and_lock(
        address to,
        uint256 amount,
        uint64 start,
        uint64 duration
    ) external onlyRole(TGE_ROLE) {
        _web3MusicNativeToken.mint_and_lock(to, amount, start, duration);
    }

    function transfer_and_lock(
        address to,
        uint256 amount,
        uint64 start,
        uint64 duration
    ) external onlyRole(TGE_ROLE) {
        _web3MusicNativeToken.transferFrom(msg.sender, address(this), amount);
        _web3MusicNativeToken.transfer_and_lock(to, amount, start, duration);
    }

    // note that with burn you do not burn the tokens of the caller(msg.sender) but of the current contract(Web3MusicNativeTokenManament)
    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        _web3MusicNativeToken.burn(amount);
        emit Burn(address(this), amount, _msgSender());
    }

    function burnFrom(
        address account,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _web3MusicNativeToken.burnFrom(account, amount);
        emit Burn(account, amount, _msgSender());
    }

    function transferWeb3MusicNativeToken(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _web3MusicNativeToken.transferOwnership(to);
    }

    function transferFanToArtistStaking(
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas.transferOwnership(to);
    }

    function addArtist(
        address[] calldata artist
    ) external onlyRole(VERIFY_ARTIST_ROLE) {
        for (uint256 i = 0; i < artist.length; i++) {
            _ftas.addArtist(artist[i], _msgSender());
        }
    }

    function removeArtist(
        address[] calldata artist
    ) external onlyRole(REMOVE_ARTIST_ROLE) {
        for (uint256 i = 0; i < artist.length; i++) {
            _ftas.removeArtist(artist[i], _msgSender());
        }
    }

    function pauseWeb3MusicNativeToken() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _web3MusicNativeToken.pause();
    }

    function unpauseWeb3MusicNativeToken()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _web3MusicNativeToken.unpause();
    }

    function changeArtistRewardRate(
        uint256 rate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _ftas.changeArtistRewardRate(rate, _msgSender());
    }

    function changeWeb3MusicNativeToken(
        address web3MusicNativeToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            web3MusicNativeToken != address(0),
            "Web3MusicNativeTokenManagement: Web3MusicNativeToken address can not be 0"
        );
        _web3MusicNativeToken = IWeb3MusicNativeToken(web3MusicNativeToken);
        emit Web3MusicNativeTokenChanged(web3MusicNativeToken);
    }

    function changeFTAS(address ftas) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            ftas != address(0),
            "Web3MusicNativeTokenManagement: fanToArtistStaking address can not be 0"
        );
        _ftas = IFanToArtistStaking(ftas);
        emit FanToArtistStakingChanged(ftas);
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
